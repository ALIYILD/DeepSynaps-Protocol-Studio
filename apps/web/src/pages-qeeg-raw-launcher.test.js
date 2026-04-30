// ─────────────────────────────────────────────────────────────────────────────
// pages-qeeg-raw-launcher.test.js
//
// Static-source contract for the new Raw EEG launcher. The launcher must:
//   - Export pgQEEGRawLauncher (matches the loader hook in app.js).
//   - Surface patient picker + EDF upload + recent recordings + demo escape.
//   - Use the existing api.js helpers (listPatients, listQEEGRecords, uploadQEEGAnalysis).
//   - Route into the workbench by appending the analysis id to qeeg-raw-workbench.
//
// We don't import the module (it pulls api.js + DOM) — static inspection keeps
// the contract regression-tested without standing up a JSDOM in the unit suite.
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('./pages-qeeg-raw-launcher.js', import.meta.url), 'utf8');
const APP = readFileSync(new URL('./app.js', import.meta.url), 'utf8');

test('launcher exports pgQEEGRawLauncher', () => {
  assert.match(SRC, /export async function pgQEEGRawLauncher\b/);
});

test('launcher uses the api helpers we expect', () => {
  assert.ok(SRC.includes('api.listPatients'),       'patient lookup');
  assert.ok(SRC.includes('api.listQEEGRecords'),    'recordings lookup');
  assert.ok(SRC.includes('api.uploadQEEGAnalysis'), 'edf upload');
});

test('launcher offers the three intake paths', () => {
  // Pick existing record
  assert.ok(SRC.includes('data-action="select-record"'), 'record select action');
  assert.ok(SRC.includes('data-action="open-record"'),   'open-record action');
  // Upload new EDF
  assert.ok(SRC.includes('id="qrl-file-input"'),        'file input id');
  assert.ok(SRC.includes('data-action="upload"'),        'upload action');
  // Synthetic demo escape hatch
  assert.ok(SRC.includes('data-action="open-demo"'),     'demo action');
});

test('launcher navigates into the workbench route', () => {
  assert.ok(SRC.includes('qeeg-raw-workbench'), 'workbench route id');
  assert.ok(SRC.includes("window._nav"),        'nav helper used');
});

test('app.js routes qeeg-raw-workbench (no id) into the launcher', () => {
  assert.ok(APP.includes('loadQEEGRawLauncher'), 'loader hook present');
  assert.ok(APP.includes('pgQEEGRawLauncher'),   'launcher entry called');
});
