'use strict';
const fs   = require('fs');
const path = require('path');

const JS_FILE   = path.join(__dirname, 'apps/web/src/pages-clinical.js');
const CSS_FILE  = path.join(__dirname, 'apps/web/src/styles.css');
const FUNC_FILE = path.join(__dirname, '_bmp_func.txt');
const CSS_BLOCK = path.join(__dirname, '_bmp_css.txt');

// ── Read new content ──────────────────────────────────────────────────────────
const NEW_FUNCTION = fs.readFileSync(FUNC_FILE, 'utf8');
const NEW_CSS      = fs.readFileSync(CSS_BLOCK, 'utf8');

// ── Patch pages-clinical.js ───────────────────────────────────────────────────
console.log('Reading pages-clinical.js ...');
let js = fs.readFileSync(JS_FILE, 'utf8');
js = js.replace(/\r\n/g, '\n');  // normalize

const JS_START = '\nexport async function pgBrainMapPlanner(setTopbar) {';
const JS_END   = '\n// \u2500\u2500 pgNotesDictation';

const si = js.indexOf(JS_START);
const ei = js.indexOf(JS_END);

if (si === -1) { console.error('ERROR: could not find pgBrainMapPlanner start'); process.exit(1); }
if (ei === -1) { console.error('ERROR: could not find pgNotesDictation end marker'); process.exit(1); }

console.log('Found pgBrainMapPlanner at char ' + si + ', end marker at ' + ei + ' (replacing ' + (ei - si) + ' chars)');

const jsBefore = js.slice(0, si);
const jsAfter  = js.slice(ei);
js = jsBefore + '\n' + NEW_FUNCTION + jsAfter;
js = js.replace(/\r?\n/g, '\r\n');  // restore CRLF
fs.writeFileSync(JS_FILE, js, 'utf8');
console.log('pages-clinical.js patched OK');

// ── Patch styles.css ──────────────────────────────────────────────────────────
console.log('Reading styles.css ...');
let css = fs.readFileSync(CSS_FILE, 'utf8');
css = css.replace(/\r\n/g, '\n');

const OLD_CSS_START = '/* \u2500\u2500 Brain Map Planner \u2500\u2500 */';
const OLD_CSS_END   = '/* \u2500\u2500 Notes & Dictation \u2500\u2500 */';

const csi = css.indexOf(OLD_CSS_START);
const cei = css.indexOf(OLD_CSS_END);

if (csi === -1 || cei === -1) {
  console.warn('WARNING: old BMP CSS markers not found; appending new CSS');
  css = css + '\n' + NEW_CSS;
} else {
  console.log('Found old BMP CSS at char ' + csi + ', end at ' + cei + ' (replacing ' + (cei - csi) + ' chars)');
  css = css.slice(0, csi) + NEW_CSS + css.slice(cei);
}

css = css.replace(/\r?\n/g, '\r\n');
fs.writeFileSync(CSS_FILE, css, 'utf8');
console.log('styles.css patched OK');

console.log('\nDone! Run: cd apps/web && npx vite build');
