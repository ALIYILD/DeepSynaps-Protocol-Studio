/**
 * Regression guard: avoid reviving stale fixed corpus marketing in shipped JS.
 * Historical variants used digit+"k" paper-count claims; live UX must use GET /api/v1/evidence/status.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));

function* walkJs(dir) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) yield* walkJs(p);
    else if (ent.name.endsWith('.js')) yield p;
  }
}

test('apps/web/src JS must not reintroduce stale corpus count marketing tokens', () => {
  const eightySeven = String.fromCharCode(56, 55);
  const legacyKClaim = new RegExp(`\\b${eightySeven}k\\b`, 'i');
  const legacyCommaThousands = `${eightySeven},000`;
  const fixed185kMarketing = /\b185k\b/i;

  const skip = new Set([
    join(__dirname, 'evidence-corpus-wording-regressions.test.js'),
  ]);

  for (const abs of walkJs(__dirname)) {
    if (skip.has(abs)) continue;
    const src = readFileSync(abs, 'utf8');
    assert.ok(
      !src.includes(legacyCommaThousands),
      `${abs}: remove legacy comma-separated thousand paper claims`,
    );
    assert.ok(!legacyKClaim.test(src), `${abs}: remove legacy digit+k corpus marketing`);
    assert.ok(!fixed185kMarketing.test(src), `${abs}: avoid fixed "185k" marketing — use status endpoint counts`);
  }
});
