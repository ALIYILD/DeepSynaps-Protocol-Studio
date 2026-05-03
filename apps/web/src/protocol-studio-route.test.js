/**
 * Protocol Studio route — lightweight regression tests (no browser).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('app routes protocol-studio to pgProtocolHub', () => {
  const appJs = readFileSync(join(__dirname, 'app.js'), 'utf8');
  assert.ok(appJs.includes("case 'protocol-studio'"));
  assert.ok(appJs.includes('pgProtocolHub'));
});

test('Protocol Hub shell strings remain for clinician messaging', () => {
  const hubs = readFileSync(join(__dirname, 'pages-clinical-hubs.js'), 'utf8');
  assert.ok(hubs.includes('export async function pgProtocolHub'));
  assert.ok(hubs.includes('AI-assisted draft'));
  assert.ok(hubs.includes('Clinician-reviewed protocol drafting'));
});

test('pgProtocolSearch supports mountEl embed for Browse tab', () => {
  const protos = readFileSync(join(__dirname, 'pages-protocols.js'), 'utf8');
  assert.ok(protos.includes('opts.mountEl'));
});
