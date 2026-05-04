/**
 * Regression checks for Digital Phenotyping Analyzer UI contract and safety copy.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { demoDigitalPhenotypingPayload } from './demo-fixtures-analyzers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function readPageSrc() {
  return readFileSync(resolve(__dirname, 'pages-digital-phenotyping-analyzer.js'), 'utf8');
}

test('demoDigitalPhenotypingPayload has snapshot keys and multimodal links', () => {
  const p = demoDigitalPhenotypingPayload('demo-pt-samantha-li');
  assert.equal(p.patient_id, 'demo-pt-samantha-li');
  assert.ok(p.snapshot?.mobility_stability?.value != null);
  assert.ok(p.snapshot?.data_completeness?.value != null);
  assert.equal(p.provenance?.source_system, 'demo_sample');
  const pages = (p.multimodal_links || []).map((l) => l.nav_page_id);
  assert.ok(pages.includes('research-evidence'));
  assert.ok(pages.includes('qeeg-analysis'));
  assert.ok(pages.includes('risk-analyzer'));
  assert.ok(pages.includes('session-execution'));
  assert.ok(pages.includes('live-session'));
  assert.ok(pages.includes('protocol-studio'));
  assert.ok(pages.includes('deeptwin'));
  assert.ok(pages.includes('ai-agent-v2'));
});

test('required governance copy is present on the page module', () => {
  const src = readPageSrc();
  assert.match(
    src,
    /Digital phenotype outputs are exploratory decision-support cues/,
    'required governance sentence must be present',
  );
});

test('page source avoids banned clinical / protocol-selection wording', () => {
  const src = readPageSrc();
  const banned = [
    'best protocol',
    'demo_fixture',
    'non-adherent',
    'eligible for treatment',
    'surveillance detected',
    'diagnosis likely',
    'confirmed phenotype',
  ];
  const lower = src.toLowerCase();
  for (const b of banned) {
    assert.ok(!lower.includes(b), `must not contain blocked phrase: ${b}`);
  }
  assert.ok(
    !/"all clear"/i.test(src) && !/>all clear</i.test(src),
    'must not show all-clear empty state phrasing',
  );
});

test('digital phenotyping page gates non-clinical roles', () => {
  const src = readPageSrc();
  assert.match(src, /role !== 'clinician' && role !== 'admin'/);
});
