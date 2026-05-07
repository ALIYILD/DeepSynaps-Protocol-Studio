/**
 * Phenotype Analyzer — doctor-ready hardening tests.
 * Safety copy, governance wording, role gates, export contracts, demo honesty.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { canUsePhenotypeAnalyzerWorkspace } from './pages-phenotype-analyzer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(__dirname, 'pages-phenotype-analyzer.js'), 'utf8');
const FIXTURES = readFileSync(join(__dirname, 'demo-fixtures-analyzers.js'), 'utf8');

/* ── 1. Governance copy ─────────────────────────────────────────────────── */

test('phenotype analyzer avoids autonomous diagnosis and treatment-selection claims', () => {
  assert.match(SRC, /hypothesis/i);
  assert.match(SRC, /not a confirmed diagnosis|not a system-confirmed diagnosis/i);
  assert.ok(!/best protocol/i.test(SRC));
  assert.ok(!/eligible for (tms|tdcs|treatment)/i.test(SRC));
});

test('empty clinic state does not imply no clinical concern', () => {
  assert.match(SRC, /does\s+<strong>not<\/strong>\s+mean[\s\S]*no clinical concern/i);
});

test('page documents backend scope (assignments + audit)', () => {
  assert.match(SRC, /phenotype-assignments/);
  assert.match(SRC, /postPhenotypeAuditEvent/);
  assert.match(SRC, /listPhenotypeAuditEvents/);
});

test('registry panel reframes modality lists as non-prescriptive', () => {
  assert.match(SRC, /Modality families sometimes discussed in literature/);
  assert.match(SRC, /non-prescriptive/);
});

/* ── 2. Role gate ───────────────────────────────────────────────────────── */

test('phenotype analyzer role gate allows clinician and admin only', () => {
  assert.equal(canUsePhenotypeAnalyzerWorkspace('clinician'), true);
  assert.equal(canUsePhenotypeAnalyzerWorkspace('admin'), true);
  assert.equal(canUsePhenotypeAnalyzerWorkspace('patient'), false);
  assert.equal(canUsePhenotypeAnalyzerWorkspace('technician'), false);
  assert.equal(canUsePhenotypeAnalyzerWorkspace('', { allowUnknown: true }), true);
});

/* ── 3. setTopbar contract ──────────────────────────────────────────────── */

test('setTopbar receives string argument (not object)', () => {
  assert.ok(!/setTopbar\(\s*\{/s.test(SRC), 'setTopbar must not be called with an object literal');
  assert.match(SRC, /setTopbar\s*\(\s*['"]Phenotype Analyzer['"]/);
});

/* ── 4. Assignment removal disclaimer ───────────────────────────────────── */

test('remove-assignment confirm explains scope (documentation row only)', () => {
  assert.match(SRC, /removes the documentation row only/i);
  assert.match(SRC, /source recordings remain/i);
});

/* ── 5. Demo fixture honesty ────────────────────────────────────────────── */

test('demo fixtures honestly tagged in governance panel', () => {
  assert.match(SRC, /Demo registry slice/i);
});

test('demo fixture banner shown conditionally', () => {
  assert.match(SRC, /DEMO_FIXTURE_BANNER_HTML/);
});

/* ── 6. Export contracts ────────────────────────────────────────────────── */

test('JSON export includes governance disclaimer', () => {
  assert.match(SRC, /governance_note.*clinician-reviewed documentation only; not a diagnosis/);
});

test('CSV export function exists and builds headers', () => {
  assert.match(SRC, /function _buildPhenotypeCsv/);
  assert.match(SRC, /patient_id.*patient_name.*phenotype_id.*phenotype_name.*domain.*confidence.*rationale.*assigned_at.*clinician_id/);
});

test('Markdown export function exists and includes governance note', () => {
  assert.match(SRC, /function _buildPhenotypeMarkdown/);
  assert.match(SRC, /Governance note.*hypothesis labels for team alignment/);
});

test('all three export formats wired in patient detail UI', () => {
  assert.match(SRC, /data-action="export-summary"/);
  assert.match(SRC, /data-action="export-csv"/);
  assert.match(SRC, /data-action="export-md"/);
});

/* ── 7. Confidence distribution panel ───────────────────────────────────── */

test('confidence distribution panel renders high/moderate/low bars', () => {
  assert.match(SRC, /function _renderConfidenceDistribution/);
  assert.match(SRC, /High.*Moderate.*Low/s);
});

test('confidence distribution includes explanatory disclaimer', () => {
  assert.match(SRC, /does not imply diagnostic certainty/i);
});

/* ── 8. Co-occurrence panel ─────────────────────────────────────────────── */

test('co-occurrence panel exists and explains clinical limits', () => {
  assert.match(SRC, /function _renderCooccurrencePanel/);
  assert.match(SRC, /not diagnostic comorbidity/i);
});

test('co-occurrence panel handles insufficient data gracefully', () => {
  assert.match(SRC, /At least 2 assignments required/);
});

/* ── 9. Data matrix empty-state language ────────────────────────────────── */

test('data matrix empty states avoid all-clear reassurance', () => {
  assert.match(SRC, /none linked.*can mean data lives elsewhere/i);
  assert.match(SRC, /not[\s\S]*?reassurance of absence of need for care/i);
});

/* ── 10. Audit non-blocking ─────────────────────────────────────────────── */

test('audit emission is non-blocking (catch swallow)', () => {
  assert.match(SRC, /void _emitPageAudit/);
  assert.match(SRC, /catch\s*\{[\s\S]*?\/\*\s*non-blocking\s*\*\//);
});

/* ── 11. Form validation ────────────────────────────────────────────────── */

test('assignment form validates phenotype_id from registry', () => {
  assert.match(SRC, /Pick a hypothesis label from the registry list/);
});

test('assignment form requires clinician role', () => {
  assert.match(SRC, /Your role cannot record phenotype hypothesis labels/);
});

/* ── 12. Registry panel safety copy ─────────────────────────────────────── */

test('registry panel labels itself as reference not diagnosis', () => {
  assert.match(SRC, /Registry reference/);
  assert.match(SRC, /<strong>not<\/strong>\s+a system diagnosis/);
});

/* ── 13. Quick links safety copy ────────────────────────────────────────── */

test('quick links panel labels deeptwin and protocol studio as draft context', () => {
  assert.match(SRC, /draft context/i);
  assert.match(SRC, /not autonomous treatment or protocol approval/i);
});

/* ── 14. Demo fixture patients present ──────────────────────────────────── */

test('demo fixtures include all 5 patients with phenotype assignments', () => {
  assert.match(FIXTURES, /demo-pt-samantha-li/);
  assert.match(FIXTURES, /demo-pt-marcus-chen/);
  assert.match(FIXTURES, /demo-pt-elena-vasquez/);
  assert.match(FIXTURES, /demo-pt-omar-haddad/);
  assert.match(FIXTURES, /demo-pt-amelia-brown/);
});

test('omar haddad has multiple phenotype assignments with varied confidence', () => {
  assert.match(FIXTURES, /demo-pha-omar-1/);
  assert.match(FIXTURES, /demo-pha-omar-2/);
  assert.match(FIXTURES, /demo-pha-omar-3/);
});

test('amelia brown has multiple phenotype assignments with low-confidence entry', () => {
  assert.match(FIXTURES, /demo-pha-amelia-1/);
  assert.match(FIXTURES, /demo-pha-amelia-2/);
  assert.match(FIXTURES, /demo-pha-amelia-3/);
  assert.match(FIXTURES, /confidence.*low[\s\S]*?demo-pha-amelia/s);
});
