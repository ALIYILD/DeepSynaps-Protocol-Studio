// pages-brainmap-neuroimaging.test.js — Category 4 PR-2 (frontend)
//
// Verifies the neuroimaging provenance surfaces wired into the Brain Map
// Planner. Three behaviours we pin here:
//   1. The neuroimaging-provenance-card helpers render the source name,
//      coordinate space, atlas labels, access notes, the per-candidate
//      "source-derived" caveat, AND the planner-footer disclaimer.
//   2. A lifecycle badge appears when `lifecycle_state` is anything
//      other than "healthy" (using "requires_application" + "deprecated"
//      as representative non-healthy states).
//   3. pages-brainmap.js imports the helpers and references the
//      `_bmApplyLoadedPlan` window hook so loaded plans round-trip
//      `full_artifact.target_candidates` through state.
//
// No DOM mounting — direct helper invocation + source-text pins.
// node --test compatible.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  renderNeuroimagingProvenanceCard,
  renderNeuroimagingProvenancePanel,
  renderNeuroimagingLifecycleBadge,
  renderNeuroimagingDisclaimerFooter,
  DEFAULT_NEUROIMAGING_DISCLAIMER,
} from './neuroimaging-provenance-card.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const BRAINMAP_SRC = readFileSync(join(__dir, 'pages-brainmap.js'), 'utf8');

describe('Brain Map Planner — neuroimaging provenance', () => {
  it('renders source name, space, atlas labels and access notes', () => {
    const html = renderNeuroimagingProvenanceCard({
      source_name: 'NeuroVault',
      source_id: 'neurovault:image-12345',
      coordinate_space: 'MNI152',
      atlas_labels: ['Left DLPFC', 'BA46'],
      coordinates: [-42, 38, 28],
      access_notes: 'Free API; aggregated statistical maps.',
      lifecycle_state: 'healthy',
      dataset_url: 'https://neurovault.org/images/12345',
    });
    assert.match(html, /NeuroVault/);
    assert.match(html, /MNI152/);
    assert.match(html, /Left DLPFC/);
    assert.match(html, /BA46/);
    assert.match(html, /MNI \[-42, 38, 28\]/);
    assert.match(html, /Free API/);
    assert.match(html, /View source/);
    // per-candidate uncertainty caveat
    assert.match(html, /source-derived reference — requires clinician review/);
    // healthy state → no badge
    assert.doesNotMatch(html, /class="dv2bm-neuro-badge"/);
  });

  it('renders an "application required" badge when lifecycle is requires_application', () => {
    const badge = renderNeuroimagingLifecycleBadge('requires_application');
    assert.match(badge, /application required/);
    assert.match(badge, /class="dv2bm-neuro-badge"/);

    const card = renderNeuroimagingProvenanceCard({
      source_name: 'ADNI',
      coordinate_space: 'MNI152',
      lifecycle_state: 'requires_application',
    });
    assert.match(card, /ADNI/);
    assert.match(card, /application required/);
  });

  it('renders a "deprecated" badge for deprecated sources', () => {
    const badge = renderNeuroimagingLifecycleBadge('deprecated');
    assert.match(badge, /deprecated/);

    const card = renderNeuroimagingProvenanceCard({
      source_name: 'FCON1000',
      lifecycle_state: 'deprecated',
    });
    assert.match(card, /FCON1000/);
    assert.match(card, /deprecated/);
  });

  it('returns empty markup for missing / falsy provenance', () => {
    assert.equal(renderNeuroimagingProvenanceCard(null), '');
    assert.equal(renderNeuroimagingProvenanceCard(undefined), '');
    assert.equal(renderNeuroimagingProvenanceCard('not-an-object'), '');
  });

  it('returns empty badge for healthy or missing state', () => {
    assert.equal(renderNeuroimagingLifecycleBadge('healthy'), '');
    assert.equal(renderNeuroimagingLifecycleBadge(''), '');
    assert.equal(renderNeuroimagingLifecycleBadge(null), '');
  });

  it('aggregates provenance from target_candidates list', () => {
    const html = renderNeuroimagingProvenancePanel([
      { region: 'DLPFC-L', neuroimaging_provenance: { source_name: 'NeuroVault', lifecycle_state: 'healthy' } },
      { region: 'mPFC',    neuroimaging_provenance: { source_name: 'NeuroQuery', lifecycle_state: 'degraded' } },
      { region: 'IFG-L' }, // no provenance — should not surface
    ]);
    assert.match(html, /Neuroimaging provenance/);
    assert.match(html, /NeuroVault/);
    assert.match(html, /NeuroQuery/);
    assert.match(html, /degraded/);
    // Only candidates with provenance get a row
    const rowCount = (html.match(/dv2bm-neuro-row/g) || []).length;
    assert.equal(rowCount, 2);
  });

  it('supports array-valued provenance on a single candidate', () => {
    const html = renderNeuroimagingProvenancePanel([
      {
        region: 'DLPFC-L',
        neuroimaging_provenance: [
          { source_name: 'NeuroVault', lifecycle_state: 'healthy' },
          { source_name: 'NeuroQuery', lifecycle_state: 'healthy' },
        ],
      },
    ]);
    assert.match(html, /NeuroVault/);
    assert.match(html, /NeuroQuery/);
  });

  it('returns empty panel for empty / non-list inputs', () => {
    assert.equal(renderNeuroimagingProvenancePanel(null), '');
    assert.equal(renderNeuroimagingProvenancePanel([]), '');
    assert.equal(renderNeuroimagingProvenancePanel([{ region: 'X' }]), '');
  });

  it('disclaimer footer renders the backend text when provided', () => {
    const html = renderNeuroimagingDisclaimerFooter(
      'decision support only; not diagnostic; clinician review required.'
    );
    assert.match(html, /decision support only/);
    assert.match(html, /clinician review/);
    assert.match(html, /dv2bm-neuro-disclaimer/);
  });

  it('disclaimer footer falls back to the default when none is provided', () => {
    const html = renderNeuroimagingDisclaimerFooter('');
    assert.match(html, new RegExp(DEFAULT_NEUROIMAGING_DISCLAIMER.split('.')[0]));
  });
});

