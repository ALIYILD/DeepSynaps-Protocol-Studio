// pages-research-evidence-frontend.test.js
// DeepDive 3/4 — Frontend + Evidence wiring regression tests
// Tests added by agent/coordinator/t_a588fec1 (2026-05-09)
//
// Run with: node --test apps/web/src/pages-research-evidence-frontend.test.js
// These use static source-scan assertions (no DOM, no API calls) — safe in CI.

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

// ── Evidence-linked claims function ──────────────────────────────────────────

test('_renderEvidenceLinkedClaims function exists and renders PMID hyperlinks when papers have pmid', () => {
  const src = read('./pages-research-evidence.js');
  assert.match(src, /_renderEvidenceLinkedClaims/, 'function must be present');
  assert.match(src, /pubmed\.ncbi\.nlm\.nih\.gov.*esc\(.*pmid.*\)/, 'PMID hyperlink template present');
  assert.match(src, /doi\.org.*esc\(.*doi.*\)/, 'DOI hyperlink template present');
});

test('_renderEvidenceLinkedClaims renders honest empty state when no papers', () => {
  const src = read('./pages-research-evidence.js');
  // When linked.length === 0, the function must render the honest clinician-judgment notice
  assert.match(src, /No evidence — clinician judgment required/, 'empty-state must use honest clinician-judgment wording');
  assert.match(src, /Evidence-linked claims/, 'section heading must be present');
  assert.match(src, /independently retrieve and appraise primary literature/, 'actionable guidance for clinician must appear');
});

test('_renderEvidenceLinkedClaims never fabricates identifiers — conditional guards on pmid and doi', () => {
  const src = read('./pages-research-evidence.js');
  // Guard: PMID link only when paper.pmid present
  assert.match(src, /if \(p\.pmid\).*idParts\.push/s, 'PMID link conditional on p.pmid');
  // Guard: DOI link only when paper.doi present
  assert.match(src, /if \(p\.doi\).*idParts\.push/s, 'DOI link conditional on p.doi');
});

test('_renderEvidenceLinkedClaims is called inside renderIndicationsSpine with detail.papers', () => {
  const src = read('./pages-research-evidence.js');
  assert.match(src, /_renderEvidenceLinkedClaims\(detail\.papers/, 'must call with detail.papers from indication detail API');
  assert.match(src, /evidenceLinkedClaimsHtml/, 'variable must exist');
  assert.match(src, /headerHtml \+ evidenceLinkedClaimsHtml/, 'must be included in detailEl.innerHTML assembly');
});

// ── _renderPaperRow PMID/DOI chip enhancement ─────────────────────────────

test('_renderPaperRow shows PMID chip when paper has pmid', () => {
  const src = read('./pages-research-evidence.js');
  assert.match(
    src,
    /PMID \$\{esc\(pmid\)\}/,
    '_renderPaperRow must render PMID identifier chip'
  );
  assert.match(
    src,
    /pubmed\.ncbi\.nlm\.nih\.gov.*esc\(pmid\)/,
    '_renderPaperRow must link to PubMed'
  );
});

test('_renderPaperRow shows DOI chip when paper has doi', () => {
  const src = read('./pages-research-evidence.js');
  assert.match(
    src,
    /doi\.org.*esc\(doi\)/,
    '_renderPaperRow must link to DOI resolver'
  );
  assert.match(
    src,
    /DOI.*↗/,
    '_renderPaperRow DOI link must show arrow indicator'
  );
});

test('_renderPaperRow shows honest empty identifier state when no pmid and no doi', () => {
  const src = read('./pages-research-evidence.js');
  assert.match(
    src,
    /No direct identifier — clinician judgment required for source verification/,
    '_renderPaperRow must show honest judgment notice when no identifier available'
  );
});

// ── No-evidence fallbackBanner ────────────────────────────────────────────

test('renderIndicationsSpine fallbackBanner uses clinician-judgment wording not just FTS prompt', () => {
  const src = read('./pages-research-evidence.js');
  assert.match(
    src,
    /No evidence — clinician judgment required/,
    'fallbackBanner must say "No evidence — clinician judgment required"'
  );
  assert.match(
    src,
    /Clinician judgment and independent primary literature retrieval/,
    'fallbackBanner must reference independent literature retrieval'
  );
  // Should no longer use the old "No curated papers yet for this indication" phrasing alone
  assert.doesNotMatch(
    src,
    /No curated papers yet for this indication/,
    'old FTS-only wording must be replaced'
  );
});

// ── Agent-brain mount (carried from parent task t_013ee166) ───────────────

test('agent-brain-status mount point and mountAgentBrainStatus call are present', () => {
  const src = read('./pages-research-evidence.js');
  assert.match(src, /id="agent-brain-status"/, 'mount div must be present');
  assert.match(src, /mountAgentBrainStatus/, 'mountAgentBrainStatus call must be present');
  assert.match(src, /providers.*assessment/, 'must wire to assessment provider');
});

// ── Dataset constant honesty ──────────────────────────────────────────────

test('EVIDENCE_TOTAL_TRIALS bundled constant matches DB value of 1409 not stale 12840', () => {
  const ds = read('./evidence-dataset.js');
  assert.match(ds, /EVIDENCE_TOTAL_TRIALS\s*=\s*1409/, 'constant must be 1409 — matches v4 DB trial count');
  assert.doesNotMatch(ds, /EVIDENCE_TOTAL_TRIALS\s*=\s*12840/, 'stale 12840 value must not be present');
});

// ── Evidence search result card PMID/DOI (existing pattern regression) ────

test('renderEvidenceResultCard only renders PMID link when raw.pmid is present', () => {
  const src = read('./pages-research-evidence.js');
  // The guard: pmid = raw.pmid ? ... : '' then if (pmid) push link
  assert.match(src, /const pmid = raw\.pmid/, 'pmid extracted from raw record only when present');
  assert.match(src, /if \(pmid\).*links\.push.*pubmed/s, 'PMID link conditional on pmid being non-empty');
});

test('renderEvidenceResultCard only renders DOI link when raw.doi is present', () => {
  const src = read('./pages-research-evidence.js');
  assert.match(src, /const doi = raw\.doi/, 'doi extracted from raw record only when present');
  assert.match(src, /if \(doi\).*links\.push.*doi\.org/s, 'DOI link conditional on doi being non-empty');
});
