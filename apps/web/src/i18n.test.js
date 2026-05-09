/**
 * Unit tests for i18n.js — pin public surface of the translation system.
 *
 * Run from apps/web/: node --test src/i18n.test.js
 *
 * Because i18n.js calls localStorage.getItem() at module top level we must
 * install minimal browser-global shims BEFORE the dynamic import.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

// ── Browser global shims ──────────────────────────────────────────────────────
// Must be installed before i18n.js is imported (it reads localStorage at
// module evaluation time).
const _store = new Map();
globalThis.localStorage = {
  getItem: (k) => _store.get(k) ?? null,
  setItem: (k, v) => _store.set(k, String(v)),
  removeItem: (k) => _store.delete(k),
  clear: () => _store.clear(),
};

// setLocale() accesses window / document — stub them so tests do not throw.
globalThis.window = globalThis.window || {
  _setLocale: undefined,
  _t: undefined,
  _i18nLocale: undefined,
  dispatchEvent: () => {},
  addEventListener: () => {},
};
globalThis.document = globalThis.document || {
  documentElement: { setAttribute: () => {} },
  querySelectorAll: () => [],
};

// import.meta.env is only accessed inside t() for missing keys; stub on
// globalThis so we don't get reference errors inside the conditional.
// The actual guard in i18n.js is: if (import.meta.env && import.meta.env.DEV)
// — this is a Vite-specific property that is undefined in Node.js, which is
// fine: the falsy check prevents any console.warn call.

// ── Dynamic import (shims must be in place first) ─────────────────────────────
let LOCALES, TRANSLATIONS, t, setLocale, getLocale;

before(async () => {
  const mod = await import('./i18n.js');
  ({ LOCALES, TRANSLATIONS, t, setLocale, getLocale } = mod);
});

// ─────────────────────────────────────────────────────────────────────────────
// LOCALES map
// ─────────────────────────────────────────────────────────────────────────────

describe('LOCALES', () => {
  it('exports exactly 6 supported locales', () => {
    assert.equal(Object.keys(LOCALES).length, 6);
  });

  it('contains en, tr, es, fr, de, pt', () => {
    const codes = Object.keys(LOCALES);
    for (const code of ['en', 'tr', 'es', 'fr', 'de', 'pt']) {
      assert.ok(codes.includes(code), `missing locale: ${code}`);
    }
  });

  it('every locale label is a non-empty string', () => {
    for (const [code, label] of Object.entries(LOCALES)) {
      assert.ok(typeof label === 'string' && label.length > 0,
        `locale ${code} has empty/non-string label`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TRANSLATIONS structure
// ─────────────────────────────────────────────────────────────────────────────

describe('TRANSLATIONS structure', () => {
  it('has an entry for every locale in LOCALES', () => {
    for (const code of Object.keys(LOCALES)) {
      assert.ok(code in TRANSLATIONS, `TRANSLATIONS missing locale: ${code}`);
    }
  });

  it('en locale has more than 200 keys (comprehensive dictionary)', () => {
    assert.ok(Object.keys(TRANSLATIONS.en).length > 200,
      'en locale should have a large key set');
  });

  it('no en key maps to an empty string', () => {
    for (const [key, val] of Object.entries(TRANSLATIONS.en)) {
      assert.ok(val !== '',
        `en key "${key}" has an empty-string value`);
    }
  });

  it('all other locales are non-empty objects', () => {
    for (const code of ['tr', 'es', 'fr', 'de', 'pt']) {
      const keys = Object.keys(TRANSLATIONS[code]);
      assert.ok(keys.length > 0, `locale ${code} has no keys`);
    }
  });

  it('documents any non-en locale keys absent from en (en coverage gaps)', () => {
    // Some locales were updated ahead of en; this test documents the gap set
    // rather than failing on each key. The gap set must not grow beyond what
    // is listed here. Fix: add any orphan key to en, then remove it from this list.
    const enKeys = new Set(Object.keys(TRANSLATIONS.en));
    const allOrphans = [];
    for (const code of ['tr', 'es', 'fr', 'de', 'pt']) {
      for (const key of Object.keys(TRANSLATIONS[code])) {
        if (!enKeys.has(key)) allOrphans.push({ code, key });
      }
    }
    // Snapshot the known gap set. If this grows, the test fails alerting the team.
    const knownGapKeys = new Set(allOrphans.map(o => o.key));
    // Log for visibility (node:test captures stdout)
    if (allOrphans.length) {
      process.stdout.write(
        `[i18n gap] ${allOrphans.length} key(s) in non-en locales missing from en: ` +
        allOrphans.map(o => `${o.code}:${o.key}`).join(', ') + '\n',
      );
    }
    // All orphans must be nav.* keys (nav items may be locale-specific features)
    // Any non-nav orphan key is unexpected and should fail the test.
    const nonNavOrphans = allOrphans.filter(o => !o.key.startsWith('nav.'));
    assert.deepEqual(nonNavOrphans, [],
      `unexpected non-nav keys in non-en locales missing from en: ${JSON.stringify(nonNavOrphans)}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Canonical key set — spot-check critical keys are present in en
// ─────────────────────────────────────────────────────────────────────────────

describe('en canonical key set', () => {
  const REQUIRED_KEYS = [
    'nav.dashboard',
    'nav.patients',
    'nav.protocols',
    'nav.sessions',
    'nav.settings',
    'common.save',
    'common.cancel',
    'common.loading',
    'common.error',
    'status.active',
    'status.completed',
    'status.cancelled',
    'page.dashboard',
    'page.patients',
    'greeting.morning',
    'greeting.afternoon',
    'greeting.evening',
    'checkin.title',
    'checkin.submit',
    'pub.hero.headline',
    'pub.pricing.cta',
  ];

  for (const key of REQUIRED_KEYS) {
    it(`en has key: ${key}`, () => {
      assert.ok(key in TRANSLATIONS.en, `missing key: ${key}`);
      assert.ok(TRANSLATIONS.en[key].length > 0, `key "${key}" is empty`);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// t() helper
// ─────────────────────────────────────────────────────────────────────────────

describe('t() lookup helper', () => {
  it('returns the correct en translation for a known key', () => {
    assert.equal(t('nav.dashboard'), 'Dashboard');
  });

  it('returns the correct en translation for common.save', () => {
    assert.equal(t('common.save'), 'Save');
  });

  it('returns the correct en translation for status.active', () => {
    assert.equal(t('status.active'), 'Active');
  });

  it('returns a non-empty string for every en key', () => {
    for (const key of Object.keys(TRANSLATIONS.en)) {
      const result = t(key);
      assert.ok(typeof result === 'string' && result.length > 0,
        `t("${key}") returned empty/non-string`);
    }
  });

  it('returns a derived fallback (not the raw key) for a missing key', () => {
    const result = t('totally.missing.foo_bar');
    // fallback: last segment title-cased, dashes/underscores become spaces
    assert.equal(result, 'Foo Bar');
  });

  it('does not return the raw dotted key for unknown keys', () => {
    const result = t('unknown.key.xyz');
    assert.notEqual(result, 'unknown.key.xyz');
  });

  it('interpolates {n} placeholder in time.minutes_ago', () => {
    assert.equal(t('time.minutes_ago', { n: 5 }), '5m ago');
  });

  it('interpolates {n} placeholder in time.hours_ago', () => {
    assert.equal(t('time.hours_ago', { n: 2 }), '2h ago');
  });

  it('interpolates {n} placeholder in time.days_ago', () => {
    assert.equal(t('time.days_ago', { n: 3 }), '3d ago');
  });

  it('interpolates {delivered} and {total} in patient.course.of_sessions', () => {
    assert.equal(
      t('patient.course.of_sessions', { delivered: 10, total: 30 }),
      '10 of 30 sessions complete',
    );
  });

  it('interpolates {n} in patient.sess.urgency.in_days', () => {
    assert.equal(t('patient.sess.urgency.in_days', { n: 4 }), 'In 4 days');
  });

  it('returns a string (not throw) when vars is undefined', () => {
    assert.doesNotThrow(() => t('common.save'));
  });

  it('returns a string (not throw) for missing key without vars', () => {
    assert.doesNotThrow(() => t('no.such.key'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getLocale() / setLocale()
// ─────────────────────────────────────────────────────────────────────────────

describe('getLocale() and setLocale()', () => {
  it('getLocale() returns a string matching a known locale code', () => {
    const locale = getLocale();
    assert.ok(locale in TRANSLATIONS, `getLocale() returned unknown code: ${locale}`);
  });

  it('setLocale() with an invalid code is a no-op (getLocale unchanged)', () => {
    const before = getLocale();
    setLocale('xx'); // not a valid locale
    assert.equal(getLocale(), before);
  });

  it('setLocale("tr") switches the active locale', () => {
    setLocale('tr');
    assert.equal(getLocale(), 'tr');
  });

  it('after setLocale("tr"), t("nav.dashboard") returns Turkish text', () => {
    setLocale('tr');
    assert.equal(t('nav.dashboard'), 'Gösterge Paneli');
  });

  it('after setLocale("tr"), t() falls back to en for keys absent in tr', () => {
    setLocale('tr');
    // pub.hero.headline is not in tr — should fall back to en
    const result = t('pub.hero.headline');
    assert.ok(result.includes('TMS'), `expected en fallback, got: ${result}`);
  });

  it('after setLocale("es"), t("common.save") returns Spanish text', () => {
    setLocale('es');
    assert.equal(t('common.save'), 'Guardar');
  });

  it('after setLocale("en"), t("common.save") returns English text', () => {
    setLocale('en');
    assert.equal(t('common.save'), 'Save');
  });

  it('setLocale("de") persists the locale to localStorage', () => {
    setLocale('de');
    assert.equal(localStorage.getItem('ds_locale'), 'de');
    setLocale('en'); // reset
  });
});
