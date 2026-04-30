// Phase 14C — sanity check that the Open Graph social-card asset
// referenced by the marketplace landing page meta tags actually exists,
// is a valid PNG, has the expected 1200x630 dimensions, and is not a
// 0-byte placeholder. Pairs with apps/web/scripts/generate-og-image.py.
//
// Asset URL (Phase 12C meta tags):
//   https://deepsynaps-studio-preview.netlify.app/og-marketplace.png
//
// Source-of-truth on disk (served by Vite from `public/`):
//   apps/web/public/og-marketplace.png

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSET_PATH = join(__dirname, '..', 'public', 'og-marketplace.png');

// PNG signature: 89 50 4E 47 0D 0A 1A 0A  (the canonical 8-byte header)
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test('og-marketplace.png exists on disk', () => {
  let stat;
  try {
    stat = statSync(ASSET_PATH);
  } catch (err) {
    assert.fail(
      `Expected OG image at ${ASSET_PATH} but stat() failed: ${err.message}. ` +
        `Re-run apps/web/scripts/generate-og-image.py to regenerate it.`,
    );
  }
  assert.ok(stat.isFile(), `${ASSET_PATH} exists but is not a regular file`);
});

test('og-marketplace.png is larger than 1 KB (not a 0-byte placeholder)', () => {
  const { size } = statSync(ASSET_PATH);
  assert.ok(
    size > 1000,
    `OG image is suspiciously small (${size} bytes) — generator likely failed`,
  );
});

test('og-marketplace.png starts with the PNG signature', () => {
  const buf = readFileSync(ASSET_PATH);
  assert.ok(buf.length >= 8, 'file is shorter than the 8-byte PNG header');
  const header = buf.subarray(0, 8);
  assert.deepEqual(
    Array.from(header),
    Array.from(PNG_SIGNATURE),
    `PNG signature mismatch: got ${header.toString('hex')}, expected ${PNG_SIGNATURE.toString('hex')}`,
  );
});

test('og-marketplace.png IHDR reports 1200x630 dimensions', () => {
  // PNG layout: 8-byte signature, then chunks. The first chunk MUST be
  // IHDR per the PNG spec. IHDR chunk layout:
  //   bytes  0..3   chunk length (always 13 for IHDR)
  //   bytes  4..7   chunk type ("IHDR")
  //   bytes  8..11  width  (UInt32BE)
  //   bytes 12..15  height (UInt32BE)
  //
  // Relative to the start of the file, the first IHDR chunk begins at
  // offset 8, so width is at offset 8+8 = 16 and height at 8+12 = 20.
  const buf = readFileSync(ASSET_PATH);
  const chunkType = buf.subarray(12, 16).toString('ascii');
  assert.equal(chunkType, 'IHDR', `expected first chunk to be IHDR, got "${chunkType}"`);
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  assert.equal(width, 1200, `OG image width should be 1200, got ${width}`);
  assert.equal(height, 630, `OG image height should be 630, got ${height}`);
});
