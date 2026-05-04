// ERP tab wiring on qEEG Analyzer — mirrors launch-audit test bootstrap.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

import {
  erpFormatBidsSummaryHtml,
  erpResolveBidsUploadMeta,
} from './erp-event-mapping.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const _readSrc = (rel) => fs.readFileSync(path.join(__dirname, rel), 'utf8');

if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}
function installStorageStub(name) {
  const desc = Object.getOwnPropertyDescriptor(globalThis, name);
  if (desc && desc.value && typeof desc.value.getItem === 'function') return;
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value: { getItem() { return null; }, setItem() {}, removeItem() {} },
  });
}
installStorageStub('localStorage');
installStorageStub('sessionStorage');

test('TAB_META includes ERP tab', async () => {
  const { TAB_META } = await import('./pages-qeeg-analysis.js');
  assert.ok(TAB_META.erp);
  assert.ok(String(TAB_META.erp.label).includes('ERP'));
});

test('ERP tab markup includes test ids and clinical guardrails', () => {
  const src = _readSrc('./pages-qeeg-analysis.js');
  const erpMapSrc = _readSrc('./erp-event-mapping.js');
  assert.match(src, /erpFormatBidsSummaryHtml\(bidsMeta\)/);
  assert.match(src, /erpResolveBidsUploadMeta\(/);
  assert.match(src, /data-testid="qeeg-erp-preset"/);
  assert.match(src, /data-testid="qeeg-erp-run"/);
  assert.match(src, /data-testid="qeeg-erp-guardrails"/);
  assert.match(src, /data-testid="qeeg-erp-metrics-table"/);
  assert.match(src, /data-testid="qeeg-erp-waveform-svg"/);
  assert.match(src, /data-testid="qeeg-erp-bids-upload"/);
  assert.match(src, /data-testid="qeeg-erp-bids-file"/);
  assert.match(erpMapSrc, /data-testid="qeeg-erp-bids-summary"/);
  assert.match(erpMapSrc, /data-testid="qeeg-erp-bids-sidecar-ref"/);
  assert.match(src, /data-testid="qeeg-erp-bids-apply-map"/);
  assert.match(src, /data-testid="qeeg-erp-map-run-warnings"/);
  assert.match(src, /data-testid="qeeg-erp-mapping-warnings"/);
  assert.match(src, /data-testid="qeeg-erp-map"/);
  assert.match(src, /Decision-support only — ERP/);
  assert.match(src, /Clinical interpretation guardrails/);
});

test('ERP tab BIDS summary restores from persisted analysis metadata after reload (no session upload)', () => {
  const pageSrc = _readSrc('./pages-qeeg-analysis.js');
  assert.match(pageSrc, /data-testid="qeeg-erp-bids-upload"/, 'ERP tab still exposes sidecar upload control');
  assert.match(pageSrc, /data-testid="qeeg-erp-map"/, 'event_id_map JSON editor remains');
  assert.match(pageSrc, /Decision-support only — ERP/, 'decision-support launch notice');
  assert.match(pageSrc, /data-testid="qeeg-erp-guardrails"/, 'clinician-review guardrails card');

  const analysisId = 'erp-reload-unit-test';
  const mockAnalysis = {
    id: analysisId,
    patient_id: 'demo-sarah-johnson',
    advanced_analyses: {
      erp: {
        bids_upload_summary: {
          row_count: 3,
          trial_types: ['standard', 'target'],
          sidecar_ref: 'demo/path/recording_stem_events.tsv',
          uploaded_at: '2026-05-04T12:00:00Z',
          normalized: false,
          warnings: [],
        },
      },
    },
  };

  const bm = erpResolveBidsUploadMeta(analysisId, mockAnalysis, null);
  assert.ok(bm);
  assert.equal(bm.row_count, 3);
  assert.deepEqual(bm.trial_types, ['standard', 'target']);
  assert.equal(bm.sidecar_ref, 'demo/path/recording_stem_events.tsv');

  const html = erpFormatBidsSummaryHtml(bm);
  const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="wrap"></div></body></html>`);
  const wrap = dom.window.document.getElementById('wrap');
  wrap.innerHTML = html;

  assert.match(wrap.textContent, /3/);
  const trialTypes = wrap.querySelector('[data-testid="qeeg-erp-bids-trial-types"]');
  assert.ok(trialTypes);
  assert.match(trialTypes.textContent, /standard/);
  assert.match(trialTypes.textContent, /target/);

  const sidecarEl = wrap.querySelector('[data-testid="qeeg-erp-bids-sidecar-ref"]');
  assert.ok(sidecarEl);
  assert.match(sidecarEl.textContent, /recording_stem_events\.tsv/);

  assert.match(wrap.innerHTML, /2026-05-04T12:00:00Z/);
});

test('session upload wins over persisted analysis when analysis ids match', () => {
  const analysisId = 'same-id';
  const mockAnalysis = {
    id: analysisId,
    advanced_analyses: {
      erp: {
        bids_upload_summary: {
          row_count: 99,
          trial_types: ['persisted'],
          sidecar_ref: 'persisted.tsv',
          uploaded_at: '2020-01-01T00:00:00Z',
          normalized: false,
          warnings: [],
        },
      },
    },
  };
  const session = {
    analysisId,
    row_count: 1,
    trial_types: ['live'],
    warnings: [],
    normalized: false,
    sidecar_ref: 'session.tsv',
  };
  const bm = erpResolveBidsUploadMeta(analysisId, mockAnalysis, session);
  assert.equal(bm.row_count, 1);
  assert.deepEqual(bm.trial_types, ['live']);
});
