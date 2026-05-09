import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { documentsWorkspaceRouteFromSearch } from './documents-v2-route.js';

describe('documentsWorkspaceRouteFromSearch', () => {
  it('returns documents-v2 for ?page=documents-v2', () => {
    assert.strictEqual(documentsWorkspaceRouteFromSearch('?page=documents-v2'), 'documents-v2');
  });

  it('returns documents-hub for ?page=documents-hub', () => {
    assert.strictEqual(documentsWorkspaceRouteFromSearch('?page=documents-hub'), 'documents-hub');
  });

  it('returns documents-v2 as default when page param is absent', () => {
    assert.strictEqual(documentsWorkspaceRouteFromSearch('?page=other-page'), 'documents-v2');
  });

  it('returns documents-v2 as default for empty string', () => {
    assert.strictEqual(documentsWorkspaceRouteFromSearch(''), 'documents-v2');
  });

  it('returns documents-v2 as default for null input', () => {
    assert.strictEqual(documentsWorkspaceRouteFromSearch(null), 'documents-v2');
  });

  it('returns documents-v2 as default for undefined input', () => {
    assert.strictEqual(documentsWorkspaceRouteFromSearch(undefined), 'documents-v2');
  });

  it('returns documents-v2 as default when no query string at all', () => {
    assert.strictEqual(documentsWorkspaceRouteFromSearch(''), 'documents-v2');
  });

  it('does not accept partial matches like documents-v2-extra', () => {
    // page param is 'documents-v2-extra' — not in allowed list → defaults
    assert.strictEqual(documentsWorkspaceRouteFromSearch('?page=documents-v2-extra'), 'documents-v2');
  });
});
