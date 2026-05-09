// Frontend tests for the Clinical Agent Brain client + status banner.
//
// Verifies:
//   - api.js exposes the four agent-brain client methods
//   - the methods hit the correct endpoints
//   - mountAgentBrainStatus renders into a host element and degrades safely
//     when the backend errors

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { api } from './api.js';
import { mountAgentBrainStatus } from './agent-brain-status.js';

describe('Agent Brain API client', () => {
  it('exposes the four client methods', () => {
    assert.strictEqual(typeof api.getAgentBrainStatus, 'function');
    assert.strictEqual(typeof api.getAgentBrainProviders, 'function');
    assert.strictEqual(typeof api.queryAgentBrain, 'function');
    assert.strictEqual(typeof api.writeAgentBrainMemory, 'function');
  });

  it('getAgentBrainStatus hits /api/v1/agent-brain/status', async () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl = null;
    globalThis.fetch = (url) => {
      capturedUrl = String(url);
      return Promise.resolve(
        new Response(
          JSON.stringify({
            service: 'clinical_agent_brain',
            providers_total: 0,
            providers_configured: 0,
            providers_mvp: [],
            safety_mode: 'strict_clinical',
            providers: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    };
    try {
      await api.getAgentBrainStatus();
    } finally {
      globalThis.fetch = originalFetch;
    }
    assert.ok(
      capturedUrl?.endsWith('/api/v1/agent-brain/status'),
      `expected /api/v1/agent-brain/status, got ${capturedUrl}`,
    );
  });

  it('queryAgentBrain POSTs to /api/v1/agent-brain/query with the body', async () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl = null;
    let capturedBody = null;
    let capturedMethod = null;
    globalThis.fetch = (url, init) => {
      capturedUrl = String(url);
      capturedMethod = init?.method;
      capturedBody = init?.body;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            provider: 'evidence',
            status: 'ok',
            answer: '',
            items: [],
            citations: [],
            safety_flags: [],
            requires_clinician_review: true,
            patient_facing_allowed: false,
            confidence: 'unknown',
            missing_requirements: [],
            audit_event_id: null,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    };
    try {
      await api.queryAgentBrain({ provider: 'evidence', query: 'depression' });
    } finally {
      globalThis.fetch = originalFetch;
    }
    assert.strictEqual(capturedMethod, 'POST');
    assert.ok(capturedUrl?.endsWith('/api/v1/agent-brain/query'));
    assert.match(String(capturedBody), /"provider":"evidence"/);
    assert.match(String(capturedBody), /"query":"depression"/);
  });
});

describe('mountAgentBrainStatus banner', () => {
  let originalDocument;
  let originalFetch;

  before(() => {
    originalDocument = globalThis.document;
    originalFetch = globalThis.fetch;
    // Minimal DOM shim — we only test that mountAgentBrainStatus writes into a
    // host element and degrades safely on error. We do NOT exercise the full
    // DOM API.
    const styleTag = { id: '', textContent: '' };
    const head = { appendChild: () => {} };
    const host = { innerHTML: '' };
    globalThis.document = {
      createElement: (tag) => (tag === 'style' ? styleTag : { tag }),
      head,
      getElementById: () => null,
      querySelector: (sel) => (sel === '#agent-brain-status' ? host : null),
      _host: host,
    };
  });

  after(() => {
    globalThis.document = originalDocument;
    globalThis.fetch = originalFetch;
  });

  it('returns null when the host element is missing', async () => {
    const result = await mountAgentBrainStatus('#does-not-exist');
    assert.strictEqual(result, null);
  });

  it('renders an error banner when the backend rejects', async () => {
    globalThis.fetch = () =>
      Promise.resolve(
        new Response(JSON.stringify({ detail: 'nope' }), { status: 503 }),
      );
    const result = await mountAgentBrainStatus('#agent-brain-status');
    assert.ok(result?.host?.innerHTML?.includes('Status unavailable'));
    assert.ok(result?.host?.innerHTML?.includes('Decision-support only'));
  });

  it('renders a banner with provider counts when status returns ok', async () => {
    globalThis.fetch = () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            service: 'clinical_agent_brain',
            providers_total: 13,
            providers_configured: 6,
            providers_mvp: [
              'evidence',
              'protocol_governance',
              'condition_registry',
              'device_registry',
              'report_templates',
              'agent_memory',
            ],
            safety_mode: 'strict_clinical',
            providers: [
              { name: 'evidence', status: 'ok' },
              { name: 'qeeg_knowledge', status: 'not_configured' },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    const result = await mountAgentBrainStatus('#agent-brain-status');
    const html = result?.host?.innerHTML || '';
    assert.ok(html.includes('6 / 13 providers configured'));
    assert.ok(html.includes('Decision-support only'));
    assert.ok(html.includes('evidence'));
    assert.ok(html.includes('qeeg_knowledge'));
  });
});
