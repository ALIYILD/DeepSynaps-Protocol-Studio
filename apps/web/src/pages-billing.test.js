// Tests for pages-billing.js — pgBilling and __billingPageTestApi__ seam.
//
// Uses the exported test seam — no real DOM needed for render tests.
// pgBilling() does call document.getElementById if document is available,
// so we stub globalThis.document for those tests.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { pgBilling, __billingPageTestApi__ as api } from './pages-billing.js';

describe('__billingPageTestApi__ — state helpers', () => {
  it('exposes reset, getState, setState, render, mount, openPortal, renderPage', () => {
    assert.strictEqual(typeof api.reset, 'function');
    assert.strictEqual(typeof api.getState, 'function');
    assert.strictEqual(typeof api.setState, 'function');
    assert.strictEqual(typeof api.render, 'function');
    assert.strictEqual(typeof api.mount, 'function');
    assert.strictEqual(typeof api.openPortal, 'function');
    assert.strictEqual(typeof api.renderPage, 'function');
  });

  it('getState returns loading=false and error=null after reset', () => {
    api.reset();
    const state = api.getState();
    assert.strictEqual(state.loading, false);
    assert.strictEqual(state.error, null);
  });

  it('setState patches loading correctly', () => {
    api.reset();
    api.setState({ loading: true });
    assert.strictEqual(api.getState().loading, true);
    api.reset(); // cleanup
  });

  it('setState patches error correctly and getState returns a copy', () => {
    api.reset();
    api.setState({ error: { kind: 'generic', message: 'oops' } });
    const s = api.getState();
    assert.strictEqual(s.error.kind, 'generic');
    assert.strictEqual(s.error.message, 'oops');
    api.reset(); // cleanup
  });
});

describe('__billingPageTestApi__.render — HTML output', () => {
  it('renders billing page heading "Billing & subscriptions"', () => {
    api.reset();
    const html = api.render();
    assert.ok(html.includes('Billing'), `heading not found: ${html.slice(0, 200)}`);
    assert.ok(html.includes('subscriptions'));
  });

  it('renders Open Stripe customer portal button in default state', () => {
    api.reset();
    const html = api.render();
    assert.ok(html.includes('Open Stripe customer portal'), `button label missing`);
    assert.ok(html.includes('data-test="billing-portal-btn"'));
  });

  it('button shows "Opening Stripe…" label while loading=true', () => {
    api.reset();
    api.setState({ loading: true });
    const html = api.render();
    assert.ok(html.includes('Opening Stripe'), `loading label missing: ${html.slice(0, 300)}`);
    assert.ok(html.includes('disabled'));
    api.reset();
  });

  it('renders no_subscription error block with marketplace link', () => {
    api.reset();
    api.setState({ error: { kind: 'no_subscription' } });
    const html = api.render();
    assert.ok(html.includes('data-test="billing-error-no-subscription"'), `no_subscription block missing`);
    assert.ok(html.includes('data-test="billing-link-marketplace"'));
    assert.ok(html.includes('marketplace'));
    api.reset();
  });

  it('renders generic error block with escaped message', () => {
    api.reset();
    api.setState({ error: { kind: 'generic', message: 'HTTP 503 <b>fail</b>' } });
    const html = api.render();
    assert.ok(html.includes('data-test="billing-error-generic"'));
    assert.ok(!html.includes('<b>fail</b>'), 'raw HTML in error message must be escaped');
    assert.ok(html.includes('&lt;b&gt;fail&lt;/b&gt;'));
    api.reset();
  });

  it('renders "Manage payment methods" subtext', () => {
    api.reset();
    const html = api.render();
    assert.ok(html.includes('Manage payment methods'), `subtext missing`);
  });
});

describe('pgBilling — exported page function', () => {
  let savedDocument;

  before(() => {
    savedDocument = globalThis.document;
    // Minimal stub — pgBilling calls _bpMount → document.getElementById('content')
    const host = { innerHTML: '' };
    globalThis.document = {
      getElementById: (id) => (id === 'content' ? host : null),
      _host: host,
    };
  });

  after(() => {
    globalThis.document = savedDocument;
    api.reset();
  });

  it('pgBilling is a function', () => {
    assert.strictEqual(typeof pgBilling, 'function');
  });

  it('calls setTopbar with "Billing & subscriptions" label', async () => {
    let capturedTitle = null;
    await pgBilling((title) => { capturedTitle = title; });
    assert.strictEqual(capturedTitle, 'Billing & subscriptions');
  });

  it('resets loading and error state on navigation', async () => {
    api.setState({ loading: true, error: { kind: 'generic', message: 'stale' } });
    await pgBilling(() => {});
    const state = api.getState();
    assert.strictEqual(state.loading, false);
    assert.strictEqual(state.error, null);
  });

  it('returns HTML string containing the billing page structure', async () => {
    const result = await pgBilling(() => {});
    assert.strictEqual(typeof result, 'string');
    assert.ok(result.includes('billing-page') || result.includes('Billing'), `unexpected result: ${String(result).slice(0, 200)}`);
  });
});

describe('__billingPageTestApi__.openPortal — fetch handling', () => {
  let savedFetch;

  before(() => {
    savedFetch = globalThis.fetch;
  });

  after(() => {
    globalThis.fetch = savedFetch;
    api.reset();
  });

  it('sets error.kind="no_subscription" on HTTP 404 response', async () => {
    api.reset();
    globalThis.fetch = () =>
      Promise.resolve(new Response('{}', { status: 404 }));
    await api.openPortal();
    const state = api.getState();
    assert.strictEqual(state.error?.kind, 'no_subscription');
    assert.strictEqual(state.loading, false);
  });

  it('sets error.kind="generic" on HTTP 503 response', async () => {
    api.reset();
    globalThis.fetch = () =>
      Promise.resolve(new Response(JSON.stringify({ message: 'Service down' }), { status: 503 }));
    await api.openPortal();
    const state = api.getState();
    assert.strictEqual(state.error?.kind, 'generic');
    assert.strictEqual(state.loading, false);
  });

  it('sets generic error when portal URL is missing from success response', async () => {
    api.reset();
    globalThis.fetch = () =>
      Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await api.openPortal();
    const state = api.getState();
    assert.strictEqual(state.error?.kind, 'generic');
    assert.ok(state.error?.message?.includes('portal URL'), `unexpected: ${state.error?.message}`);
  });

  it('sets generic network error on fetch throw', async () => {
    api.reset();
    globalThis.fetch = () => Promise.reject(new Error('network timeout'));
    await api.openPortal();
    const state = api.getState();
    assert.strictEqual(state.error?.kind, 'generic');
    assert.ok(state.error?.message?.includes('network timeout') || state.error?.message?.includes('Network'), `unexpected: ${state.error?.message}`);
    assert.strictEqual(state.loading, false);
  });
});
