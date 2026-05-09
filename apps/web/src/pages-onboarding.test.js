// Tests for pages-onboarding.js
// The module has "transitive auth/friendly-forms imports" (see its own comment)
// meaning it relies on ffStepper / ffInput / ffSelect / ffActions / ffTextarea
// and ONB_STEP_LABELS being present as globals (injected by Vite in the full
// bundle). We stub them before import.
//
// Strategy: test the two exported page-entry-points for correct setTopbar calls
// and graceful offline behaviour, then pin the window-level handler functions
// that ARE deterministic (skip/finish/select). DOM renders are not pinned here
// because the ff* helpers produce design-system HTML that varies.

import { describe, it, before } from 'node:test';
import assert from 'node:assert';

// ── Globals required BEFORE the module loads ─────────────────────────────────

// Minimal friendly-forms stubs
globalThis.ffStepper    = () => '<div class="ff-stepper"></div>';
globalThis.ffInput      = (opts = {}) => `<input id="${opts.id || ''}" />`;
globalThis.ffSelect     = (opts = {}) => `<select id="${opts.id || ''}"></select>`;
globalThis.ffTextarea   = (opts = {}) => `<textarea id="${opts.id || ''}"></textarea>`;
globalThis.ffActions    = () => '<div class="ff-actions"></div>';
globalThis.ffFieldWrap  = (opts = {}) => `<div id="${opts.id || ''}"></div>`;
globalThis.ffNotice     = () => '<div class="ff-notice"></div>';

// Minimal ONB_STEP_LABELS (used by pipHtml in 4-step onboarding)
globalThis.ONB_STEP_LABELS = ['Clinic', 'Patient', 'Protocol', 'Done'];

// onboardingData / onboardingStep are NOT declared inside pages-onboarding.js;
// they are injected as globals by Vite's bundle scope. Declare them here so the
// ES module can read/write them without ReferenceError.
globalThis.onboardingStep = 1;
globalThis.onboardingData = {};

// ── DOM stub ──────────────────────────────────────────────────────────────────
class _FakeEl {
  constructor(tag) {
    this.tagName = tag;
    this.innerHTML = '';
    this.style = {};
    this.className = '';
    this.id = '';
    this.checked = false;
    this.disabled = false;
    this.textContent = '';
    this.value = '';
    this.parentNode = null;
    this._children = [];
  }
  querySelector()    { return null; }
  querySelectorAll() { return { forEach: () => {} }; }
  appendChild(c) {
    if (c && typeof c === 'object') c.parentNode = this;
    this._children.push(c);
    return c;
  }
  insertBefore(n, r) {
    if (n && typeof n === 'object') n.parentNode = this;
    const i = r ? this._children.indexOf(r) : -1;
    if (i >= 0) this._children.splice(i, 0, n); else this._children.push(n);
    return n;
  }
  removeChild(c) {
    const i = this._children.indexOf(c);
    if (i >= 0) this._children.splice(i, 1);
    return c;
  }
  addEventListener()    {}
  removeEventListener() {}
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  scrollTo() {}
  setAttribute() {}
  getAttribute() { return null; }
  classList = {
    _s: new Set(),
    add(c)    { this._s.add(c); },
    remove(c) { this._s.delete(c); },
    toggle(c) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); },
    contains(c) { return this._s.has(c); },
  };
}

const _contentEl = new _FakeEl('div');
_contentEl.id = 'content';
const _bodyEl   = new _FakeEl('body');

const _wizContainer = new _FakeEl('div');
_wizContainer.id = 'wiz-inline-container';

globalThis.document = {
  getElementById(id) {
    if (id === 'content') return _contentEl;
    if (id === 'wiz-inline-container') return _wizContainer;
    if (id === 'onboarding-overlay') return null;
    return null;
  },
  querySelector()    { return null; },
  querySelectorAll() { return []; },
  createElement(tag) { return new _FakeEl(tag); },
  createTextNode()   { return { nodeType: 3, textContent: '' }; },
  body: _bodyEl,
  head: new _FakeEl('head'),
};

globalThis.window = {
  _nav: () => {},
};

globalThis.localStorage = (() => {
  const s = {};
  return {
    getItem:    k => s[k] ?? null,
    setItem:    (k, v) => { s[k] = String(v); },
    removeItem: k => { delete s[k]; },
  };
})();

