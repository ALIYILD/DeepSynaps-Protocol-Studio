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

test('app.js: guest and patient nav hide includes finance-v2', () => {
  const app = read('app.js');
  assert.match(app, /guest:\s*\[[^\]]*'finance-v2'/);
  // patient nav hide may include additional admin-only pages
  // (e.g. 'data-console', 'research-datasets') — the contract is
  // "finance-v2 must be in the patient hide list", not "finance-v2 is
  // the only entry". Match a non-exhaustive list.
  assert.match(app, /patient:\s*\[[^\]]*'finance-v2'/);
});

test('app.js: technician and reviewer nav hide also includes finance-v2', () => {
  const app = read('app.js');
  assert.match(app, /technician:\s*\[[^\]]*'finance-v2'/);
  assert.match(app, /reviewer:\s*\[[^\]]*'finance-v2'/);
});

test('app.js: route guard redirects non-finance roles away from finance-v2', () => {
  const app = read('app.js');
  // FINANCE_ALLOWED_ROLES restricts page rendering even on direct ?page=finance-v2 nav
  assert.match(app, /FINANCE_ALLOWED_ROLES\s*=\s*new Set\(\[/);
  assert.match(app, /'admin',\s*'clinic_admin',\s*'clinician'/);
  assert.match(app, /case 'finance-v2'[^}]*FINANCE_ALLOWED_ROLES\.has/);
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
