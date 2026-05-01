// ─────────────────────────────────────────────────────────────────────────────
// raw-keyboard-shortcuts.js — Phase 7
//
// Single source of truth for keyboard shortcuts available on the Raw Data
// workstation. Used by:
//   - the `?` modal that lists every shortcut for the current view
//   - the keydown handler in pages-qeeg-raw.js (action lookups)
//   - the help drawer (cross-references between buttons and their hotkeys)
// ─────────────────────────────────────────────────────────────────────────────

export const RAW_KEYBOARD_SHORTCUTS = [
  { key: '← / →',         action: 'Previous / next page' },
  { key: 'Shift+← / →',    action: 'Jump 5 pages' },
  { key: '↑ / ↓',          action: 'Increase / decrease sensitivity' },
  { key: 'Home / End',               action: 'Jump to start / end' },
  { key: 'Ctrl+Z / Y',               action: 'Undo / redo' },
  { key: 'B',                        action: 'Toggle bad channel for current cursor channel' },
  { key: 'M',                        action: 'Toggle measurement (caliper) tool' },
  { key: 'E',                        action: 'Toggle event marker tool' },
  { key: 'Space',                    action: 'Toggle bad-segment selection mode' },
  { key: '?',                        action: 'Show keyboard shortcuts' },
];

function _esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Render the shortcut sheet as an HTML string.
 *
 * Returns a self-contained block ready to drop into a modal body. The caller
 * is responsible for the modal frame (header, close button, backdrop).
 */
export function renderShortcutSheet() {
  var rows = RAW_KEYBOARD_SHORTCUTS.map(function (s) {
    return (
      '<div class="raw-kbd__row">' +
        '<kbd class="raw-kbd__key">' + _esc(s.key) + '</kbd>' +
        '<span class="raw-kbd__action">' + _esc(s.action) + '</span>' +
      '</div>'
    );
  }).join('');
  return (
    '<div class="raw-kbd">' +
      '<div class="raw-kbd__title">Keyboard shortcuts</div>' +
      '<div class="raw-kbd__body">' + rows + '</div>' +
    '</div>'
  );
}

export const RAW_KEYBOARD_SHORTCUTS_CSS = [
  '.raw-kbd { font-family: var(--font-sans, system-ui, sans-serif); color: #e2e8f0; }',
  '.raw-kbd__title { font-size:13px; font-weight:700; padding:10px 16px; border-bottom:1px solid rgba(255,255,255,0.06); }',
  '.raw-kbd__body { padding:8px 16px 14px; max-height:60vh; overflow-y:auto; }',
  '.raw-kbd__row { display:flex; align-items:center; gap:14px; padding:6px 0; font-size:12px; color:#cbd5e1; border-bottom:1px solid rgba(255,255,255,0.04); }',
  '.raw-kbd__row:last-child { border-bottom:none; }',
  '.raw-kbd__key { font-family: ui-monospace, SFMono-Regular, monospace; background:#0f172a; border:1px solid rgba(255,255,255,0.12); border-bottom-width:2px; border-radius:4px; padding:2px 8px; min-width:90px; text-align:center; font-size:11px; color:#e2e8f0; }',
  '.raw-kbd__action { color:#94a3b8; }',
].join('\n');
