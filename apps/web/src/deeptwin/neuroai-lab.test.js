import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, 'neuroai-lab.js');

const FORBIDDEN = [
  /\bdiagnosis confirmed\b/i,
  /\brecommended treatment\b/i,
  /\bwill improve\b/i,
  /\bcaused by protocol\b/i,
  /\bsafe to use\b/i,
];

test('NeuroAI Lab UI source avoids forbidden clinical-final phrases', () => {
  const src = readFileSync(SRC, 'utf8');
  for (const re of FORBIDDEN) {
    assert.equal(re.test(src), false, `should not match ${re}`);
  }
  assert.match(src, /research-only/i);
});
