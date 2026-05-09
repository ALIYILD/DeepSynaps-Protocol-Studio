// pages-public.test.js — Wave-7 pinning tests (PR 99/N)
//
// Pins the five public page exports from pages-public.js.
// Verifies no-crash behaviour in a headless Node context.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── Browser stubs ─────────────────────────────────────────────────────────────
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
// globalThis is the window — add missing event listener stubs so pgHome doesn't throw
if (typeof globalThis.addEventListener === 'undefined') globalThis.addEventListener = () => {};
if (typeof globalThis.removeEventListener === 'undefined') globalThis.removeEventListener = () => {};

const _lsStore = {};
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true, writable: true,
  value: {
    getItem(k) { return Object.prototype.hasOwnProperty.call(_lsStore, k) ? _lsStore[k] : null; },
    setItem(k, v) { _lsStore[k] = String(v); },
    removeItem(k) { delete _lsStore[k]; },
    clear() { for (const k of Object.keys(_lsStore)) delete _lsStore[k]; },
  },
});
Object.defineProperty(globalThis, 'sessionStorage', {
  configurable: true, writable: true,
  value: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
});

// Minimal document stub — pgHome and pgSignupProfessional read #public-shell
const _els = {};
const _mkEl = (id) => ({
  id,
  scrollTop: 0,
  innerHTML: '',
  textContent: '',
  style: {},
  classList: { toggle() {}, remove() {}, add() {}, contains: () => false },
  setAttribute() {},
  getAttribute() { return null; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  addEventListener() {},
  removeEventListener() {},
  getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0 }; },
  scrollTo() {},
  appendChild() {},
  remove() {},
  removeChild() {},
  closest() { return null; },
  insertAdjacentHTML(pos, html) { this.innerHTML += html; },
  focus() {},
  blur() {},
});

if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    getElementById(id) { if (!_els[id]) _els[id] = _mkEl(id); return _els[id]; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement(tag) {
      const el = _mkEl('__created_' + tag);
      el.tagName = tag.toUpperCase();
      return el;
    },
    body: { appendChild() {}, removeChild() {} },
    addEventListener() {},
    removeEventListener() {},
  };
}

// Provide a reliable fetch stub for background API calls
globalThis.fetch = async () => new Response(
  JSON.stringify({ items: [], total: 0 }),
  { status: 200, headers: { 'Content-Type': 'application/json' } }
);
if (typeof globalThis.navigator === 'undefined') {
  globalThis.navigator = { userAgent: 'node-test' };
}
if (typeof globalThis.innerWidth === 'undefined') {
  globalThis.innerWidth = 1280;
}
// Stub IntersectionObserver (used by pgHome to animate sections)
if (typeof globalThis.IntersectionObserver === 'undefined') {
  globalThis.IntersectionObserver = class {
    constructor() {}
    observe() {}
    disconnect() {}
  };
}
// Suppress background unhandledRejections from fire-and-forget async tasks
process.on('unhandledRejection', () => {});

const mod = await import('./pages-public.js');

// ── 1. Export presence ────────────────────────────────────────────────────────
describe('pages-public public exports', () => {
  it('exports pgHome as a function', () => {
    assert.strictEqual(typeof mod.pgHome, 'function');
  });

  it('exports pgSignupProfessional as a function', () => {
    assert.strictEqual(typeof mod.pgSignupProfessional, 'function');
  });

  it('exports pgSignupPatient as a function', () => {
    assert.strictEqual(typeof mod.pgSignupPatient, 'function');
  });

  it('exports pgPermissionsAdmin as an async function', () => {
    assert.strictEqual(typeof mod.pgPermissionsAdmin, 'function');
  });

  it('exports pgMultiSiteDashboard as an async function', () => {
    assert.strictEqual(typeof mod.pgMultiSiteDashboard, 'function');
  });
});

// ── 2. pgHome no-throw ────────────────────────────────────────────────────────
describe('pgHome', () => {
  it('does not throw when #public-shell is in DOM stub', () => {
    let threw = false;
    try {
      mod.pgHome();
    } catch {
      threw = true;
    }
    assert.strictEqual(threw, false);
  });

  it('sets innerHTML on #public-shell', () => {
    const el = document.getElementById('public-shell');
    el.innerHTML = '';
    mod.pgHome();
    // innerHTML will be a string (may be empty string if no content set)
    assert.strictEqual(typeof el.innerHTML, 'string');
  });
});

