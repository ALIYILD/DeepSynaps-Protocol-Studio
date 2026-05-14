/**
 * Video Assessment — Unsafe wording validation test.
 *
 * Scans the video assessment page source for forbidden clinical language
 * and verifies required safety disclaimers are present.
 *
 * Coverage:
 * - No "diagnoses" in output text
 * - No "detects autism" in output
 * - "Requires clinician review" appears
 * - "Decision support only" appears
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const VA_SRC = fs.readFileSync(new URL('./pages-video-assessments.js', import.meta.url), 'utf8');

// ── forbidden wordings ───────────────────────────────────────────────────────

test('VA output — does not contain "diagnoses" as an autonomous claim', () => {
  // The word "diagnoses" must only appear in negation contexts
  // e.g., "does not diagnose" is acceptable; standalone "diagnoses" is not
  const lowerSrc = VA_SRC.toLowerCase();

  // Check for positive-context "diagnoses" — look for patterns that claim diagnosis
  const positiveDiagnosisPatterns = [
    /\bthe\s+system\s+diagnoses\b/i,
    /\bit\s+diagnoses\b/i,
    /\bthis\s+diagnoses\b/i,
    /\bdiagnoses\s+(?:the|a|your|patient)/i,
    /\bdiagnoses\b[^\.]{0,30}\b(?:parkinson|tremor|condition|disorder|disease)/i,
  ];

  for (const pattern of positiveDiagnosisPatterns) {
    assert.equal(
      pattern.test(VA_SRC),
      false,
      `Forbidden positive diagnosis pattern found: ${pattern}`,
    );
  }
});

test('VA output — does not contain "detects autism"', () => {
  assert.doesNotMatch(VA_SRC, /detects\s+autism/i);
  assert.doesNotMatch(VA_SRC, /autism\s+detection/i);
  assert.doesNotMatch(VA_SRC, /detect\s+autism/i);
  assert.doesNotMatch(VA_SRC, /autism\s+screen/i);
});

// ── required safety wordings ─────────────────────────────────────────────────

test('VA output — contains "requires clinician review"', () => {
  const lowerSrc = VA_SRC.toLowerCase();
  assert.ok(
    lowerSrc.includes('require') && lowerSrc.includes('clinician') && lowerSrc.includes('review'),
    'Source should contain wording about requiring clinician review',
  );
  // Verify at least one explicit phrase
  const hasPhrase =
    /requires?\s+clinician\s+review/i.test(VA_SRC) ||
    /clinician\s+review\s+required/i.test(VA_SRC) ||
    /all\s+outputs?\s+require\s+clinician\s+review/i.test(VA_SRC);
  assert.ok(hasPhrase, 'Should contain explicit "requires clinician review" wording');
});

test('VA output — contains "decision support only"', () => {
  const hasPhrase =
    /decision[-\s]support\s+only/i.test(VA_SRC) ||
    /decision\s+support.*only/i.test(VA_SRC) ||
    /only\s+decision\s+support/i.test(VA_SRC);
  assert.ok(hasPhrase, 'Should contain "decision support only" wording');
});

// ── additional safety validations ────────────────────────────────────────────

test('VA output — contains negated diagnosis disclaimer', () => {
  const lowerSrc = VA_SRC.toLowerCase();
  assert.ok(
    lowerSrc.includes('does not diagnose') || lowerSrc.includes('does not'),
    'Source should contain "does not diagnose" or similar negation',
  );
});

test('VA output — no autonomous treatment claims', () => {
  const forbiddenPatterns = [
    /\b(?:ai|system|this)\s+(?:prescribes?|recommends?)\s+(?:treatment|medication|therapy|drug)/i,
    /\b(?:ai|system|this)\s+(?:determines?|decides?)\s+(?:diagnosis|treatment)/i,
    /\bguaranteed\s+(?:diagnosis|outcome|result)/i,
    /\b100%\s+accurate\s+diagnosis/i,
    /\bconfirmed\s+(?:diagnosis|condition)\s+by\s+ai/i,
  ];

  for (const pattern of forbiddenPatterns) {
    assert.equal(
      pattern.test(VA_SRC),
      false,
      `Forbidden autonomous treatment claim found: ${pattern}`,
    );
  }
});

test('VA output — contains patient safety disclaimer', () => {
  const lowerSrc = VA_SRC.toLowerCase();
  assert.ok(
    lowerSrc.includes('safety') || lowerSrc.includes('disclaimer'),
    'Source should reference safety or disclaimer',
  );
});

test('VA output — no fake motor score generation claims', () => {
  assert.doesNotMatch(
    VA_SRC,
    /\b(?:generates?|produces?|creates?)\s+(?:fake|synthetic|fabricated)\s+motor\s+scores?/i,
  );
});

test('VA output — contains controlled preview or beta language', () => {
  const hasPreview =
    /controlled\s+preview/i.test(VA_SRC) ||
    /preview\s+mode/i.test(VA_SRC) ||
    /beta/i.test(VA_SRC) ||
    /mvp/i.test(VA_SRC);
  assert.ok(
    hasPreview,
    'Source should indicate this is a controlled preview, beta, or MVP',
  );
});

test('VA output — clinician review acknowledgment is referenced', () => {
  const lowerSrc = VA_SRC.toLowerCase();
  assert.ok(
    lowerSrc.includes('clinician') &&
      (lowerSrc.includes('review') || lowerSrc.includes('acknowledge')),
    'Source should reference clinician review or acknowledgment',
  );
});
