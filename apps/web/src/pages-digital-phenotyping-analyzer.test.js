/**
 * Digital Phenotyping Analyzer workspace helpers and safety copy regression.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { demoDigitalPhenotypingPayload } from './demo-fixtures-analyzers.js';
import {
  applyDigitalPhenotypingPatientContext,
  canUseDigitalPhenotypingWorkspace,
  digitalPhenotypingClinicEmptyStateHtml,
  loadDigitalPhenotypingClinicSummary,
  resolveDigitalPhenotypingPatientId,
  wireDigitalPhenotypingLinkedNav,
} from './pages-digital-phenotyping-analyzer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function readPageSrc() {
  return readFileSync(resolve(__dirname, 'pages-digital-phenotyping-analyzer.js'), 'utf8');
}

function installDom(html = '<!doctype html><html><body></body></html>') {
  const dom = new JSDOM(html, { url: 'https://example.test/digital-phenotyping' });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    Event: globalThis.Event,
    HTMLElement: globalThis.HTMLElement,
    Node: globalThis.Node,
  };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Event = dom.window.Event;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;
  return {
    window: dom.window,
    restore() {
      dom.window.close();
      globalThis.window = previous.window;
      globalThis.document = previous.document;
      globalThis.Event = previous.Event;
      globalThis.HTMLElement = previous.HTMLElement;
      globalThis.Node = previous.Node;
    },
  };
}

test('demoDigitalPhenotypingPayload has snapshot keys and multimodal links', () => {
  const p = demoDigitalPhenotypingPayload('demo-pt-samantha-li');
  assert.equal(p.patient_id, 'demo-pt-samantha-li');
  assert.ok(p.snapshot?.mobility_stability?.value != null);
  assert.ok(p.snapshot?.data_completeness?.value != null);
  assert.equal(p.provenance?.source_system, 'demo_sample');
  const pages = (p.multimodal_links || []).map((l) => l.nav_page_id);
  assert.ok(pages.includes('research-evidence'));
  assert.ok(pages.includes('qeeg-launcher'));
  assert.ok(pages.includes('risk-analyzer'));
  assert.ok(pages.includes('session-execution'));
  assert.ok(pages.includes('live-session'));
  assert.ok(pages.includes('protocol-studio'));
  assert.ok(pages.includes('deeptwin'));
  assert.ok(pages.includes('ai-agent-v2'));
});

test('canUseDigitalPhenotypingWorkspace requires clinician or admin', () => {
  assert.equal(canUseDigitalPhenotypingWorkspace('clinician'), true);
  assert.equal(canUseDigitalPhenotypingWorkspace('admin'), true);
  assert.equal(canUseDigitalPhenotypingWorkspace('reviewer'), false);
  assert.equal(canUseDigitalPhenotypingWorkspace('technician'), false);
  assert.equal(canUseDigitalPhenotypingWorkspace(''), false);
  assert.equal(canUseDigitalPhenotypingWorkspace('', { allowUnknown: true }), true);
});

test('resolveDigitalPhenotypingPatientId prefers selected, profile, then deeptwin context', () => {
  assert.equal(
    resolveDigitalPhenotypingPatientId({
      _selectedPatientId: 'pt-selected',
      _profilePatientId: 'pt-profile',
      _deeptwinPatientId: 'pt-deeptwin',
    }),
    'pt-selected',
  );
  assert.equal(
    resolveDigitalPhenotypingPatientId({
      _profilePatientId: 'pt-profile',
      _deeptwinPatientId: 'pt-deeptwin',
    }),
    'pt-profile',
  );
  assert.equal(resolveDigitalPhenotypingPatientId({ _deeptwinPatientId: 'pt-deeptwin' }), 'pt-deeptwin');
  assert.equal(resolveDigitalPhenotypingPatientId({}), '');
});

test('applyDigitalPhenotypingPatientContext seeds linked workflow patient context', () => {
  const win = {};
  applyDigitalPhenotypingPatientContext('deeptwin', 'pt-88', win);
  assert.equal(win._selectedPatientId, 'pt-88');
  assert.equal(win._profilePatientId, 'pt-88');
  assert.equal(win._deeptwinPatientId, 'pt-88');
});

test('wireDigitalPhenotypingLinkedNav preserves patient scope before navigation fires', () => {
  const { window, restore } = installDom(`
    <!doctype html>
    <html>
      <body>
        <div id="host">
          <button type="button" data-nav-page="risk-analyzer">Risk</button>
        </div>
      </body>
    </html>
  `);

  try {
    const observed = [];
    window._selectedPatientId = 'stale-patient';
    window._profilePatientId = 'stale-patient';
    const host = document.getElementById('host');
    const bound = wireDigitalPhenotypingLinkedNav(host, (page, params) => {
      observed.push({
        page,
        params,
        selectedPatientId: window._selectedPatientId,
        profilePatientId: window._profilePatientId,
      });
    }, 'pt-401', window);

    assert.equal(bound, 1);
    host.querySelector('[data-nav-page="risk-analyzer"]').click();
    assert.deepEqual(observed, [{
      page: 'risk-analyzer',
      params: { id: 'pt-401' },
      selectedPatientId: 'pt-401',
      profilePatientId: 'pt-401',
    }]);
  } finally {
    restore();
  }
});

test('loadDigitalPhenotypingClinicSummary stays honest without a live clinic feed', async () => {
  const summary = await loadDigitalPhenotypingClinicSummary();
  assert.deepEqual(summary, { patients: [], unsupportedLiveSummary: true });
});

test('digital phenotyping empty-state copy distinguishes supported-empty from unsupported backend', () => {
  const supported = digitalPhenotypingClinicEmptyStateHtml({ unsupportedLiveSummary: false });
  const unsupported = digitalPhenotypingClinicEmptyStateHtml({ unsupportedLiveSummary: true });
  assert.match(supported, /returned no patient rows/i);
  assert.doesNotMatch(supported, /does not yet have a live clinic-summary backend feed/i);
  assert.match(unsupported, /backend feed is unavailable on this environment/i);
});

test('loadDigitalPhenotypingClinicSummary can use demo fixtures explicitly', async () => {
  const summary = await loadDigitalPhenotypingClinicSummary({ useDemoFixtures: true });
  assert.ok(Array.isArray(summary.patients));
  assert.ok(summary.fromDemoOnly);
});

test('required governance copy is present on the page module', () => {
  const src = readPageSrc();
  assert.match(
    src,
    /Digital phenotype outputs are exploratory decision-support cues/,
    'required governance sentence must be present',
  );
});

test('page source avoids banned clinical / protocol-selection wording', () => {
  const src = readPageSrc();
  const banned = [
    'best protocol',
    'demo_fixture',
    'non-adherent',
    'eligible for treatment',
    'surveillance detected',
    'diagnosis likely',
    'confirmed phenotype',
  ];
  const lower = src.toLowerCase();
  for (const b of banned) {
    assert.ok(!lower.includes(b), `must not contain blocked phrase: ${b}`);
  }
  assert.ok(
    !/"all clear"/i.test(src) && !/>all clear</i.test(src),
    'must not show all-clear empty state phrasing',
  );
});
