/**
 * Finance v2 — static contract + string checks (avoids loading the full hubs bundle in node).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(__dirname, rel), 'utf8');

test('app.js registers finance-v2 and routes to pgFinanceHub', () => {
  const app = read('app.js');
  assert.match(app, /case 'finance-v2'[^]*?pgFinanceHub/);
});

test('pages-clinical-hubs: Finance disclaimer copy present', () => {
  const hubs = read('pages-clinical-hubs.js');
  assert.match(
    hubs,
    /Finance data may include provider-sourced billing records, internal estimates, or demo data/,
  );
});

test('pages-clinical-hubs: tab bar uses finance-v2 for tab switches', () => {
  const hubs = read('pages-clinical-hubs.js');
  assert.match(hubs, /function tabBar\(\)[^]*window\._nav\('finance-v2'\)/s);
});

test('pages-clinical-hubs: demo chip and collected ledger labels', () => {
  const hubs = read('pages-clinical-hubs.js');
  assert.match(hubs, /DEMO DATA/);
  assert.match(hubs, /Collected \(ledger\)/);
});

test('pages-clinical-hubs: guest/patient finance restriction copy', () => {
  const hubs = read('pages-clinical-hubs.js');
  assert.match(hubs, /Finance workspace restricted/);
});

test('pages-clinical-hubs: navigation links to marketplace, billing, audit', () => {
  const hubs = read('pages-clinical-hubs.js');
  for (const p of ['marketplace', 'billing', 'audittrail', 'settings-v2', 'documents-v2', 'ai-agent-v2', 'pricing']) {
    assert.ok(
      hubs.includes("window._nav('" + p + "')") || hubs.includes('window._nav("' + p + '")'),
      'missing nav to ' + p,
    );
  }
});

test('api.js: finance helper paths', () => {
  const api = read('api.js');
  assert.match(api, /\/api\/v1\/finance\/summary/);
  assert.match(api, /\/api\/v1\/finance\/invoices/);
});
