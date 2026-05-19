/**
 * Slice F — Governance-language regression test.
 *
 * Walks every active source file under apps/web/src/ and fails the build
 * if any line contains a forbidden POSITIVE marketing phrase. These are
 * phrases that have no defensible clinician/patient-facing use:
 *
 *   - "is proven", "are proven", "proven outcome", "proven effective",
 *     "clinically proven"
 *   - "guaranteed response", "guaranteed outcome"
 *   - "best treatment"
 *   - "safe and effective"   (FDA-boilerplate; clinically misleading
 *                             without explicit indication context)
 *   - "definitive cure"
 *   - "100% safe"
 *
 * Negative / defensive uses ("not proven", "not guaranteed", "no risk
 * factors identified", JSDoc "Ranked list of recommended protocols")
 * are unaffected because they don't match the exact phrases above.
 *
 * Allowing a legitimate exception: add the inline marker
 *   // governance-allow: <reason>
 * on the same line as the match. Tests still pass, and the marker is
 * a visible audit signal for the reviewer.
 *
 * Run: node --test src/governance-language-audit.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Phrases that should NEVER appear in unmarked source. Case-insensitive.
const FORBIDDEN_PHRASES = Object.freeze([
  'is proven',
  'are proven',
  'proven outcome',
  'proven effective',
  'clinically proven',
  'guaranteed response',
  'guaranteed outcome',
  'best treatment',
  'safe and effective',
  'definitive cure',
  '100% safe',
]);

// Files / directories to skip (test fixtures, build artefacts, vendored code).
const SKIP_DIR_NAMES = new Set([
  'node_modules',
  'dist',
  'build',
  '.cache',
  'coverage',
]);

// Files whose contents are themselves a test of the audit machinery.
// They legitimately contain the forbidden phrases as strings, so they
// must not trigger the audit.
const SKIP_FILE_BASENAMES = new Set([
  'governance-language-audit.test.js',
]);

const SOURCE_ROOT = path.resolve(__dirname);

function* walkSources(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry.name)) continue;
      yield* walkSources(path.join(dir, entry.name));
      continue;
    }
    if (!entry.isFile()) continue;
    if (SKIP_FILE_BASENAMES.has(entry.name)) continue;
    if (!/\.(js|ts|jsx|tsx)$/.test(entry.name)) continue;
    yield path.join(dir, entry.name);
  }
}

function findViolations() {
  const violations = [];
  for (const file of walkSources(SOURCE_ROOT)) {
    let contents;
    try {
      contents = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const lines = contents.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lower = line.toLowerCase();
      // Inline opt-out marker — keep the surrounding code as-is.
      if (line.includes('governance-allow:')) continue;
      for (const phrase of FORBIDDEN_PHRASES) {
        if (lower.includes(phrase)) {
          violations.push({
            file: path.relative(SOURCE_ROOT, file),
            line: i + 1,
            phrase,
            preview: line.trim().slice(0, 140),
          });
        }
      }
    }
  }
  return violations;
}

test('apps/web/src/ contains no unmarked forbidden marketing language', () => {
  const violations = findViolations();
  if (violations.length === 0) {
    assert.ok(true);
    return;
  }
  const report = violations
    .map((v) => `  ${v.file}:${v.line} — "${v.phrase}" — ${v.preview}`)
    .join('\n');
  assert.fail(
    `Found ${violations.length} forbidden marketing-language hit(s):\n${report}\n\n` +
    'Either rewrite the line to avoid the phrase, or add an inline marker ' +
    '`// governance-allow: <reason>` if the use is genuinely defensible ' +
    '(e.g., a disclaimer that quotes the forbidden phrase verbatim).',
  );
});

test('FORBIDDEN_PHRASES contains the exact phrases the user briefed', () => {
  // Lock the list in. Any change to it should be a deliberate amendment.
  const expected = [
    'is proven',
    'are proven',
    'proven outcome',
    'proven effective',
    'clinically proven',
    'guaranteed response',
    'guaranteed outcome',
    'best treatment',
    'safe and effective',
    'definitive cure',
    '100% safe',
  ];
  assert.deepEqual([...FORBIDDEN_PHRASES], expected);
});

test('Audit walker actually scans this directory (sanity)', () => {
  // If this fails, the walker is silently skipping the tree and no
  // amount of forbidden language would be caught.
  let count = 0;
  for (const _ of walkSources(SOURCE_ROOT)) {
    count += 1;
    if (count >= 50) break;
  }
  assert.ok(count >= 50, `Walker only saw ${count} source files — expected ≥50`);
});
