import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function read(rel) {
  return readFileSync(resolve(__dirname, rel), 'utf8');
}

test('Research Evidence page exposes governance banner and live evidence panel', () => {
  const src = read('./pages-research-evidence.js');
  assert.match(src, /controlled preview evidence workspace/i);
  assert.match(src, /Bundled registry rollups are for navigation and preview context/i);
  assert.match(src, /Live evidence service unavailable/i);
  assert.match(src, /Live evidence service \(aggregated counts from API\)/);
  assert.match(src, /renderLiveEvidencePanel/);
  assert.match(src, /re-live-evidence-host/);
});

test('Research Evidence unified search uses honest empty, auth messaging, and corpus wiring', () => {
  const src = read('./pages-research-evidence.js');
  assert.match(src, /_libUnifiedEvidenceSearch/);
  assert.match(src, /evidenceTerminalSearch/);
  assert.match(src, /renderEvidenceResultCard/);
  assert.match(src, /No verified results found for this query in the connected evidence sources/);
  assert.match(src, /Sign in as clinical staff to search the evidence service/);
  assert.match(src, /Indexed evidence corpus available/);
  assert.match(src, /Example queries:/);
  assert.match(src, /depression rTMS/);
  assert.match(src, /re-ev-search-source/);
  assert.match(src, /Indexed evidence corpus unavailable in this preview environment/);
  assert.match(src, /No direct link available from this record/);
  assert.match(src, /Evidence basket/);
});

test('Degraded banner hides when indexed corpus flag set; status drives Indexed DB badge', () => {
  const src = read('./pages-research-evidence.js');
  assert.match(src, /indexedCorpusAvailable/);
  assert.match(src, /Indexed DB/);
  assert.match(src, /Indexed evidence corpus unavailable in this preview environment/);
});

test('Bundled evidence dataset does not ship illustrative DOI links for condition drill-down', () => {
  const ds = read('./evidence-dataset.js');
  assert.match(ds, /recentHighImpact.*length = 0/s);
  assert.match(ds, /topPublishingJournals: \[\]/);
});

test('Indications spine uses computed_evidence_grade chip (not only curated grade)', () => {
  const src = read('./pages-research-evidence.js');
  // The spine sidebar must call _computedGradeBadge on computed_evidence_grade.
  assert.match(src, /_computedGradeBadge/);
  assert.match(src, /computed_evidence_grade/);
  // The detail header must also expose computed_evidence_grade.
  assert.match(src, /ind\.computed_evidence_grade/);
  // The rubric tooltip text must be present so clinicians can hover-to-learn.
  assert.match(src, /Rubric:/);
  assert.match(src, /Recomputed nightly/);
});

test('_computedGradeBadge is defined and emits a ds-computed-grade-chip span', () => {
  const src = read('./pages-research-evidence.js');
  assert.match(src, /function _computedGradeBadge/);
  assert.match(src, /ds-computed-grade-chip/);
  // Color map must include E grade (red = speculative).
  assert.match(src, /E: '#ef4444'/);
  // The badge must use the rubric tooltip constants.
  assert.match(src, /_COMPUTED_GRADE_TOOLTIP/);
  assert.match(src, /_RUBRIC_HINT/);
});

test('Indications detail header shows both curated and computed grades', () => {
  const src = read('./pages-research-evidence.js');
  // Both badges must appear in the header block.
  assert.match(src, /ind\.computed_evidence_grade.*_computedGradeBadge|_computedGradeBadge.*ind\.computed_evidence_grade/s);
  assert.match(src, /curated/);
});
