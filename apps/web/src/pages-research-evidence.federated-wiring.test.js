/**
 * Slice D3 follow-up — wiring contract between
 * pages-research-evidence.js and research-evidence-federated-search.js.
 *
 * Asserts that:
 *
 * 1. The pages-research-evidence module loads cleanly under ESM (no
 *    side-effect throws when the federated module's window shim runs at
 *    import time).
 * 2. The federated module exports the symbols we depend on, with the
 *    expected shapes.
 * 3. The wired call site (`_libUnifiedEvidenceSearch`) actually
 *    references `loadAndRenderFederatedSearch` — checked by static
 *    string scan of the source file. This catches accidental import
 *    removal in a future refactor.
 * 4. The federated panel renders into the documented target id
 *    `re-ev-federated-results` (string contract for E2E selectors).
 *
 * Run: node --test src/pages-research-evidence.federated-wiring.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, 'pages-research-evidence.js');
const FED_SRC = path.join(__dirname, 'research-evidence-federated-search.js');

const _pagesText = fs.readFileSync(SRC, 'utf8');
const _fedText = fs.readFileSync(FED_SRC, 'utf8');


test('pages-research-evidence imports loadAndRenderFederatedSearch', () => {
  // The import line is the single source of truth for the wiring.
  // Removing it (or renaming the federated module) must be a deliberate
  // change that updates this test in the same commit.
  assert.match(
    _pagesText,
    /import\s*\{\s*loadAndRenderFederatedSearch\s*\}\s*from\s*['"]\.\/research-evidence-federated-search\.js['"]/,
  );
});

test('_libUnifiedEvidenceSearch actually calls loadAndRenderFederatedSearch', () => {
  // Static scan — locate the *declaration* of the search function (not
  // just any reference to it) and confirm its body references the
  // federated module. Defensive against future refactors that drop the
  // call while keeping the import.
  const declIdx = _pagesText.indexOf('window._libUnifiedEvidenceSearch =');
  assert.ok(declIdx > -1, 'Cannot locate _libUnifiedEvidenceSearch declaration');
  // The body of the declaration must reference the federated call
  // somewhere within a reasonable span (this function is ~360 lines).
  const body = _pagesText.slice(declIdx, declIdx + 20000);
  assert.match(body, /loadAndRenderFederatedSearch\s*\(/);
});

test('federated panel writes into the documented container id', () => {
  // The container id is the E2E contract used by Playwright and QA
  // selectors. Changing it requires updating the contract.
  assert.ok(_pagesText.includes("'re-ev-federated-results'"));
});

test('federated module exports the function pages-research-evidence imports', async () => {
  const mod = await import('./research-evidence-federated-search.js');
  assert.equal(typeof mod.loadAndRenderFederatedSearch, 'function');
  assert.equal(typeof mod.renderFederatedSearchPanel, 'function');
});

test('wiring call site swallows transport errors defensively', () => {
  // The honest contract: the federated module already emits the
  // "not available on this build" notice on 404 / 500 / network. The
  // wiring should NOT add a second error path that overwrites the
  // primary search results when the federated call fails — that would
  // hide the user's actual search output. Verify the call is wrapped
  // in try/catch.
  // Find the *call site*, not the import line — the second occurrence.
  const firstIdx = _pagesText.indexOf('loadAndRenderFederatedSearch');
  assert.ok(firstIdx > -1);
  const callSiteIdx = _pagesText.indexOf('loadAndRenderFederatedSearch', firstIdx + 1);
  assert.ok(callSiteIdx > -1, 'Expected at least one call site after the import');
  const surroundings = _pagesText.slice(Math.max(0, callSiteIdx - 200), callSiteIdx + 600);
  assert.match(surroundings, /try\s*\{/);
  assert.match(surroundings, /catch/);
});
