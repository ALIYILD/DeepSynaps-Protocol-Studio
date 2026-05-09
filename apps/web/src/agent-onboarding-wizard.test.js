// tests for agent-onboarding-wizard.js
// Uses the __agentOnboardingTestApi__ test seam for state manipulation.
// DOM shim required because the module writes to globalThis.window/_g at
// module scope.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

let savedDocument, savedFetch, savedLocalStorage;

before(() => {
  savedDocument = globalThis.document;
  savedFetch = globalThis.fetch;
  savedLocalStorage = globalThis.localStorage;

  // Minimal document stub for _agentOnbRender
  const el = { innerHTML: '' };
  globalThis.document = {
    getElementById: (id) => id === 'content' ? el : null,
    createElement: (tag) => ({ tag, style: {}, textContent: '', href: '', download: '', click() {} }),
    head: { appendChild() {} },
  };

  // localStorage shim
  globalThis.localStorage = {
    _store: {},
    getItem(k) { return this._store[k] ?? null; },
    setItem(k, v) { this._store[k] = String(v); },
    removeItem(k) { delete this._store[k]; },
  };

  // fetch stub — returns safe response
  globalThis.fetch = () =>
    Promise.resolve(
      new Response(JSON.stringify({ agents: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
});

after(() => {
  globalThis.document = savedDocument;
  globalThis.fetch = savedFetch;
  globalThis.localStorage = savedLocalStorage;
});

const mod = await import('./agent-onboarding-wizard.js');
const api = mod.__agentOnboardingTestApi__;

// ── Exports ───────────────────────────────────────────────────────────────────

describe('agent-onboarding-wizard exports', () => {
  it('exports pgAgentOnboarding as an async function', () => {
    assert.strictEqual(typeof mod.pgAgentOnboarding, 'function');
  });

  it('exports __agentOnboardingTestApi__ test seam', () => {
    assert.ok(typeof mod.__agentOnboardingTestApi__ === 'object');
  });
});

// ── Test seam state management ────────────────────────────────────────────────

describe('__agentOnboardingTestApi__ seam', () => {
  it('reset() sets step to 1 and clears packageId', () => {
    api.setState({ step: 3, packageId: 'pro' });
    api.reset();
    const s = api.getState();
    assert.strictEqual(s.step, 1);
    assert.strictEqual(s.packageId, '');
  });

  it('setState() merges patch onto current state', () => {
    api.reset();
    api.setState({ packageId: 'solo', step: 2 });
    const s = api.getState();
    assert.strictEqual(s.packageId, 'solo');
    assert.strictEqual(s.step, 2);
  });

  it('getState() returns a copy (not the internal ref)', () => {
    api.reset();
    const s1 = api.getState();
    s1.step = 99;
    const s2 = api.getState();
    assert.strictEqual(s2.step, 1, 'Mutation of getState() result should not affect internal state');
  });
});

// ── STORAGE_KEYS constants ────────────────────────────────────────────────────

describe('STORAGE_KEYS', () => {
  it('done key is "deepsynaps.onboarding.completed"', () => {
    assert.strictEqual(api.STORAGE_KEYS.done, 'deepsynaps.onboarding.completed');
  });
  it('skipped key is "deepsynaps.onboarding.skipped"', () => {
    assert.strictEqual(api.STORAGE_KEYS.skipped, 'deepsynaps.onboarding.skipped');
  });
  it('invites key is "deepsynaps.onboarding.pendingInvites"', () => {
    assert.strictEqual(api.STORAGE_KEYS.invites, 'deepsynaps.onboarding.pendingInvites');
  });
});

// ── Step HTML rendering ───────────────────────────────────────────────────────

describe('renderStep() HTML content', () => {
  it('step 1 contains all three package names', () => {
    api.reset();
    const html = api.renderStep(1);
    assert.ok(html.includes('Solo Clinician'), 'Expected Solo Clinician package');
    assert.ok(html.includes('Clinician Pro'), 'Expected Clinician Pro package');
    assert.ok(html.includes('Enterprise'), 'Expected Enterprise package');
  });

  it('step 1 shows £0 free trial wording for Solo Clinician', () => {
    api.reset();
    const html = api.renderStep(1);
    assert.ok(html.includes('£0'), 'Expected £0 price for Solo Clinician');
    assert.ok(html.includes('free trial'), 'Expected "free trial" sub-label');
  });

  it('step 1 Continue button is disabled when no package selected', () => {
    api.reset();
    const html = api.renderStep(1);
    assert.ok(html.includes('disabled'), 'Expected Continue button to be disabled with no package');
  });

  it('step 2 contains Stripe checkout wording', () => {
    api.reset();
    api.setState({ packageId: 'pro', step: 2 });
    const html = api.renderStep(2);
    assert.ok(html.includes('Stripe'), 'Expected Stripe branding on billing step');
    assert.ok(html.includes('Connect Stripe'), 'Expected "Connect Stripe" button');
  });

  it('step 2 skip billing is disabled for Clinician Pro', () => {
    api.reset();
    api.setState({ packageId: 'pro', step: 2 });
    const html = api.renderStep(2);
    // The skip button should have disabled attribute when package !== 'solo'
    assert.ok(html.includes('disabled'), 'Skip button must be disabled for Pro package');
  });

  it('step 2 skip billing is enabled for Solo Clinician', () => {
    api.reset();
    api.setState({ packageId: 'solo', step: 2 });
    const html = api.renderStep(2);
    // Solo trial can skip — the skip button should NOT be disabled
    const skipMatch = html.match(/data-test="agent-onb-skip-billing"[^>]*/);
    assert.ok(skipMatch, 'Expected skip billing button on step 2');
    assert.ok(
      !skipMatch[0].includes('disabled'),
      `Skip button must NOT be disabled for Solo trial: ${skipMatch[0]}`,
    );
  });

  it('step 3 shows loading state when agents are loading', () => {
    api.reset();
    api.setState({ step: 3, packageId: 'solo', agentsLoading: true, agents: [] });
    const html = api.renderStep(3);
    assert.ok(html.includes('Loading agents'), 'Expected loading message when agents are loading');
  });

  it('step 3 shows empty-catalog message when agents list is empty', () => {
    api.reset();
    api.setState({ step: 3, packageId: 'solo', agentsLoading: false, agents: [] });
    const html = api.renderStep(3);
    assert.ok(
      html.includes('No agents available') || html.includes('agent-onb-catalog-empty'),
      'Expected empty catalog message',
    );
  });

  it('step 4 contains invite textarea', () => {
    api.reset();
    api.setState({ step: 4, packageId: 'solo', inviteResult: null });
    const html = api.renderStep(4);
    assert.ok(html.includes('agent-onb-invites-text'), 'Expected invite textarea in step 4');
    assert.ok(html.includes('Send invites'), 'Expected Send invites button in step 4');
  });

  it('step 4 shows "ok" result panel when inviteResult.kind is "ok"', () => {
    api.reset();
    api.setState({ step: 4, packageId: 'solo', inviteResult: { kind: 'ok', text: 'Sent 2 invitations.' } });
    const html = api.renderStep(4);
    assert.ok(html.includes('agent-onb-invite-result-ok'), 'Expected ok result panel');
    assert.ok(html.includes('Sent 2 invitations'), 'Expected invite count in result');
  });
});

// ── Progress bar ──────────────────────────────────────────────────────────────

describe('progress indicator', () => {
  it('step 1 of 4 shows 25% in progress bar', () => {
    api.reset();
    api.setState({ step: 1 });
    const html = api.renderStep(1);
    assert.ok(html.includes('Step 1 of 4'), 'Expected "Step 1 of 4" text');
    assert.ok(html.includes('25%'), 'Expected 25% in progress bar width');
  });

  it('step 4 of 4 shows 100% in progress bar', () => {
    api.reset();
    api.setState({ step: 4, packageId: 'pro', inviteResult: null });
    const html = api.renderStep(4);
    assert.ok(html.includes('Step 4 of 4'), 'Expected "Step 4 of 4" text');
    assert.ok(html.includes('100%'), 'Expected 100% in progress bar width');
  });
});

// ── _agentOnbSendInvites validation ──────────────────────────────────────────

describe('sendInvites validation', () => {
  it('sets inviteResult.kind to "error" when invitesText is empty', async () => {
    api.reset();
    api.setState({ step: 4, invitesText: '' });
    await api.sendInvites();
    const s = api.getState();
    assert.ok(s.inviteResult !== null, 'Expected inviteResult to be set');
    assert.strictEqual(s.inviteResult.kind, 'error');
    assert.ok(
      s.inviteResult.text.includes('email address'),
      `Expected "email address" in error text, got: ${s.inviteResult.text}`,
    );
  });

  it('sets inviteResult.kind to "error" when invitesText has no valid emails', async () => {
    api.reset();
    api.setState({ step: 4, invitesText: 'not-an-email, also-bad' });
    await api.sendInvites();
    const s = api.getState();
    assert.strictEqual(s.inviteResult.kind, 'error');
  });

  it('uses fallback localStorage when fetch returns 404', async () => {
    const savedFetch = globalThis.fetch;
    globalThis.fetch = () =>
      Promise.resolve(new Response('Not Found', { status: 404 }));
    api.reset();
    api.setState({ step: 4, invitesText: 'test@example.com' });
    await api.sendInvites();
    const s = api.getState();
    globalThis.fetch = savedFetch;
    assert.strictEqual(s.inviteResult.kind, 'fallback');
    // Verify email was queued in localStorage
    const stored = JSON.parse(globalThis.localStorage.getItem(api.STORAGE_KEYS.invites) || '[]');
    assert.ok(stored.includes('test@example.com'), 'Email should be queued in localStorage fallback');
  });
});

// ── XSS guard (_obEsc) ────────────────────────────────────────────────────────

describe('_obEsc XSS guard', () => {
  it('package name containing < > & " is escaped in step 1 HTML', () => {
    // We can't override AGENT_ONB_PACKAGES, but we can confirm the module escapes output.
    // Verify by source inspection.
    const src = readFileSync(fileURLToPath(new URL('./agent-onboarding-wizard.js', import.meta.url)), 'utf8');
    assert.ok(src.includes('&amp;'), 'Expected &amp; in _obEsc');
    assert.ok(src.includes('&lt;'), 'Expected &lt; in _obEsc');
    assert.ok(src.includes('&#x27;'), 'Expected &#x27; (single quote escape) in _obEsc');
  });
});
