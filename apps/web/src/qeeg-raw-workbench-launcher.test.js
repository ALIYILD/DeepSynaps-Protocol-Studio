// ─────────────────────────────────────────────────────────────────────────────
// qeeg-raw-workbench-launcher.test.js
//
// The qEEG Analyzer "Raw Data" tab must surface a prominent launcher bar
// pointing into the full-page workbench. We don't import the analyzer module
// (it's 6k LOC and pulls heavy deps); we statically inspect the source so
// the launcher contract — four named buttons + workbench navigation handler
// — is regression-tested.
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ANALYZER = readFileSync(new URL('./pages-qeeg-analysis.js', import.meta.url), 'utf8');
const APP = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const WORKBENCH = readFileSync(new URL('./pages-qeeg-raw-workbench.js', import.meta.url), 'utf8');

test('analyzer Raw Data tab loads embedded workbench + hero entrypoint', () => {
  // The Raw Data tab now loads pgQEEGRawWorkbench in-page (tab switch)
  // rather than navigating to a separate `?from=analyzer` route. The
  // launcher contract is: lazy-import the workbench module on tab=raw,
  // mount its async entry point, and expose a hero "Open Raw Workbench"
  // button for navigation from other tabs. The `&from=analyzer` query
  // string was retired with that route-to-tab consolidation.
  for (const label of [
    "if (tab === 'raw')",
    'import(\'./pages-qeeg-raw-workbench.js\')',
    'pgQEEGRawWorkbench',
    'Loading Raw EEG Workbench',
    'qeeg-hero-open-workbench',
    'Open Raw Workbench',
  ]) {
    assert.ok(ANALYZER.includes(label), 'launcher contract: ' + label);
  }
});

test('analyzer launcher navigates into the workbench route', () => {
  // In-page navigation: the hero button sets window._qeegTab='raw' and
  // calls window._nav('qeeg-analysis') to re-mount the analyzer on the
  // raw tab. The pre-consolidation `window._qeegOpenWorkbench` global
  // helper (which routed to a separate workbench page) was removed.
  assert.ok(ANALYZER.includes('qeeg-raw-workbench'), 'navigation target');
  assert.ok(ANALYZER.includes("window._qeegTab = 'raw'"), 'in-page tab switch to raw');
  assert.ok(ANALYZER.includes('window._nav'), 'nav function call');
});

test('analyzer registers a dedicated Learning EEG tab', () => {
  assert.ok(ANALYZER.includes("learning:  { label: 'Learning EEG'"), 'tab metadata');
  assert.ok(ANALYZER.includes("if (tab === 'learning')"), 'tab route branch');
  assert.ok(ANALYZER.includes('Learning EEG Library'), 'tab content heading');
});

test('app.js registers the workbench route', () => {
  assert.ok(APP.includes("'qeeg-raw-workbench'"), 'route registered');
  assert.ok(APP.includes('loadQEEGRawWorkbench'), 'lazy loader hook');
  assert.ok(APP.includes('pages-qeeg-raw-workbench.js'), 'module path');
});

test('workbench reads analysis id from hash and falls back to demo', () => {
  assert.ok(WORKBENCH.includes('readAnalysisIdFromHash'), 'hash reader present');
  assert.ok(WORKBENCH.includes("'demo'"), 'demo fallback present');
});

test('workbench shell carries clinical safety wording', () => {
  for (const phrase of [
    'Original raw EEG preserved',
    'Decision-support only',
    'AI-assisted suggestion only',
    'Clinician confirmation required',
  ]) {
    assert.ok(WORKBENCH.includes(phrase), 'safety phrase: ' + phrase);
  }
});

test('workbench launcher is decision-support only — no diagnostic language', () => {
  for (const banned of [
    'fully cleaned',
    'guaranteed artefact removal',
    'AI confirmed abnormality',
    'AI approved treatment',
    'automatic diagnosis',
  ]) {
    assert.ok(!WORKBENCH.includes(banned), 'banned phrase absent: ' + banned);
    assert.ok(!ANALYZER.includes(banned), 'banned phrase absent in analyzer launcher: ' + banned);
  }
});
