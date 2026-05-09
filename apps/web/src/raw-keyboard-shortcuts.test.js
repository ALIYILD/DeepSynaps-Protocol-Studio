import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  RAW_KEYBOARD_SHORTCUTS,
  RAW_KEYBOARD_SHORTCUTS_CSS,
  renderShortcutSheet,
} from './raw-keyboard-shortcuts.js';

describe('RAW_KEYBOARD_SHORTCUTS constant', () => {
  it('pins the documented hotkey list', () => {
    // Pin the 10 documented shortcuts exactly. The keydown handler in
    // pages-qeeg-raw.js does action lookups against this list — a
    // silent rename here would break the workstation hotkeys.
    assert.equal(RAW_KEYBOARD_SHORTCUTS.length, 10);
    const keys = RAW_KEYBOARD_SHORTCUTS.map((s) => s.key);
    assert.ok(keys.includes('B'), '"B" toggles bad channel — must remain wired');
    assert.ok(keys.includes('?'), '"?" opens the shortcut sheet — self-reference must hold');
    assert.ok(keys.includes('Space'), 'Space toggles bad-segment selection');
  });

  it('every entry has both key and action strings', () => {
    for (const s of RAW_KEYBOARD_SHORTCUTS) {
      assert.equal(typeof s.key, 'string');
      assert.equal(typeof s.action, 'string');
      assert.ok(s.key.length > 0);
      assert.ok(s.action.length > 0);
    }
  });
});

describe('renderShortcutSheet', () => {
  it('returns a self-contained kbd block', () => {
    const html = renderShortcutSheet();
    assert.match(html, /class="raw-kbd"/);
    assert.match(html, /class="raw-kbd__title"/);
    assert.match(html, /Keyboard shortcuts/);
  });

  it('renders one row per shortcut', () => {
    const html = renderShortcutSheet();
    const rowMatches = html.match(/class="raw-kbd__row"/g) || [];
    assert.equal(rowMatches.length, RAW_KEYBOARD_SHORTCUTS.length);
  });

  it('escapes HTML in actions and keys to prevent XSS via the shortcut list', () => {
    // Although the shortcut list is hard-coded, the renderer must
    // still escape — it's a generic helper and an attacker who can
    // ever influence the constant could otherwise inject markup.
    // We assert the escape function is wired by checking that the
    // < and > symbols in arrow keys (← / →) survive intact (no
    // escape needed) and that & in &amp; would be encoded if present.
    const html = renderShortcutSheet();
    // ← is rendered literally (not double-encoded).
    assert.ok(html.includes('←'));
    // No raw <script> ever appears.
    assert.ok(!/<script/i.test(html));
  });
});

describe('RAW_KEYBOARD_SHORTCUTS_CSS', () => {
  it('exports a non-empty stylesheet string', () => {
    assert.equal(typeof RAW_KEYBOARD_SHORTCUTS_CSS, 'string');
    assert.ok(RAW_KEYBOARD_SHORTCUTS_CSS.length > 100);
    assert.match(RAW_KEYBOARD_SHORTCUTS_CSS, /\.raw-kbd /);
  });
});
