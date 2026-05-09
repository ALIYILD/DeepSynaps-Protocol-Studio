// Tests for marketplace-hub-catalog.js
// Pins: governance notice text, kindToHubCategory branches, mapApiMarketplaceItem shape,
//       resolveMarketplaceCatalog fallback/api modes, and canManageSellerListings roles.

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  MARKETPLACE_GOVERNANCE_NOTICE,
  MARKETPLACE_MODULE_SHORTCUTS,
  DEMO_CURATED_LISTINGS,
  kindToHubCategory,
  mapApiMarketplaceItem,
  resolveMarketplaceCatalog,
  canManageSellerListings,
} from './marketplace-hub-catalog.js';

describe('MARKETPLACE_GOVERNANCE_NOTICE', () => {
  it('contains the required clinical-governance disclaimer copy', () => {
    assert.ok(
      typeof MARKETPLACE_GOVERNANCE_NOTICE === 'string',
      'must be a string',
    );
    assert.ok(
      MARKETPLACE_GOVERNANCE_NOTICE.toLowerCase().includes('clinical'),
      'must include the word "clinical"',
    );
    assert.ok(
      MARKETPLACE_GOVERNANCE_NOTICE.includes('does not approve treatment'),
      'must include "does not approve treatment" safety copy',
    );
    assert.ok(
      MARKETPLACE_GOVERNANCE_NOTICE.includes('clinical judgement'),
      'must include "clinical judgement" qualifier',
    );
  });
});

describe('MARKETPLACE_MODULE_SHORTCUTS', () => {
  it('exports a non-empty array with id, label, and route on every entry', () => {
    assert.ok(Array.isArray(MARKETPLACE_MODULE_SHORTCUTS) && MARKETPLACE_MODULE_SHORTCUTS.length > 0);
    for (const s of MARKETPLACE_MODULE_SHORTCUTS) {
      assert.ok(typeof s.id === 'string' && s.id.length > 0, `shortcut missing id: ${JSON.stringify(s)}`);
      assert.ok(typeof s.label === 'string' && s.label.length > 0, `shortcut missing label: ${s.id}`);
      assert.ok(typeof s.route === 'string' && s.route.length > 0, `shortcut missing route: ${s.id}`);
    }
  });
});

describe('kindToHubCategory', () => {
  it('maps "product" and "device" to "products"', () => {
    assert.strictEqual(kindToHubCategory('product'), 'products');
    assert.strictEqual(kindToHubCategory('device'), 'products');
    assert.strictEqual(kindToHubCategory('PRODUCT'), 'products');
  });

  it('maps "service" to "consultations"', () => {
    assert.strictEqual(kindToHubCategory('service'), 'consultations');
  });

  it('maps "software" to "software"', () => {
    assert.strictEqual(kindToHubCategory('software'), 'software');
  });

  it('maps "education" to "seminars"', () => {
    assert.strictEqual(kindToHubCategory('education'), 'seminars');
  });

  it('maps "course" to "courses"', () => {
    assert.strictEqual(kindToHubCategory('course'), 'courses');
  });

  it('falls back to "products" for unknown or empty input', () => {
    assert.strictEqual(kindToHubCategory(''), 'products');
    assert.strictEqual(kindToHubCategory(null), 'products');
    assert.strictEqual(kindToHubCategory('unknown-kind'), 'products');
  });
});

