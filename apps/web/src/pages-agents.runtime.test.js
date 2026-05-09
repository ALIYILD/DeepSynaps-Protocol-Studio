import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM(
  `<!doctype html>
   <html>
     <body>
       <div id="content"></div>
     </body>
   </html>`,
  { url: 'https://example.test/' },
);

const store = {};
const storage = {
  getItem(key) {
    return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
  },
  setItem(key, value) {
    store[key] = String(value);
  },
  removeItem(key) {
    delete store[key];
  },
  clear() {
    for (const key of Object.keys(store)) delete store[key];
  },
};

globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.location = dom.window.location;
globalThis.localStorage = storage;
globalThis.sessionStorage = storage;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Node = dom.window.Node;
globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || ((cb) => setTimeout(cb, 0));
globalThis.cancelAnimationFrame = globalThis.cancelAnimationFrame || clearTimeout;

const mod = await import('./pages-agents.js');

test.beforeEach(() => {
  storage.clear();
  document.getElementById('content').innerHTML = '';
  mod.__aiAgentV2TestApi__.reset();
});

test('canUseAiAgentV2Workspace honors role access from localStorage', () => {
  storage.setItem('ds_user', JSON.stringify({ role: 'patient' }));
  assert.equal(mod.canUseAiAgentV2Workspace(), false);
  storage.setItem('ds_user', JSON.stringify({ role: 'clinician' }));
  assert.equal(mod.canUseAiAgentV2Workspace(), true);
});

test('pgAgentChat renders the restricted notice for patient roles', async () => {
  storage.setItem('ds_user', JSON.stringify({ role: 'patient' }));
  let topbarTitle = '';
  await mod.pgAgentChat((title) => {
    topbarTitle = title;
  });
  assert.equal(topbarTitle, 'AI Agents');
  assert.match(document.getElementById('content').innerHTML, /Clinician workspace only/);
  assert.match(document.getElementById('content').innerHTML, /AI Agent v2 is for authorised clinical staff/);
});
