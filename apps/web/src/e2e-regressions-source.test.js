import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function read(rel) {
  return readFileSync(resolve(__dirname, rel), 'utf8');
}

test('unauth private deep-links do not auto-demo on DEV builds', () => {
  const src = read('./app.js');
  const match = src.match(
    /Honor \?page=<private-route> deep links for unauth visitors[\s\S]*?const _demoOk = ([^;]+);[\s\S]*?showLogin\(\);/,
  );
  assert.ok(match);
  assert.equal(match[1].trim(), "import.meta.env.VITE_ENABLE_DEMO === '1'");
});

test('calendar route source still renders day/week/month controls', () => {
  const src = read('./pages-courses.js');
  assert.match(src, /Schedule & Calendar/);
  assert.match(src, /window\._calSetView\('month'\)/);
  assert.match(src, /window\._calSetView\('week'\)/);
  assert.match(src, /window\._calSetView\('day'\)/);
});

test('telehealth recorder source still renders session copy', () => {
  const src = read('./pages-practice.js');
  assert.match(src, /Telehealth Session Recorder/);
  assert.match(src, />Live Session</);
  assert.match(src, />Recording Library</);
});