describe('mapApiMarketplaceItem', () => {
  const base = {
    id: 'abc-123',
    name: 'Test Item',
    provider: 'Test Clinic',
    price: 50,
    price_unit: 'GBP',
    featured: true,
    description: 'A test description.',
    icon: '🧠',
    external_url: 'https://example.com',
    kind: 'software',
    clinical: false,
    source: 'test_source',
  };

  it('maps API item to hub listing shape with required fields', () => {
    const result = mapApiMarketplaceItem(base);
    assert.strictEqual(result.id, 'abc-123');
    assert.strictEqual(result.title, 'Test Item');
    assert.strictEqual(result.clinic, 'Test Clinic');
    assert.strictEqual(result.price, 50);
    assert.strictEqual(result.cat, 'software');
    assert.strictEqual(result.badge, 'Featured');
    assert.strictEqual(result.listingKind, 'catalog_active');
    assert.strictEqual(result.priceCurrency, 'GBP');
  });

  it('adds clinical regulatoryNote when clinical flag is set', () => {
    const item = { ...base, clinical: true };
    const result = mapApiMarketplaceItem(item);
    assert.ok(result.clinicalFlag === true);
    assert.ok(
      typeof result.regulatoryNote === 'string' &&
        result.regulatoryNote.includes('governance'),
      'clinical items must have a regulatoryNote mentioning governance',
    );
  });

  it('sets priceCurrency to null for non-currency price_unit', () => {
    const item = { ...base, price_unit: 'session' };
    const result = mapApiMarketplaceItem(item);
    assert.strictEqual(result.priceCurrency, null);
  });

  it('sets badge to empty string for non-featured items', () => {
    const item = { ...base, featured: false };
    const result = mapApiMarketplaceItem(item);
    assert.strictEqual(result.badge, '');
  });
});

describe('resolveMarketplaceCatalog', () => {
  it('returns demo_fallback mode when apiError is set', () => {
    const result = resolveMarketplaceCatalog(null, DEMO_CURATED_LISTINGS, new Error('fail'));
    assert.strictEqual(result.mode, 'demo_fallback');
    assert.strictEqual(result.rows, DEMO_CURATED_LISTINGS);
    assert.ok(result.banner?.tone === 'warn');
  });

  it('returns demo_fallback mode when items is undefined', () => {
    const result = resolveMarketplaceCatalog({}, DEMO_CURATED_LISTINGS, null);
    assert.strictEqual(result.mode, 'demo_fallback');
  });

  it('returns api_catalog mode when items array is non-empty', () => {
    const apiItem = {
      id: 'x1',
      name: 'X',
      provider: 'P',
      price: 10,
      price_unit: 'USD',
      featured: false,
      description: '',
      icon: '📦',
      external_url: '',
      kind: 'service',
      clinical: false,
      source: 'ds',
    };
    const result = resolveMarketplaceCatalog({ items: [apiItem] }, DEMO_CURATED_LISTINGS, null);
    assert.strictEqual(result.mode, 'api_catalog');
    assert.strictEqual(result.banner, null);
    assert.strictEqual(result.rows.length, 1);
  });

  it('returns demo_fallback_empty_api mode when items is an empty array', () => {
    const result = resolveMarketplaceCatalog({ items: [] }, DEMO_CURATED_LISTINGS, null);
    assert.strictEqual(result.mode, 'demo_fallback_empty_api');
    assert.strictEqual(result.rows, DEMO_CURATED_LISTINGS);
    assert.ok(result.banner?.tone === 'info');
  });
});

describe('canManageSellerListings', () => {
  it('returns true for clinician, admin, clinic-admin, supervisor', () => {
    assert.strictEqual(canManageSellerListings('clinician'), true);
    assert.strictEqual(canManageSellerListings('admin'), true);
    assert.strictEqual(canManageSellerListings('clinic-admin'), true);
    assert.strictEqual(canManageSellerListings('supervisor'), true);
  });

  it('returns false for patient, viewer, empty string, null', () => {
    assert.strictEqual(canManageSellerListings('patient'), false);
    assert.strictEqual(canManageSellerListings('viewer'), false);
    assert.strictEqual(canManageSellerListings(''), false);
    assert.strictEqual(canManageSellerListings(null), false);
  });
});

describe('DEMO_CURATED_LISTINGS integrity', () => {
  it('all listings have id, title, cat, and listingKind fields', () => {
    for (const item of DEMO_CURATED_LISTINGS) {
      assert.ok(typeof item.id === 'string' && item.id.length > 0, `listing missing id: ${JSON.stringify(item.title)}`);
      assert.ok(typeof item.title === 'string' && item.title.length > 0, `listing missing title: ${item.id}`);
      assert.ok(typeof item.cat === 'string' && item.cat.length > 0, `listing missing cat: ${item.id}`);
      assert.ok(typeof item.listingKind === 'string', `listing missing listingKind: ${item.id}`);
    }
  });
});
