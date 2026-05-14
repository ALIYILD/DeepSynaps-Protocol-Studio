// library-hub-evidence-card.test.js
// Verifies the Evidence Database one-click card on Research Evidence (the
// page library-hub deep-links into). The card surfaces live counts from
// /api/v1/evidence/indications/summary and clicks through to the
// Indications (Live DB) tab. Honest empty state when the API rejects.

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

// ─── Source-level structural assertions ─────────────────────────────────────
test('Evidence Database card is wired into the Overview tab', () => {
  const src = read('./pages-research-evidence.js');
  // The helper is defined and exported.
  assert.match(src, /export async function _renderEvidenceDbCard/);
  // The Overview render composes the card into its body innerHTML.
  assert.match(src, /const evidenceDbCardHtml = await _renderEvidenceDbCard\(\)/);
  // evidenceDbCardHtml must precede the kpi/source/wearable strip in the
  // body composition. Allow other intermediate components (e.g. the
  // Neuromodulation Evidence Terminal deck) to be concatenated between
  // them — the wiring contract is "card appears above the KPI deck",
  // not "card is glued directly to kpiHtml".
  assert.match(src, /evidenceDbCardHtml \+[\s\S]{0,400}?kpiHtml \+ srcHtml \+ wearBridge/);
  // It pulls counts from the live indications spine endpoint, not a fixture.
  assert.match(src, /api\.evidenceIndicationsSummary\(\)/);
  // The card click sets the Indications tab and re-navigates.
  // Source contains escape-quoted strings (\'indications\'); match relaxed.
  assert.match(src, /window\._resEvidenceTab=\\?['"]indications\\?['"]/);
  assert.match(src, /window\._nav\(\\?['"]research-evidence\\?['"]\)/);
  // Honest empty state — never fabricated counts.
  assert.match(src, /Evidence DB unavailable — open page to retry/);
});

// ─── Functional assertions: render with mocked api ──────────────────────────
async function loadCard() {
  // Stub localStorage before importing api.js (it reads ds_access_token).
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  if (!desc || !desc.value || typeof desc.value.getItem !== 'function') {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      },
    });
  }
  const apiMod = await import('./api.js');
  const pageMod = await import('./pages-research-evidence.js');
  return { api: apiMod.api, _renderEvidenceDbCard: pageMod._renderEvidenceDbCard };
}

test('renders title + live-count subtitle when API returns the canonical shape', async () => {
  const { api, _renderEvidenceDbCard } = await loadCard();
  const original = api.evidenceIndicationsSummary;
  // Canonical shape per evidence_router /indications/summary: rows with
  // slug/label/modality/condition/evidence_grade/paper_count/trial_count/
  // device_count.
  api.evidenceIndicationsSummary = async () => ([
    { slug: 'rtms_mdd', label: 'rTMS for MDD',     modality: 'rTMS',  condition: 'MDD',  evidence_grade: 'A', paper_count: 100000, trial_count: 800, device_count: 20 },
    { slug: 'tdcs_mdd', label: 'tDCS for MDD',     modality: 'tDCS',  condition: 'MDD',  evidence_grade: 'B', paper_count:  50000, trial_count: 300, device_count: 10 },
    { slug: 'rtms_ocd', label: 'rTMS for OCD',     modality: 'rTMS',  condition: 'OCD',  evidence_grade: 'A', paper_count:  34000, trial_count: 179, device_count:  5 },
  ]);
  try {
    const html = await _renderEvidenceDbCard();
    // Title.
    assert.match(html, /Evidence Database/);
    // Subtitle: 3 indications, totals computed (100k+50k+34k = 184,000 → "184K").
    assert.match(html, /3 indications/);
    assert.match(html, /184K papers/);
    assert.match(html, /1,279 trials/);
    assert.match(html, /35 cleared devices/);
    // Click handler navigates to the Indications tab.
    assert.match(html, /window\._resEvidenceTab='indications';window\._nav\('research-evidence'\)/);
    // Honest source attribution.
    assert.match(html, /GET \/api\/v1\/evidence\/indications\/summary/);
  } finally {
    api.evidenceIndicationsSummary = original;
  }
});

test('navigates to the Indications tab on click (data-testid hooks present)', async () => {
  const { api, _renderEvidenceDbCard } = await loadCard();
  const original = api.evidenceIndicationsSummary;
  api.evidenceIndicationsSummary = async () => ([
    { slug: 'rtms_mdd', label: 'rTMS for MDD', modality: 'rTMS', condition: 'MDD', evidence_grade: 'A', paper_count: 1, trial_count: 1, device_count: 1 },
  ]);
  try {
    const html = await _renderEvidenceDbCard();
    // Test hooks for downstream e2e — both the outer card and its subtitle.
    assert.match(html, /data-testid="evidence-db-card"/);
    assert.match(html, /data-testid="evidence-db-card-subtitle"/);
    // Role + keyboard activation for accessibility.
    assert.match(html, /role="button"/);
    assert.match(html, /tabindex="0"/);
    assert.match(html, /aria-label="Open Indications \(Live DB\) tab"/);
    // Pluralisation honest at n=1.
    assert.match(html, /1 indication /);
    assert.match(html, /1 paper /);
    assert.match(html, /1 trial /);
    assert.match(html, /1 cleared device/);
  } finally {
    api.evidenceIndicationsSummary = original;
  }
});

test('renders honest empty state when the API rejects', async () => {
  const { api, _renderEvidenceDbCard } = await loadCard();
  const original = api.evidenceIndicationsSummary;
  api.evidenceIndicationsSummary = async () => {
    throw new Error('503 evidence DB not ingested');
  };
  try {
    const html = await _renderEvidenceDbCard();
    // Title still rendered.
    assert.match(html, /Evidence Database/);
    // Honest empty state — no fabricated counts.
    assert.match(html, /Evidence DB unavailable — open page to retry/);
    // Card still navigates so clinician can drill in and see the real error.
    assert.match(html, /window\._resEvidenceTab='indications';window\._nav\('research-evidence'\)/);
    // No fabricated paper / trial / device totals.
    assert.doesNotMatch(html, /\d+\s+papers/);
    assert.doesNotMatch(html, /\d+\s+trials/);
    assert.doesNotMatch(html, /\d+\s+cleared devices/);
  } finally {
    api.evidenceIndicationsSummary = original;
  }
});

test('renders empty-spine state when the API returns []', async () => {
  const { api, _renderEvidenceDbCard } = await loadCard();
  const original = api.evidenceIndicationsSummary;
  api.evidenceIndicationsSummary = async () => [];
  try {
    const html = await _renderEvidenceDbCard();
    assert.match(html, /Evidence Database/);
    assert.match(html, /No indications curated yet — open page to seed the spine/);
    assert.match(html, /window\._resEvidenceTab='indications';window\._nav\('research-evidence'\)/);
  } finally {
    api.evidenceIndicationsSummary = original;
  }
});
