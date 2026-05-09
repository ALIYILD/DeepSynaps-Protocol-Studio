// Tests for apps/web/src/main.js
//
// main.js is the Vite entry point. It is ~10 lines and does one thing:
// decides whether to bootstrap the Studio Analyzer SPA or the main app.js
// SPA based on the current URL path.
//
// We pin the structure via source-text analysis (cannot import it in Node
// because it references window.location and dynamic import()).

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dir = dirname(__filename);
const SRC = readFileSync(join(__dir, 'main.js'), 'utf8');

describe('main.js — entry bootstrapping', () => {
  it('imports styles.css at the top level', () => {
    assert.ok(SRC.includes('./styles.css'), 'main.js must import styles.css');
  });

  it('defines the studioAnalyzerRe path regex', () => {
    assert.ok(SRC.includes('studioAnalyzerRe'), 'studioAnalyzerRe pattern missing');
  });

  it('regex targets /studio/analyzer/<id> paths', () => {
    // The source uses a regex literal: /^\/studio\/analyzer\/[^/]+$/
    // In the raw source text, slashes are escaped as \/studio\/analyzer\/
    assert.ok(
      SRC.includes('studio') && SRC.includes('analyzer') && SRC.includes('studioAnalyzerRe'),
      'studioAnalyzerRe does not cover /studio/analyzer/ paths',
    );
  });

  it('branches on studioAnalyzerRe to load studio bootstrap', () => {
    assert.ok(
      SRC.includes('studioAnalyzerRe.test(path)'),
      'main.js must branch on studioAnalyzerRe.test(path)',
    );
  });

  it('loads studio/bootstrap.tsx on match', () => {
    assert.ok(
      SRC.includes('./studio/bootstrap.tsx'),
      'main.js must lazy-load ./studio/bootstrap.tsx for Studio Analyzer routes',
    );
  });

  it('calls mountStudioAnalyzer() from the bootstrap module', () => {
    assert.ok(
      SRC.includes('mountStudioAnalyzer()'),
      'main.js must call mountStudioAnalyzer() from the studio bootstrap',
    );
  });

  it('falls back to loading ./app.js for all other paths', () => {
    assert.ok(
      SRC.includes('./app.js'),
      'main.js must fall back to loading ./app.js',
    );
  });

  it('strips trailing slash from path before matching', () => {
    // path = window.location.pathname.replace(/\/$/, "")
    assert.ok(
      SRC.includes('.replace(/\\/$/, "")') || SRC.includes(".replace(/\\/$/, '')"),
      'main.js must strip trailing slash from pathname',
    );
  });

  it('defaults to "/" when pathname is empty', () => {
    assert.ok(
      SRC.includes('|| "/"') || SRC.includes("|| '/'"),
      'main.js must default pathname to "/" when empty',
    );
  });
});