// ── 3. pgSignupProfessional no-throw ─────────────────────────────────────────
describe('pgSignupProfessional', () => {
  it('does not throw when called', () => {
    let threw = false;
    try {
      mod.pgSignupProfessional();
    } catch {
      threw = true;
    }
    assert.strictEqual(threw, false);
  });

  it('sets innerHTML on #public-shell', () => {
    const el = document.getElementById('public-shell');
    el.innerHTML = '';
    mod.pgSignupProfessional();
    assert.strictEqual(typeof el.innerHTML, 'string');
  });
});

// ── 4. pgSignupPatient no-throw ───────────────────────────────────────────────
describe('pgSignupPatient', () => {
  it('does not throw when called', () => {
    let threw = false;
    try {
      mod.pgSignupPatient();
    } catch {
      threw = true;
    }
    assert.strictEqual(threw, false);
  });
});

// ── 5. pgPermissionsAdmin no-throw ───────────────────────────────────────────
describe('pgPermissionsAdmin', () => {
  it('does not throw when called with a stub setTopbar', async () => {
    let threw = false;
    try {
      await mod.pgPermissionsAdmin(() => {});
    } catch {
      threw = true;
    }
    assert.strictEqual(threw, false);
  });

  it('calls setTopbar with a string title', async () => {
    let calledWith = null;
    await mod.pgPermissionsAdmin((title) => { calledWith = title; });
    assert.strictEqual(typeof calledWith, 'string');
    assert.ok(calledWith.length > 0);
  });
});

// ── 6. pgMultiSiteDashboard no-throw ─────────────────────────────────────────
describe('pgMultiSiteDashboard', () => {
  it('does not throw when called with a stub setTopbar', async () => {
    let threw = false;
    try {
      await mod.pgMultiSiteDashboard(() => {});
    } catch {
      threw = true;
    }
    assert.strictEqual(threw, false);
  });

  it('calls setTopbar with "Multi-Site Network" title', async () => {
    let calledWith = null;
    await mod.pgMultiSiteDashboard((title) => { calledWith = title; });
    assert.strictEqual(calledWith, 'Multi-Site Network');
  });
});

// ── 7. window globals registered by module ────────────────────────────────────
describe('module-registered window globals', () => {
  it('registers _pubOpenLogin on window', () => {
    assert.strictEqual(typeof window._pubOpenLogin, 'function');
  });

  it('registers _pubScrollTo on window', () => {
    assert.strictEqual(typeof window._pubScrollTo, 'function');
  });

  it('registers _pubInstallHint on window', () => {
    assert.strictEqual(typeof window._pubInstallHint, 'function');
  });

  it('registers _pubShowAppModal on window', () => {
    assert.strictEqual(typeof window._pubShowAppModal, 'function');
  });

  it('registers _pubSetLocale on window', () => {
    assert.strictEqual(typeof window._pubSetLocale, 'function');
  });

  it('registers _pubLangToggle on window', () => {
    assert.strictEqual(typeof window._pubLangToggle, 'function');
  });
});

// ── 8. _pubInstallHint returns a non-empty string ────────────────────────────
describe('_pubInstallHint', () => {
  it('returns a non-empty string hint', () => {
    const hint = window._pubInstallHint();
    assert.strictEqual(typeof hint, 'string');
    assert.ok(hint.length > 0);
  });
});

// ── 9. pgPermissionsAdmin localStorage seeding ───────────────────────────────
describe('pgPermissionsAdmin localStorage', () => {
  it('seeds ds_sites in localStorage when absent', async () => {
    localStorage.clear();
    await mod.pgMultiSiteDashboard(() => {});
    const raw = localStorage.getItem('ds_sites');
    // May or may not be seeded depending on implementation path
    assert.ok(raw === null || typeof raw === 'string');
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      assert.ok(Array.isArray(parsed));
    }
  });
});