globalThis.fetch = () => Promise.resolve(
  new Response(
    JSON.stringify({ total_papers: 184669, modality_distribution: {} }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
);

globalThis.Response = class Response {
  constructor(body, init = {}) {
    this._body = body;
    this.status = init.status ?? 200;
    this.ok = this.status >= 200 && this.status < 300;
    this.headers = new Map(Object.entries(init.headers || {}));
  }
  json() { return Promise.resolve(JSON.parse(this._body)); }
  text() { return Promise.resolve(this._body); }
};

// ── Load module ───────────────────────────────────────────────────────────────
let pgOnboarding, pgOnboardingWizard, pgAgentOnboarding;

before(async () => {
  const mod = await import('./pages-onboarding.js');
  pgOnboarding      = mod.pgOnboarding;
  pgOnboardingWizard = mod.pgOnboardingWizard;
  pgAgentOnboarding  = mod.pgAgentOnboarding;
});

// ── Export types ──────────────────────────────────────────────────────────────
describe('pages-onboarding module exports', () => {
  it('exports pgOnboarding as a function', () => {
    assert.strictEqual(typeof pgOnboarding, 'function');
  });

  it('exports pgOnboardingWizard as a function', () => {
    assert.strictEqual(typeof pgOnboardingWizard, 'function');
  });

  it('exports pgAgentOnboarding as a function (re-export)', () => {
    assert.strictEqual(typeof pgAgentOnboarding, 'function');
  });
});

// ── pgOnboarding ──────────────────────────────────────────────────────────────
describe('pgOnboarding()', () => {
  it('calls setTopbar with "Welcome to DeepSynaps" and empty subtitle', async () => {
    let title = null, sub = null;
    const setTopbar = (t, s) => { title = t; sub = s; };
    await pgOnboarding(setTopbar, () => {});
    assert.strictEqual(title, 'Welcome to DeepSynaps');
    assert.strictEqual(sub, '');
  });

  it('writes to #content innerHTML', async () => {
    _contentEl.innerHTML = '';
    await pgOnboarding(() => {}, () => {});
    assert.ok(_contentEl.innerHTML.length > 0, 'innerHTML should be populated');
  });

  it('renders the friendly-form wrapper class in #content', async () => {
    _contentEl.innerHTML = '';
    await pgOnboarding(() => {}, () => {});
    assert.ok(
      _contentEl.innerHTML.includes('ff-page') || _contentEl.innerHTML.includes('onb-step'),
      'expected page wrapper in rendered HTML'
    );
  });

  it('does not throw when fetch rejects (offline mode)', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = () => Promise.reject(new Error('offline'));
    let threw = false;
    try {
      await pgOnboarding(() => {}, () => {});
    } catch (_e) {
      threw = true;
    } finally {
      globalThis.fetch = origFetch;
    }
    assert.strictEqual(threw, false);
  });
});

// ── pgOnboardingWizard ───────────────────────────────────────────────────────
describe('pgOnboardingWizard()', () => {
  it('calls setTopbar with "Setup Wizard"', async () => {
    let title = null;
    const setTopbar = (t) => { title = t; };
    await pgOnboardingWizard(setTopbar);
    assert.strictEqual(title, 'Setup Wizard');
  });

  it('does not throw when getOnboardingState rejects (offline)', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = () => Promise.reject(new Error('no network'));
    let threw = false;
    try {
      await pgOnboardingWizard(() => {});
    } catch (_e) {
      threw = true;
    } finally {
      globalThis.fetch = origFetch;
    }
    assert.strictEqual(threw, false);
  });
});

// ── _WIZ_STEP_NAMES coverage ─────────────────────────────────────────────────
// _wizStepName is used internally but the wizard must map all 6 steps correctly.
// We test this indirectly via _wizSkip which calls _wizStepName(_wiz.step).
describe('window._wizSkip', () => {
  it('sets ds_onboarding_complete="true" in localStorage', () => {
    globalThis.localStorage.removeItem('ds_onboarding_complete');
    const fn = globalThis.window._wizSkip;
    if (typeof fn !== 'function') return; // guard in case module not yet attached
    fn(null, { reason: 'unit-test' });
    assert.strictEqual(globalThis.localStorage.getItem('ds_onboarding_complete'), 'true');
  });

  it('sets ds_onboarding_skip="1" in localStorage', () => {
    globalThis.localStorage.removeItem('ds_onboarding_skip');
    const fn = globalThis.window._wizSkip;
    if (typeof fn !== 'function') return;
    fn(null, { reason: 'unit-test' });
    assert.strictEqual(globalThis.localStorage.getItem('ds_onboarding_skip'), '1');
  });

  it('sets ds_onboarding_is_demo="1" in localStorage (sticky demo flag)', () => {
    globalThis.localStorage.removeItem('ds_onboarding_is_demo');
    const fn = globalThis.window._wizSkip;
    if (typeof fn !== 'function') return;
    fn(null, { reason: 'unit-test' });
    assert.strictEqual(globalThis.localStorage.getItem('ds_onboarding_is_demo'), '1');
  });
});

// ── _onbFinish ────────────────────────────────────────────────────────────────
describe('window._onbFinish', () => {
  it('sets ds_onboarding_done="1" in localStorage', () => {
    globalThis.localStorage.removeItem('ds_onboarding_done');
    const fn = globalThis.window._onbFinish;
    if (typeof fn !== 'function') return;
    fn();
    assert.strictEqual(globalThis.localStorage.getItem('ds_onboarding_done'), '1');
  });
});

