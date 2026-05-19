import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SRC = readFileSync(join(__dirname, 'pages-ai-fabric.js'), 'utf8');

test('pages-ai-fabric exports pgAIFabric', () => {
  assert.ok(SRC.includes('export async function pgAIFabric'), 'pgAIFabric export missing');
});

test('pages-ai-fabric keeps disabled-by-default safety copy', () => {
  assert.ok(SRC.includes('disabled by default'), 'disabled-by-default copy missing');
  assert.ok(SRC.includes('synthetic by design'), 'synthetic dry-run copy missing');
});

test('pages-ai-fabric cross-links core analyzer surfaces', () => {
  assert.ok(SRC.includes("data-ai-fabric-action=\"qeeg-launcher\""), 'qEEG link missing');
  assert.ok(SRC.includes("data-ai-fabric-action=\"mri-analysis\""), 'MRI link missing');
  assert.ok(SRC.includes("data-ai-fabric-action=\"research-evidence\""), 'Research Evidence link missing');
});