describe('Brain Map Planner — pages-brainmap.js wiring', () => {
  it('imports the neuroimaging provenance helpers', () => {
    assert.match(BRAINMAP_SRC, /renderNeuroimagingProvenancePanel/);
    assert.match(BRAINMAP_SRC, /renderNeuroimagingDisclaimerFooter/);
    assert.match(BRAINMAP_SRC, /from '\.\/neuroimaging-provenance-card\.js'/);
  });

  it('right-rail invokes the provenance panel against state.targetCandidates', () => {
    // Pin: the right-rail render block must call the provenance panel
    // against the planner state's targetCandidates field.
    assert.match(BRAINMAP_SRC, /renderNeuroimagingProvenancePanel\(S\.targetCandidates\)/);
  });

  it('disclaimer is gated on provenance presence (rendered at most once per planner)', () => {
    // The footer must only render when at least one candidate has
    // neuroimaging_provenance — never as a per-card duplicate.
    assert.match(
      BRAINMAP_SRC,
      /S\.targetCandidates[\s\S]*?neuroimaging_provenance[\s\S]*?renderNeuroimagingDisclaimerFooter/,
    );
  });

  it('exposes _bmApplyLoadedPlan so plans round-trip full_artifact.target_candidates', () => {
    assert.match(BRAINMAP_SRC, /_bmApplyLoadedPlan/);
    assert.match(BRAINMAP_SRC, /full_artifact\.target_candidates/);
  });

  it('default planner state carries empty provenance fields (no fabrication)', () => {
    assert.match(BRAINMAP_SRC, /targetCandidates: \[\]/);
    assert.match(BRAINMAP_SRC, /decisionSupportDisclaimer: null/);
  });
});