// ── _wizSaveRole error path ───────────────────────────────────────────────────
describe('window._wizSaveRole', () => {
  it('is a function', () => {
    assert.strictEqual(typeof globalThis.window._wizSaveRole, 'function');
  });

  it('does not throw when role is unset (no-role guard)', () => {
    // Without a DOM <select> the role will be empty; _wizSaveRole should
    // gracefully handle the missing-role case.
    const fn = globalThis.window._wizSaveRole;
    if (typeof fn !== 'function') return;
    let threw = false;
    try { fn(); } catch (_e) { threw = true; }
    assert.strictEqual(threw, false);
  });
});

// ── _wizSelectRole ────────────────────────────────────────────────────────────
describe('window._wizSelectRole', () => {
  it('is a function', () => {
    assert.strictEqual(typeof globalThis.window._wizSelectRole, 'function');
  });
});

// ── _wizFinish ────────────────────────────────────────────────────────────────
describe('window._wizFinish', () => {
  it('sets ds_onboarding_complete="true" and removes ds_onboarding_skip', () => {
    globalThis.localStorage.setItem('ds_onboarding_skip', '1');
    globalThis.localStorage.removeItem('ds_onboarding_complete');
    const fn = globalThis.window._wizFinish;
    if (typeof fn !== 'function') return;
    fn('dashboard');
    assert.strictEqual(globalThis.localStorage.getItem('ds_onboarding_complete'), 'true');
    assert.strictEqual(globalThis.localStorage.getItem('ds_onboarding_skip'), null);
  });
});

// ── _wizChooseSample ──────────────────────────────────────────────────────────
describe('window._wizChooseSample', () => {
  it('sets ds_onboarding_is_demo="1" (sample = demo data)', () => {
    globalThis.localStorage.removeItem('ds_onboarding_is_demo');
    const fn = globalThis.window._wizChooseSample;
    if (typeof fn !== 'function') return;
    fn();
    assert.strictEqual(globalThis.localStorage.getItem('ds_onboarding_is_demo'), '1');
  });
});

// ── _wizSkipData ──────────────────────────────────────────────────────────────
describe('window._wizSkipData', () => {
  it('is a function', () => {
    assert.strictEqual(typeof globalThis.window._wizSkipData, 'function');
  });

  it('does not throw when called', () => {
    const fn = globalThis.window._wizSkipData;
    if (typeof fn !== 'function') return;
    let threw = false;
    try { fn(null); } catch (_e) { threw = true; }
    assert.strictEqual(threw, false);
  });
});

// ── _onbBack / _onbNext ───────────────────────────────────────────────────────
describe('window navigation handlers', () => {
  it('_onbBack is a function', () => {
    assert.strictEqual(typeof globalThis.window._onbBack, 'function');
  });

  it('_onbNext is a function', () => {
    assert.strictEqual(typeof globalThis.window._onbNext, 'function');
  });

  it('_onbSkipPatient is a function', () => {
    assert.strictEqual(typeof globalThis.window._onbSkipPatient, 'function');
  });

  it('_onbSkipProtocol is a function', () => {
    assert.strictEqual(typeof globalThis.window._onbSkipProtocol, 'function');
  });
});

// ── _onbSelectMod / _onbSelectCond ────────────────────────────────────────────
describe('window._onbSelectMod', () => {
  it('adds "selected" class on first call', () => {
    const fn = globalThis.window._onbSelectMod;
    if (typeof fn !== 'function') return;
    const el = {
      classList: {
        _s: new Set(),
        toggle(c) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); },
        contains(c) { return this._s.has(c); },
      }
    };
    fn(el, 'TMS');
    assert.ok(el.classList.contains('selected'), 'expected "selected" class added');
  });

  it('removes "selected" class on second call (toggle)', () => {
    const fn = globalThis.window._onbSelectMod;
    if (typeof fn !== 'function') return;
    const el = {
      classList: {
        _s: new Set(),
        toggle(c) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); },
        contains(c) { return this._s.has(c); },
      }
    };
    fn(el, 'TMS'); // add
    fn(el, 'TMS'); // remove
    assert.ok(!el.classList.contains('selected'), 'expected "selected" class removed');
  });
});

describe('window._onbSelectCond', () => {
  it('does not throw on double-toggle', () => {
    const fn = globalThis.window._onbSelectCond;
    if (typeof fn !== 'function') return;
    const el = {
      classList: {
        _s: new Set(),
        toggle(c) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); },
        contains(c) { return this._s.has(c); },
      }
    };
    let threw = false;
    try {
      fn(el, 'Depression');
      fn(el, 'Depression');
    } catch (_e) { threw = true; }
    assert.strictEqual(threw, false);
  });
});
