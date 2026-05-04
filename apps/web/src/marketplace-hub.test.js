/**
 * Clinic Marketplace hub — catalog honesty, governance copy, role helpers.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEMO_CURATED_LISTINGS,
  MARKETPLACE_GOVERNANCE_NOTICE,
  MARKETPLACE_MODULE_SHORTCUTS,
  resolveMarketplaceCatalog,
  mapApiMarketplaceItem,
  canManageSellerListings,
} from './marketplace-hub-catalog.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('governance copy matches required clinical disclaimer', () => {
  assert.equal(
    MARKETPLACE_GOVERNANCE_NOTICE,
    'Marketplace items may require clinic approval, configuration, evidence review, regulatory review, and clinician governance before clinical use. Activation here does not approve treatment, prescribe care, or replace clinical judgement.'
  );
});

test('resolveMarketplaceCatalog uses API rows when non-empty', () => {
  const apiItem = {
    id: 'x1',
    kind: 'software',
    name: 'Test Tool',
    provider: 'Vendor',
    description: 'Desc',
    price: 10,
    price_unit: 'GBP',
    external_url: 'https://example.com/x',
    clinical: true,
    featured: false,
    source: 'seller_listed',
    icon: '💻',
  };
  const r = resolveMarketplaceCatalog({ items: [apiItem] }, DEMO_CURATED_LISTINGS, null);
  assert.equal(r.mode, 'api_catalog');
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].listingKind, 'catalog_active');
  assert.ok(r.rows[0].regulatoryNote);
});

test('resolveMarketplaceCatalog falls back on fetch error', () => {
  const r = resolveMarketplaceCatalog(undefined, DEMO_CURATED_LISTINGS, new Error('network'));
  assert.equal(r.mode, 'demo_fallback');
  assert.ok(r.banner);
  assert.ok(DEMO_CURATED_LISTINGS.some((x) => x.listingKind === 'coming_soon'));
  assert.ok(DEMO_CURATED_LISTINGS.some((x) => x.listingKind === 'unavailable'));
});

test('canManageSellerListings gates guest', () => {
  assert.equal(canManageSellerListings('guest'), false);
  assert.equal(canManageSellerListings('clinician'), true);
  assert.equal(canManageSellerListings('admin'), true);
});

test('mapApiMarketplaceItem sets priceCurrency for GBP', () => {
  const m = mapApiMarketplaceItem({
    id: 'a',
    kind: 'product',
    name: 'N',
    provider: 'P',
    description: '',
    price: 9.99,
    price_unit: 'GBP',
    external_url: 'https://x.example',
    clinical: false,
    featured: false,
    active: true,
    source: 'deepsynaps_curated',
    icon: '📦',
  });
  assert.equal(m.priceCurrency, 'GBP');
});

test('pages-clinical-hubs pgMarketplaceHub wires governance + demo labels', () => {
  const p = path.join(__dirname, 'pages-clinical-hubs.js');
  const src = fs.readFileSync(p, 'utf8');
  assert.ok(src.includes('MARKETPLACE_GOVERNANCE_NOTICE'), 'hub must import governance notice');
  assert.ok(src.includes('data-test="mp-governance-copy"'), 'governance block must be testable');
  assert.ok(src.includes('mp-status-demo'), 'demo status chip must render');
  assert.ok(src.includes('canManageSellerListings'), 'seller gate helper must be used');
  assert.ok(src.includes('resolveMarketplaceCatalog'), 'must merge API + demo catalog');
});

test('module shortcuts cover protocol studio and MRI', () => {
  const ids = MARKETPLACE_MODULE_SHORTCUTS.map((m) => m.route);
  assert.ok(ids.includes('protocol-studio'));
  assert.ok(ids.includes('mri-analysis'));
});
