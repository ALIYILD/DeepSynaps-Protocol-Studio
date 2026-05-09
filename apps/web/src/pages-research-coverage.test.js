import { before, after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

let dom;
let mod;
let savedWindow;
let savedDocument;
let savedFetch;
let savedLocalStorage;
let savedResponse;
let requests;
let toasts;
let currentRoutes;

function installDom() {
  dom = new JSDOM('<!doctype html><html><body><div id="content"></div></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  });

  savedWindow = globalThis.window;
  savedDocument = globalThis.document;
  savedFetch = globalThis.fetch;
  savedLocalStorage = globalThis.localStorage;
  savedResponse = globalThis.Response;

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.localStorage = dom.window.localStorage;
  globalThis.Response = globalThis.Response || dom.window.Response;
  globalThis.window.Response = globalThis.Response;
}

function uninstallDom() {
  globalThis.window = savedWindow;
  globalThis.document = savedDocument;
  globalThis.fetch = savedFetch;
  globalThis.localStorage = savedLocalStorage;
  globalThis.Response = savedResponse;
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function installFetch(router) {
  currentRoutes = router;
  requests = [];
  globalThis.fetch = async (input, init = {}) => {
    const rawUrl = typeof input === 'string' ? input : input.url;
    const url = new URL(rawUrl, 'http://localhost');
    const method = (init.method || 'GET').toUpperCase();
    const bodyText = typeof init.body === 'string' ? init.body : null;
    const body = bodyText ? JSON.parse(bodyText) : null;
    requests.push({ pathname: url.pathname, search: url.search, method, body });
    const routed = await currentRoutes(url, { method, body, init });
    return routed || jsonResponse({});
  };
}

async function flush() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function contentText() {
  return document.getElementById('content')?.textContent || '';
}

before(async () => {
  installDom();
  mod = await import('./pages-research.js');
});

after(() => {
  uninstallDom();
});

beforeEach(() => {
  document.getElementById('content').innerHTML = '';
  requests = [];
  toasts = [];
  window._researchTab = undefined;
  window._researchCohort = undefined;
  window._researchFrom = undefined;
  window._researchTo = undefined;
  window._researchExportFormat = undefined;
  window._researchExportConsent = undefined;
  window._dsToast = (payload) => { toasts.push(payload); return true; };
});

describe('pages-research runtime coverage', () => {
  it('mounts QA, longitudinal, data export, and IRB flows with live execution', async () => {
    installFetch((url, req) => {
      if (url.pathname === '/api/v1/evidence/research/protocol-coverage') {
        return jsonResponse({
          rows: [
            { condition: 'Major Depression', modality: 'tDCS · DLPFC-L', coverage: 92, gap: 'None', reviewed: 'May 01', id: 'pc-live-1' },
            { condition: 'OCD', modality: 'tRNS', coverage: 44, gap: 'Pending SOP', reviewed: 'Apr 11', id: 'pc-live-2' },
          ],
        });
      }
      if (url.pathname === '/api/v1/outcomes/longitudinal') {
        return jsonResponse({
          series: {
            'PHQ-9': [16, 14, 12, 9],
            'GAD-7': [13, 11, 10, 8],
            'Y-BOCS': [24, 20, 18, 15],
          },
          responderByModality: [
            { modality: 'tDCS · DLPFC-L', rate: [30, 42, 55, 63], color: '#00d4bc' },
            { modality: 'tACS · theta', rate: [18, 24, 31, 39], color: '#9b7fff' },
          ],
        });
      }
      if (url.pathname === '/api/v1/evidence/research/exports/summary') {
        return jsonResponse({
          patients_eligible: 222,
          sessions: '4,806',
          assessments: '7,901',
          modality_condition_pairs: 64,
        });
      }
      if (url.pathname === '/api/v1/evidence/research/exports/schedules') {
        return jsonResponse([
          { name: 'Nightly archive', cron: '0 2 * * *', target: 'archive/nightly.csv', status: 'active' },
          { name: 'Weekly regulator pack', cron: '0 4 * * 1', target: 'archive/regulator.json', status: 'paused' },
        ]);
      }
      if (url.pathname === '/api/v1/evidence/research/exports/individual') {
        assert.strictEqual(req.method, 'POST');
        return jsonResponse({ ok: true });
      }
      if (url.pathname === '/api/v1/evidence/research/exports/dataset') {
        assert.strictEqual(req.method, 'POST');
        return jsonResponse({ ok: true });
      }
      if (url.pathname === '/api/v1/evidence/research/exports/bundle') {
        assert.strictEqual(req.method, 'POST');
        return jsonResponse({ ok: true });
      }
      if (url.pathname === '/api/v1/irb/protocols' && req.method === 'GET') {
        return jsonResponse({
          items: [
            { id: 'IRB-LIVE-1', title: 'tRNS for GAD', pi: 'Dr. Rivera', sites: 2, targetN: 48, enrolled: 21, status: 'recruiting' },
          ],
        });
      }
      if (url.pathname === '/api/v1/irb/adverse-events') {
        return jsonResponse({
          items: [
            { id: 'AE-LIVE-1', title: 'Transient dizziness', sub: 'Dana K. · IRB-LIVE-1 · due 24h', sev: 'mod' },
          ],
        });
      }
      if (url.pathname === '/api/v1/irb/protocols' && req.method === 'POST') {
        return jsonResponse({ id: 'IRB-NEW-1' });
      }
      throw new Error(`Unhandled route: ${req.method} ${url.pathname}${url.search}`);
    });

    let topbarTitle = '';
    let topbarActions = '';
    await mod.pgResearch((title, actions) => {
      topbarTitle = title;
      topbarActions = actions;
    }, () => {});

    assert.match(topbarTitle, /Research/);
    assert.match(topbarActions, /Export bundle/);
    assert.match(contentText(), /Protocol coverage audit/);
    assert.match(contentText(), /Major Depression/);
    assert.doesNotMatch(contentText(), /Preview Data/);

    await window._researchMarkReviewed('pc-live-1');
    assert.deepStrictEqual(toasts.pop(), {
      title: 'Protocol pc-live-1',
      body: 'No live mark-reviewed endpoint is wired for this build.',
      severity: 'warn',
    });

    window._researchSetTab('long');
    await flush();
    assert.match(contentText(), /Outcome trends/);
    assert.match(contentText(), /Responder rate by modality/);

    window._researchSetCohort('PTSD');
    await flush();
    let latestLong = requests.filter((r) => r.pathname === '/api/v1/outcomes/longitudinal').at(-1);
    assert.ok(latestLong.search.includes('cohort=PTSD'));

    window._researchSetFrom('2026-02-01');
    window._researchSetTo('2026-04-20');
    await window._researchRender();
    latestLong = requests.filter((r) => r.pathname === '/api/v1/outcomes/longitudinal').at(-1);
    assert.ok(latestLong.search.includes('from=2026-02-01'));
    assert.ok(latestLong.search.includes('to=2026-04-20'));

    window._researchSetTab('exp');
    await flush();
    assert.match(contentText(), /GDPR Article 20/);
    assert.match(contentText(), /Nightly archive/);
    assert.match(contentText(), /222/);

    await window._researchExportIndividual();
    assert.deepStrictEqual(toasts.pop(), {
      title: 'Patient ID required',
      body: 'Enter a patient ID or email before exporting.',
      severity: 'warn',
    });

    document.getElementById('_researchPtMrn').value = 'patient-42';
    document.getElementById('_researchPtFormat').value = 'CSV';
    await window._researchExportIndividual();
    let latestRequest = requests.filter((r) => r.pathname === '/api/v1/evidence/research/exports/individual').at(-1);
    assert.deepStrictEqual(latestRequest.body, { patient_query: 'patient-42', format: 'CSV' });
    assert.deepStrictEqual(toasts.pop(), {
      title: 'GDPR export · patient-42',
      body: 'Submitted.',
      severity: 'ok',
    });

    window._researchSetConsent('analytics');
    window._researchSetFormat('FHIR');
    await window._researchBuildDataset();
    latestRequest = requests.filter((r) => r.pathname === '/api/v1/evidence/research/exports/dataset').at(-1);
    assert.deepStrictEqual(latestRequest.body, {
      consent: 'analytics',
      format: 'FHIR',
      kind: 'dataset',
    });
    assert.deepStrictEqual(toasts.pop(), {
      title: 'Dataset export',
      body: 'Submitted.',
      severity: 'ok',
    });

    await window._researchExportAll();
    latestRequest = requests.filter((r) => r.pathname === '/api/v1/evidence/research/exports/bundle').at(-1);
    assert.strictEqual(latestRequest.method, 'POST');
    assert.deepStrictEqual(toasts.pop(), {
      title: 'Research bundle export',
      body: 'Submitted.',
      severity: 'ok',
    });

    window._researchSetTab('irb');
    await flush();
    assert.match(contentText(), /New protocol authoring/);
    assert.match(contentText(), /tRNS for GAD/);
    assert.match(contentText(), /AE-LIVE-1/);

    await window._researchCreateIrb();
    assert.deepStrictEqual(toasts.pop(), {
      title: 'Required fields missing',
      body: 'Title and PI are required.',
      severity: 'warn',
    });

    document.getElementById('_irbTitle').value = 'Theta burst follow-up';
    document.getElementById('_irbPI').value = 'Dr. Nadir';
    document.getElementById('_irbSites').value = 'Oxford';
    document.getElementById('_irbN').value = '36';
    document.getElementById('_irbIncl').value = 'Adults with stable diagnosis';
    document.getElementById('_irbExcl').value = 'Pregnancy';
    await window._researchCreateIrb();
    latestRequest = requests.filter((r) => r.pathname === '/api/v1/irb/protocols' && r.method === 'POST').at(-1);
    assert.deepStrictEqual(latestRequest.body, {
      title: 'Theta burst follow-up',
      pi: 'Dr. Nadir',
      sites: 'Oxford',
      target_n: 36,
      inclusion: 'Adults with stable diagnosis',
      exclusion: 'Pregnancy',
    });
    assert.deepStrictEqual(toasts.pop(), {
      title: 'IRB draft "Theta burst follow-up"',
      body: 'Submitted.',
      severity: 'ok',
    });
  });

  it('surfaces preview and endpoint-unavailable states honestly when APIs are absent', async () => {
    installFetch((url, req) => {
      if (url.pathname === '/api/v1/evidence/research/protocol-coverage') return jsonResponse({ rows: [] });
      if (url.pathname === '/api/v1/outcomes/longitudinal') return jsonResponse(null);
      if (url.pathname === '/api/v1/evidence/research/exports/summary') return jsonResponse(null);
      if (url.pathname === '/api/v1/evidence/research/exports/schedules') return jsonResponse({ nope: true });
      if (url.pathname === '/api/v1/irb/protocols' && req.method === 'GET') return jsonResponse({ items: [] });
      if (url.pathname === '/api/v1/irb/adverse-events') return jsonResponse({ items: [] });
      throw new Error(`Unhandled preview route: ${req.method} ${url.pathname}`);
    });

    await mod.pgResearch(() => {}, () => {});
    assert.match(contentText(), /Preview Data/);
    assert.match(contentText(), /sample protocol-coverage rows/);

    window._researchSetTab('long');
    await flush();
    assert.match(contentText(), /fixed preview series/);

    window._researchSetTab('exp');
    await flush();
    assert.match(contentText(), /fallback rows/);

    await window._researchBuildDataset();
    assert.deepStrictEqual(toasts.pop(), {
      title: 'Dataset export',
      body: 'Network error',
      severity: 'warn',
    });

    await window._researchExportAll();
    assert.deepStrictEqual(toasts.pop(), {
      title: 'Research bundle export',
      body: 'Network error',
      severity: 'warn',
    });

    window._researchSetTab('irb');
    await flush();
    assert.match(contentText(), /IRB protocols are showing preview rows/);
    assert.match(contentText(), /IRB adverse-event escalation is showing preview rows/);
  });
});
