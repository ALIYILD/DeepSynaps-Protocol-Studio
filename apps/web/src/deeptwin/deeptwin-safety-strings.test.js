import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { buildDemoDashboard360Payload } from './demo-dashboard-payload.js';
import { demoPrediction, demoCorrelations, demoSummary } from './mockData.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRIBE_FILE = join(__dirname, 'tribe.js');
const PAGES_DEEPTWIN = join(__dirname, '..', 'pages-deeptwin.js');

test('360 demo payload has 22 domains and demo marker', () => {
  const p = buildDemoDashboard360Payload('sarah-johnson');
  assert.equal(p.domains.length, 22);
  assert.equal(p._demo, true);
  assert.equal(p.is_demo_view, true);
});

test('demo prediction and summary are labeled exploratory / demo', () => {
  const pr = demoPrediction('sarah-johnson', '6w');
  assert.equal(pr.is_demo_view, true);
  assert.match(String(pr.rationale || ''), /clinician|review|exploratory|demo/i);
  const s = demoSummary('sarah-johnson');
  assert.equal(s.is_demo_view, true);
});

test('correlation cards carry non-causal disclaimer', () => {
  const c = demoCorrelations('sarah-johnson');
  const note = c.cards[0]?.note || '';
  assert.match(note, /causation|causal/i);
});

const FORBIDDEN = [
  /\bbest protocol\b/i,
  /\bwill improve\b/i,
  /\bcaused by\b/i,
  /\bproves causation\b/i,
];
function assertNoForbidden(source, label) {
  for (const re of FORBIDDEN) {
    assert.equal(re.test(source), false, `${label} should not match ${re}`);
  }
}

test('tribe compare UI does not use forbidden final-language labels in source', () => {
  const tribeSrc = readFileSync(TRIBE_FILE, 'utf8');
  assertNoForbidden(tribeSrc, 'tribe.js');
  assert.match(tribeSrc, /Top-ranked candidate|not a treatment recommendation/i);
});

test('DeepTwin page source avoids autonomous-care phrases in new topbar strings', () => {
  const src = readFileSync(PAGES_DEEPTWIN, 'utf8');
  assertNoForbidden(src, 'pages-deeptwin.js');
});
