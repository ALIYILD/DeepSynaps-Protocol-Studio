import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { renderStandardsGuidelinesReferenceCard } from './standards-guidelines-reference-card.js';

const HUBS_SRC = readFileSync(new URL('./pages-clinical-hubs.js', import.meta.url), 'utf8');
const DEVICES_SRC = readFileSync(new URL('./pages-device-planning.js', import.meta.url), 'utf8');

const inventory = {
  search_status: 'catalogued_only',
  decision_support_disclaimer: 'Decision support only. Not legal or regulatory advice.',
  sources: [
    {
      title: 'FDA Guidance',
      source_kind: 'regulatory_guidance',
      jurisdiction: 'us',
      access_type: 'free',
      lifecycle_state: 'degraded',
      clinical_utility_summary: 'Public FDA device guidance references.',
      compliance_relevance: 'US device documentation review.',
      access_license_notes: 'Public guidance link only.',
      url: 'https://www.fda.gov/medical-devices/',
      warnings: ['Do not infer clearance.'],
    },
  ],
};

const search = {
  search_status: 'catalogued_only',
  decision_support_disclaimer: 'Decision support only. Not legal or regulatory advice.',
  matched_resources: [
    {
      title: 'FDA Guidance',
      source_kind: 'regulatory_guidance',
      jurisdiction: 'us',
      summary: 'Public FDA device guidance references.',
      compliance_relevance: 'US device documentation review.',
      limitations: ['No live structured search.'],
      url: 'https://www.fda.gov/medical-devices/',
      match_score: 20,
    },
  ],
};

describe('pages-protocol-standards', () => {
  it('renders the standards/guidelines reference card with disclaimers', () => {
    const html = renderStandardsGuidelinesReferenceCard(inventory, search);
    assert.match(html, /Standards &amp; guidelines references/);
    assert.match(html, /Decision support only/i);
    assert.match(html, /FDA Guidance/);
    assert.match(html, /catalogued_only/);
    assert.match(html, /Reference matches/);
  });

  it('Protocol Studio and device planning pages wire the helper and API client', () => {
    assert.match(HUBS_SRC, /renderStandardsGuidelinesReferenceCard/);
    assert.match(HUBS_SRC, /standardsGuidelinesSearch/);
    assert.match(DEVICES_SRC, /renderStandardsGuidelinesReferenceCard/);
    assert.match(DEVICES_SRC, /standardsGuidelinesSources/);
  });
});
