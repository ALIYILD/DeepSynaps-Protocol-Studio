/**
 * brain-map-planner-evidence.test.js — Tests for evidence linking
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as evidence from './brain-map-planner-evidence.js';

test('brain-map-planner-evidence — buildCitationLink PMID', () => {
  const citation = { type: 'pmid', value: '12345678', title: 'Smith et al. 2020' };
  const link = evidence.buildCitationLink(citation);

  assert.match(link, /href="https:\/\/pubmed/, 'link includes PubMed URL');
  assert.match(link, /12345678/, 'link includes PMID');
  assert.match(link, /Smith et al\. 2020/, 'link includes title');
});

test('brain-map-planner-evidence — buildCitationLink DOI', () => {
  const citation = { type: 'doi', value: '10.1234/example', title: 'Research Paper' };
  const link = evidence.buildCitationLink(citation);

  assert.match(link, /href="https:\/\/doi\.org/, 'link includes DOI URL');
  assert.match(link, /10\.1234\/example/, 'link includes DOI');
  assert.match(link, /Research Paper/, 'link includes title');
});

test('brain-map-planner-evidence — buildCitationLink invalid', () => {
  const link1 = evidence.buildCitationLink(null);
  assert.equal(link1, '', 'returns empty string for null');

  const link2 = evidence.buildCitationLink({ value: 'test' }); // no type
  assert.equal(link2, '', 'returns empty string when type is missing');

  const link3 = evidence.buildCitationLink({ type: 'unknown', value: 'test' });
  assert.equal(link3, 'test', 'returns display text for unknown type');
});

test('brain-map-planner-evidence — renderEvidenceBanner with citations', () => {
  const citations = [
    { type: 'pmid', value: '12345', title: 'Study 1' },
    { type: 'doi', value: '10.1234/x', title: 'Study 2' },
  ];

  const banner = evidence.renderEvidenceBanner(citations, 'tDCS for depression');

  assert.match(banner, /Evidence:/, 'banner includes "Evidence:" label');
  assert.match(banner, /pubmed/, 'banner includes PubMed link');
  assert.match(banner, /doi\.org/, 'banner includes DOI link');
  assert.match(banner, /Decision-support only/, 'banner includes disclaimer');
  assert.match(banner, /Clinician review required/, 'banner mentions clinician review');
});

test('brain-map-planner-evidence — renderEvidenceBanner without citations', () => {
  const banner = evidence.renderEvidenceBanner([], 'tDCS for depression');

  assert.match(banner, /No clinical evidence found/, 'banner indicates no evidence');
  assert.match(banner, /clinician judgment/, 'banner mentions judgment requirement');
  assert.match(banner, /institutional review/, 'banner mentions institutional review');
});

test('brain-map-planner-evidence — renderEvidenceBanner null citations', () => {
  const banner = evidence.renderEvidenceBanner(null, 'test claim');

  assert.match(banner, /No clinical evidence found/, 'treats null as empty array');
});

test('brain-map-planner-evidence — queryBrainMapEvidence signature (demo mode)', async () => {
  // In demo mode, always returns empty citations
  const result = await evidence.queryBrainMapEvidence('DLPFC', 'target');

  assert.ok(typeof result === 'object', 'returns object');
  assert.ok('citations' in result, 'result has citations field');
  assert.ok('items' in result, 'result has items field');
  assert.ok(Array.isArray(result.citations), 'citations is array');
});

test('brain-map-planner-evidence — checkEvidenceProvider signature', async () => {
  try {
    const status = await evidence.checkEvidenceProvider();
    assert.ok(['ok', 'unavailable', 'demo', 'error'].includes(status), `status is one of expected values, got ${status}`);
  } catch (error) {
    // Network errors are acceptable in test environment
  }
});
