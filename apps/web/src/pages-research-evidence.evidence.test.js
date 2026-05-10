import test from 'node:test';
import assert from 'node:assert/strict';

function makeNode(id = '') {
  return {
    id,
    innerHTML: '',
    textContent: '',
    className: '',
    style: {},
    dataset: {},
    hidden: false,
    value: '',
    children: [],
    classList: { add() {}, remove() {}, contains() { return false; } },
    appendChild(child) { this.children.push(child); return child; },
    remove() {},
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    setAttribute() {},
  };
}

const byId = new Map();

function installDom() {
  if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
  globalThis.document = {
    getElementById(id) {
      if (!byId.has(id)) byId.set(id, makeNode(id));
      return byId.get(id);
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement(tag) { return makeNode(tag); },
    addEventListener() {},
    body: makeNode('body'),
  };
  const storage = {};
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: (k) => (k in storage ? storage[k] : null),
      setItem: (k, v) => { storage[k] = String(v); },
      removeItem: (k) => { delete storage[k]; },
      clear: () => { for (const k of Object.keys(storage)) delete storage[k]; },
    },
  });
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: () => null,
      setItem() {},
      removeItem() {},
      clear() {},
    },
  });
  if (typeof globalThis.import === 'undefined') {
    globalThis.import = { meta: { env: {} } };
  } else if (!globalThis.import.meta) {
    globalThis.import.meta = { env: {} };
  }
}

installDom();

const src = await import('fs').then(fs => 
  fs.readFileSync('./apps/web/src/pages-research-evidence.js', 'utf-8')
);

test('pages-research-evidence.js contains clinical disclaimer banner function', () => {
  assert.match(src, /_resClinicalDisclaimerBanner/);
  assert.match(src, /controlled preview evidence workspace/i);
  assert.match(src, /It does not diagnose, prescribe, approve treatment, triage emergencies, or act autonomously/i);
});

test('pages-research-evidence.js calls clinical disclaimer in header', () => {
  // The _resWorkspaceHeader should call _resClinicalDisclaimerBanner
  assert.match(src, /_resClinicalDisclaimerBanner\(\)/);
});

test('pages-research-evidence.js does not contain fake paper counts (87k)', () => {
  // Exact pattern: "87k" or "87K" with "papers" nearby would be fake
  const lines = src.split('\n');
  let found87k = false;
  for (let i = 0; i < lines.length; i++) {
    if (/87\s*k|87\s*K/.test(lines[i]) && /paper/.test(lines[i])) {
      found87k = true;
      console.log(`Found fake 87k claim at line ${i + 1}: ${lines[i]}`);
    }
  }
  assert.strictEqual(found87k, false, 'Found fake 87k+ papers claim');
});

test('pages-research-evidence.js contains empty state honesty banner', () => {
  // When API/DB is unavailable, should show degraded mode message
  assert.match(src, /_resBundledDegradedBanner/);
  assert.match(src, /unavailable.*preview environment/i);
  assert.match(src, /navigation only/i);
  assert.match(src, /not verified search results/i);
});

test('pages-research-evidence.js does not make autonomous clinical claims', () => {
  // Check for phrases that claim the page makes autonomous decisions in POSITIVE context
  // (i.e., phrases like "it treats X" or "it diagnoses Y", not "does NOT diagnose")
  const lines = src.split('\n');
  let foundPositiveClaims = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Look for positive autonomous claims (skip negations with "not", "does not", "can't")
    if (/^[^/]*(?<!not )(?<!does not )(?<!can't )(?<!cannot )(?<!won't )(automatically treats|automatically diagnoses|autonomous clinical decision-making[^)]|it treats|it cures|will treat|will cure|guaranteed [a-z]+ [a-z]+ (cure|treat))/i.test(line)) {
      foundPositiveClaims = true;
      console.log(`Line ${i + 1}: ${line}`);
    }
  }
  
  assert.strictEqual(foundPositiveClaims, false, 'Found positive autonomous clinical claims');
});

test('pages-research-evidence.js references api.evidencePaperDetail in api.js', async () => {
  const apiSrc = await import('fs').then(fs =>
    fs.readFileSync('./apps/web/src/api.js', 'utf-8')
  );
  assert.match(apiSrc, /evidencePaperDetail/);
});

test.afterEach(() => {
  byId.clear();
});
