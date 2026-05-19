/**
 * Alignment test for `pub.hero.headline` across the 5 reviewed locales.
 *
 * Background: PR #1069 swapped a marketing-overclaim phrase for
 * "measurable outcome" in the English headline and added a tree-wide
 * governance-language audit (see governance-language-audit.test.js).
 * The 4 non-English translations (TR / ES / FR / DE) were left for native-
 * speaker review and still carried the overclaim wording. This follow-up
 * swap aligns them with the English headline.
 *
 * This test guards against regressions by asserting that:
 *   1. The English `pub.hero.headline` no longer says "proven".
 *   2. None of the TR / ES / FR / DE headlines contain the language-specific
 *      "proven" equivalents we swapped out.
 *   3. All 5 reviewed `pub.hero.headline` entries are present in i18n.js
 *      (the file actually ships 6 — Portuguese is intentionally not
 *      covered by this PR, so the assertion is "at least 5").
 *
 * Run: node --test src/i18n-hero-headline-alignment.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const I18N_PATH = path.resolve(__dirname, 'i18n.js');

function readI18n() {
  return fs.readFileSync(I18N_PATH, 'utf8');
}

function findHeadlines(contents) {
  // Capture the value of every `pub.hero.headline` entry — single-quoted
  // string after the key. We intentionally only handle the single-quote
  // form because that's the convention used throughout i18n.js.
  const re = /'pub\.hero\.headline':\s*'([^']*)'/g;
  const headlines = [];
  let match;
  while ((match = re.exec(contents)) !== null) {
    headlines.push(match[1]);
  }
  return headlines;
}

test('i18n.js still contains at least 5 pub.hero.headline entries', () => {
  const contents = readI18n();
  const headlines = findHeadlines(contents);
  assert.ok(
    headlines.length >= 5,
    `Expected ≥5 pub.hero.headline entries, found ${headlines.length}`,
  );
});

test('no pub.hero.headline entry contains a "proven" equivalent in EN/TR/ES/FR/DE', () => {
  const contents = readI18n();
  const headlines = findHeadlines(contents);

  // Language-specific forbidden tokens, case-insensitive. These are the
  // exact words that PR #1069 rewrote (English) plus the equivalents the
  // follow-up PR rewrote in TR / ES / FR / DE.
  const FORBIDDEN_TOKENS = [
    'proven',         // English
    'kanıtlanmış',    // Turkish
    'comprobados',    // Spanish
    'prouvé',         // French
    'nachgewiesenen', // German
  ];

  const offenders = [];
  for (const headline of headlines) {
    const lower = headline.toLowerCase();
    for (const token of FORBIDDEN_TOKENS) {
      if (lower.includes(token.toLowerCase())) {
        offenders.push({ token, headline });
      }
    }
  }

  if (offenders.length === 0) {
    assert.ok(true);
    return;
  }
  const report = offenders
    .map((o) => `  "${o.token}" → ${o.headline}`)
    .join('\n');
  assert.fail(
    `Found ${offenders.length} pub.hero.headline entries still containing ` +
    `"proven"-equivalent language:\n${report}\n\n` +
    'Replace with the "measurable outcome" equivalent in that locale ' +
    'per PR #1069 / the marketing-overclaim governance policy.',
  );
});

test('each reviewed locale\'s pub.hero.headline contains its "measurable" equivalent', () => {
  const contents = readI18n();
  const headlines = findHeadlines(contents);

  // Tokens that MUST appear in at least one headline each — confirms the
  // positive replacement landed, not just that the forbidden word vanished.
  const REQUIRED_TOKENS = [
    'measurable',  // English
    'ölçülebilir', // Turkish
    'medibles',    // Spanish
    'mesurable',   // French
    'messbaren',   // German (dative form after "bis zum")
  ];

  const joined = headlines.join('\n').toLowerCase();
  const missing = REQUIRED_TOKENS.filter(
    (t) => !joined.includes(t.toLowerCase()),
  );

  assert.deepEqual(
    missing,
    [],
    `Missing "measurable" equivalents in headlines: ${missing.join(', ')}`,
  );
});
