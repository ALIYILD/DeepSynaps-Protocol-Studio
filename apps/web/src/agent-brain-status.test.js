// Tests for agent-brain-status.js
// Pins: renderBanner HTML contract, decision-support disclaimer copy, tone classes,
//       renderError copy, and return shape from mountAgentBrainStatus.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { mountAgentBrainStatus, ensureAgentBrainStatus } from './agent-brain-status.js';

// ── minimal DOM shim ──────────────────────────────────────────────────────────
function makeShim(hostOverride) {
  const styleTag = { id: '', textContent: '' };
  const host = hostOverride || { innerHTML: '' };
  return {
    createElement: (tag) => (tag === 'style' ? styleTag : { tag }),
    head: { appendChild: () => {} },
    getElementById: () => null,
    querySelector: (sel) => (sel === '#agent-brain-status' ? host : null),
    _host: host,
  };
}

describe('agent-brain-status: banner rendering', () => {
  let savedDoc, savedFetch;

  before(() => {
    savedDoc = globalThis.document;
    savedFetch = globalThis.fetch;
    globalThis.document = makeShim();
  });

  after(() => {
    globalThis.document = savedDoc;
    globalThis.fetch = savedFetch;
  });

  it('renders "Decision-support only · clinician review required." in every success banner', async () => {
    globalThis.fetch = () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            providers_total: 13,
            providers_configured: 5,
            providers: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    const result = await mountAgentBrainStatus('#agent-brain-status');
    const html = result?.host?.innerHTML || '';
    assert.ok(
      html.includes('Decision-support only · clinician review required.'),
      'disclaimer must be present in success banner',
    );
  });

  it('renders "Decision-support only · clinician review required." in error banner', async () => {
    globalThis.fetch = () => Promise.reject(new Error('network error'));
    const result = await mountAgentBrainStatus('#agent-brain-status');
    const html = result?.host?.innerHTML || '';
    assert.ok(
      html.includes('Decision-support only · clinician review required.'),
      'disclaimer must be present in error banner',
    );
  });

  it('renders the exact provider count in the form "N / M providers configured"', async () => {
    globalThis.fetch = () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            providers_total: 13,
            providers_configured: 7,
            providers: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    const result = await mountAgentBrainStatus('#agent-brain-status');
    assert.ok(
      result?.host?.innerHTML?.includes('7 / 13 providers configured'),
      'provider count must match payload',
    );
  });

  it('sets err tone class when 0 providers are configured', async () => {
    globalThis.fetch = () =>
      Promise.resolve(
        new Response(
          JSON.stringify({ providers_total: 5, providers_configured: 0, providers: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    const result = await mountAgentBrainStatus('#agent-brain-status');
    const html = result?.host?.innerHTML || '';
    assert.ok(html.includes('class="ds-ab-banner err"'), 'should use err class when configured=0');
  });

  it('sets warn tone class when some (but fewer than 4) providers are configured', async () => {
    globalThis.fetch = () =>
      Promise.resolve(
        new Response(
          JSON.stringify({ providers_total: 5, providers_configured: 2, providers: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    const result = await mountAgentBrainStatus('#agent-brain-status');
    const html = result?.host?.innerHTML || '';
    assert.ok(html.includes('class="ds-ab-banner warn"'), 'should use warn class when configured<4');
  });

  it('uses no warn/err class when 4 or more providers are configured', async () => {
    globalThis.fetch = () =>
      Promise.resolve(
        new Response(
          JSON.stringify({ providers_total: 8, providers_configured: 4, providers: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    const result = await mountAgentBrainStatus('#agent-brain-status');
    const html = result?.host?.innerHTML || '';
    assert.ok(html.includes('class="ds-ab-banner "'), 'should use neutral class when configured>=4');
  });

  it('renders provider chip with "bad" class for non-ok provider status', async () => {
    globalThis.fetch = () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            providers_total: 2,
            providers_configured: 1,
            providers: [
              { name: 'evidence', status: 'ok' },
              { name: 'missing_prov', status: 'not_configured' },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    const result = await mountAgentBrainStatus('#agent-brain-status');
    const html = result?.host?.innerHTML || '';
    assert.ok(html.includes('missing_prov'), 'non-ok provider name should appear');
    assert.ok(html.includes('ds-ab-prov bad'), 'non-ok provider should have bad chip class');
  });

  it('returns null and does not throw when selector does not match', async () => {
    const result = await mountAgentBrainStatus('#not-in-dom');
    assert.strictEqual(result, null, 'missing host must return null');
  });

  it('returns {host, payload: null, error} shape on API error', async () => {
    globalThis.fetch = () =>
      Promise.resolve(new Response('{}', { status: 500 }));
    const result = await mountAgentBrainStatus('#agent-brain-status');
    assert.ok(result?.host, 'host must be present on error');
    assert.strictEqual(result?.payload, null, 'payload must be null on error');
    assert.ok(result?.error, 'error must be set');
  });
});

describe('agent-brain-status: ensureAgentBrainStatus', () => {
  let savedDoc, savedFetch;

  before(() => {
    savedDoc = globalThis.document;
    savedFetch = globalThis.fetch;
  });

  after(() => {
    globalThis.document = savedDoc;
    globalThis.fetch = savedFetch;
  });

  it('returns null when parent is falsy', async () => {
    globalThis.document = makeShim();
    const result = await ensureAgentBrainStatus(null);
    assert.strictEqual(result, null);
  });

  it('creates a new #agent-brain-status child and inserts it if missing', async () => {
    const created = { id: '', innerHTML: '' };
    const insertedNodes = [];
    const parent = {
      querySelector: () => null,
      insertBefore: (node) => insertedNodes.push(node),
      firstChild: null,
    };
    globalThis.document = {
      createElement: (tag) => (tag === 'style' ? { id: '', textContent: '' } : created),
      head: { appendChild: () => {} },
      getElementById: () => null,
      querySelector: () => null,
    };
    globalThis.fetch = () =>
      Promise.resolve(
        new Response(
          JSON.stringify({ providers_total: 10, providers_configured: 5, providers: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    const result = await ensureAgentBrainStatus(parent);
    assert.ok(result?.host, 'host must be returned');
    assert.strictEqual(insertedNodes[0]?.id, 'agent-brain-status', 'inserted node id must match');
    assert.ok(
      result.host.innerHTML.includes('Decision-support only'),
      'disclaimer must be in injected host',
    );
  });
});
