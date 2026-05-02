/**
 * Light regression checks for Digital Phenotyping fixture shape (dr-facing UI contract).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { demoDigitalPhenotypingPayload } from './demo-fixtures-analyzers.js';

test('demoDigitalPhenotypingPayload has snapshot keys and multimodal links', () => {
  const p = demoDigitalPhenotypingPayload('demo-pt-samantha-li');
  assert.equal(p.patient_id, 'demo-pt-samantha-li');
  assert.ok(p.snapshot?.mobility_stability?.value != null);
  assert.ok(p.snapshot?.data_completeness?.value != null);
  const pages = (p.multimodal_links || []).map((l) => l.nav_page_id);
  assert.ok(pages.includes('risk-analyzer'));
  assert.ok(pages.includes('live-session'));
  assert.ok(pages.includes('protocol-studio'));
});
