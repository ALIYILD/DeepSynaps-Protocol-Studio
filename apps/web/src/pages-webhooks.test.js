// Tests for pages-webhooks.js
//
// pages-webhooks.js exports:
//   pgWebhooks(setTopbar)          — page-mount function
//   __webhooksPageTestApi__        — rich test seam with state manipulation
//
// We use __webhooksPageTestApi__ exclusively — no real DOM needed for most tests.
// For mount tests we stub globalThis.document.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { pgWebhooks, __webhooksPageTestApi__ as api } from './pages-webhooks.js';

// Expose the window-level handlers that are registered at module import time.
// They reference globalThis.window, so we need to ensure window is set before
// the module initialises. Since the module is already loaded, we patch them
// manually from the test seam.

describe('__webhooksPageTestApi__ — export shape', () => {
  it('exports pgWebhooks as a function', () => {
    assert.strictEqual(typeof pgWebhooks, 'function');
  });

  it('test seam exposes required methods', () => {
    for (const method of ['reset', 'getState', 'setState', 'setRows', 'buildListUrl', 'isSuperAdmin', 'render', 'mount']) {
      assert.strictEqual(typeof api[method], 'function', `api.${method} must be a function`);
    }
  });
});

describe('__webhooksPageTestApi__ — state & reset', () => {
  it('reset restores defaults', () => {
    api.setState({ sinceDays: 99, limit: 999, rows: [{ event_id: 'e1' }] });
    api.reset();
    const s = api.getState();
    assert.strictEqual(s.sinceDays, 7, 'sinceDays should reset to 7');
    assert.strictEqual(s.limit, 50, 'limit should reset to 50');
    assert.deepStrictEqual(s.rows, [], 'rows should reset to []');
    assert.strictEqual(s.fetchError, null, 'fetchError should be null');
    assert.strictEqual(s.toast, null, 'toast should be null');
  });

  it('getState returns a shallow copy (not same reference)', () => {
    api.reset();
    const s1 = api.getState();
    const s2 = api.getState();
    assert.notStrictEqual(s1, s2, 'getState must return a fresh copy each time');
  });
});

describe('__webhooksPageTestApi__ — buildListUrl', () => {
  before(() => api.reset());

  it('default URL includes limit=50 and since_days=7', () => {
    const url = api.buildListUrl();
    assert.ok(url.includes('limit=50'), `URL should include limit=50, got: ${url}`);
    assert.ok(url.includes('since_days=7'), `URL should include since_days=7, got: ${url}`);
  });

  it('when appliedEventType is set the URL includes event_type param', () => {
    api.setState({ appliedEventType: 'checkout.session.completed' });
    const url = api.buildListUrl();
    assert.ok(
      url.includes('event_type=checkout.session.completed'),
      `URL should include event_type param, got: ${url}`
    );
    api.reset();
  });

  it('URL points at /api/v1/agent-billing/admin/webhook-events', () => {
    const url = api.buildListUrl();
    assert.ok(
      url.includes('/api/v1/agent-billing/admin/webhook-events'),
      `URL should hit the webhook-events endpoint, got: ${url}`
    );
  });
});

describe('__webhooksPageTestApi__ — render (no-admin path)', () => {
  it('renders forbidden message when not super-admin', () => {
    // In a Node test environment localStorage is absent → isSuperAdmin returns false.
    const html = api.render();
    assert.ok(
      html.includes('Super-admin access required.'),
      'non-admin render must include "Super-admin access required."'
    );
    assert.ok(
      html.includes('data-test="webhooks-forbidden"'),
      'must have data-test=webhooks-forbidden element'
    );
  });

  it('renders webhooks-page wrapper in non-admin path', () => {
    const html = api.render();
    assert.ok(html.includes('data-test="webhooks-page"'), 'top-level page wrapper missing');
  });
});

describe('__webhooksPageTestApi__ — render (admin path, localStorage stub)', () => {
  before(() => {
    // Stub localStorage to return a super-admin user so isSuperAdmin() returns true.
    globalThis.localStorage = {
      getItem: (key) => {
        if (key === 'ds_user') return JSON.stringify({ role: 'admin', clinic_id: null });
        if (key === 'ds_token') return 'tok-test-123';
        return null;
      },
    };
  });
  after(() => {
    delete globalThis.localStorage;
    api.reset();
  });

  it('renders heading "Stripe webhook events"', () => {
    api.reset();
    const html = api.render();
    assert.ok(
      html.includes('Stripe webhook events'),
      'page heading should be "Stripe webhook events"'
    );
  });

  it('renders subtext about dedupe table', () => {
    const html = api.render();
    assert.ok(
      html.includes('dedupe table'),
      'subtext should mention "dedupe table"'
    );
  });

  it('renders empty state when rows is []', () => {
    api.setState({ rows: [] });
    const html = api.render();
    assert.ok(
      html.includes('No Stripe webhook events'),
      'empty state copy should be rendered when rows is empty'
    );
  });

  it('renders row data when rows are set', () => {
    api.setRows([{
      id: 1,
      event_id: 'evt_test_001',
      event_type: 'checkout.session.completed',
      received_at: new Date().toISOString(),
      processed: true,
    }]);
    const html = api.render();
    assert.ok(html.includes('evt_test_001'), 'row event_id should be in rendered HTML');
    assert.ok(html.includes('checkout.session.completed'), 'event_type should be in rendered HTML');
  });

  it('replay button is present in table rows', () => {
    api.setRows([{
      id: 2,
      event_id: 'evt_test_002',
      event_type: 'invoice.paid',
      received_at: new Date().toISOString(),
      processed: false,
    }]);
    const html = api.render();
    assert.ok(
      html.includes('data-test="webhooks-replay-btn"'),
      'replay button must be present in row'
    );
  });

  it('toast renders with data-kind=ok when toast.kind=ok', () => {
    api.setState({ toast: { kind: 'ok', message: 'Replayed evt_foo successfully.' } });
    const html = api.render();
    assert.ok(html.includes('data-kind="ok"'), 'ok toast should have data-kind=ok');
    assert.ok(html.includes('Replayed evt_foo successfully.'), 'toast message should be present');
    api.setState({ toast: null });
  });
});

describe('pgWebhooks — page entry function', () => {
  it('calls setTopbar with "Stripe webhook events"', async () => {
    let capturedTitle = null;
    // Stub document to avoid mount errors
    globalThis.document = { getElementById: () => ({ innerHTML: '' }) };
    try {
      await pgWebhooks((title) => { capturedTitle = title; });
    } finally {
      delete globalThis.document;
    }
    assert.strictEqual(capturedTitle, 'Stripe webhook events');
  });
});
