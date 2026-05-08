/**
 * Protocol Studio readiness — static checks (node:test, no browser).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('routes and tabs include browse evidence compare simulation drafts', () => {
  const hubs = readFileSync(join(__dirname, 'pages-clinical-hubs.js'), 'utf8');
  assert.ok(hubs.includes("'browse'"));
  assert.ok(hubs.includes("'evidence'"));
  assert.ok(hubs.includes("'compare'"));
  assert.ok(hubs.includes("'simulation'"));
  assert.ok(hubs.includes('protocol-studio-tab-evidence'));
  assert.ok(hubs.includes('protocol-studio-controlled-preview'));
  assert.ok(hubs.includes('protocolStudioRecommend'));
  assert.ok(hubs.includes('protocolStudioSimulate'));
});

test('browse filters include population literature research testids', () => {
  const protos = readFileSync(join(__dirname, 'pages-protocols.js'), 'utf8');
  assert.ok(protos.includes('protocol-filter-population'));
  assert.ok(protos.includes('protocol-filter-literature'));
  assert.ok(protos.includes('protocol-view-evidence'));
});

test('api.js exposes Protocol Studio client helpers', () => {
  const apiJs = readFileSync(join(__dirname, 'api.js'), 'utf8');
  assert.ok(apiJs.includes('protocolStudioProtocolDetail'));
  assert.ok(apiJs.includes('protocolStudioRecommend'));
  assert.ok(apiJs.includes('protocolStudioSimulate'));
  assert.ok(apiJs.includes('protocolsSaved'));
});

test('copy avoids autonomous prescribing claims in new banner', () => {
  const hubs = readFileSync(join(__dirname, 'pages-clinical-hubs.js'), 'utf8');
  assert.ok(/does not diagnose, prescribe, approve treatment/i.test(hubs));
});
