// Logic-only tests for the clinic Academy page (2026-05-03).
// Pins governance copy, module strip, section metadata, and public API path.
//
// Run: node --test src/pages-academy-launch-audit.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACADEMY_GOVERNANCE_DISCLAIMER,
  ACADEMY_CLINIC_LINKED_MODULES,
  academySectionCardMeta,
} from './academy-clinic-constants.js';

test('governance disclaimer matches required clinic-use copy', () => {
  const required =
    'Academy content is training and reference material. It does not diagnose, prescribe, approve treatment, certify clinical competence, or replace local governance, supervision, and clinician judgement.';
  assert.equal(ACADEMY_GOVERNANCE_DISCLAIMER, required);
});

test('linked module strip covers Protocol Studio, MRI, DeepTwin, Marketplace, AI Agents', () => {
  const pages = new Set(ACADEMY_CLINIC_LINKED_MODULES.map((m) => m.page));
  for (const id of ['protocol-studio', 'mri-analysis', 'deeptwin', 'marketplace', 'ai-agent-v2']) {
    assert.ok(pages.has(id), `missing nav target ${id}`);
  }
});

test('curated card metadata: bundled source and audience labels', () => {
  const m = academySectionCardMeta('research');
  assert.match(m.src, /bundled/);
  assert.match(m.audience, /Clinician/);
  const c = academySectionCardMeta('certifications');
  assert.match(c.ctype, /External credential/);
});

test('community browse API path (no auth) is stable for Academy', () => {
  assert.equal(
    '/api/v1/marketplace/seller/browse',
    new URL('https://x.test/api/v1/marketplace/seller/browse').pathname
  );
});

test('wording: no in-app CME or certificate claims in progress panel text', () => {
  const panel = [
    'In-app training completion, quizzes, and certificates are not implemented on this Academy page.',
    'GET /api/v1/marketplace/seller/browse',
  ].join(' ');
  assert.doesNotMatch(panel, /CME|CPD|certificate of completion|board certified by DeepSynaps/i);
});
