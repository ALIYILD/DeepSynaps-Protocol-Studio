import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('dashboard API methods', () => {
  it('getDashboardOverview is callable', () => {
    // verify that getDashboardOverview exists as a function
    assert.strictEqual(typeof api.getDashboardOverview, 'function');
  });

  it('dashboardSearch is callable', () => {
    assert.strictEqual(typeof api.dashboardSearch, 'function');
  });

  it('dashboardSearch encodes the query string', async () => {
    // intercept and verify the URL is correctly encoded
    const originalFetch = globalThis.fetch;
    let capturedUrl = null;
    globalThis.fetch = (url, init) => {
      if (typeof url === 'string' && url.includes('/dashboard/search')) {
        capturedUrl = url;
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ query: 'test', groups: {}, total: 0 }) });
    };
    try {
      await api.dashboardSearch('hello world');
      assert.ok(capturedUrl.includes('hello%20world') || capturedUrl.includes('hello+world'), `Expected encoded query, got: ${capturedUrl}`);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
