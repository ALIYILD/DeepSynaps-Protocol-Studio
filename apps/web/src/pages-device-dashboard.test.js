// Tests for pages-device-dashboard.js
//
// Public export: pgDeviceDashboard(setTopbar)
//
// No __*TestApi__ seam. The module's helper functions (esc, fmtNum, fmtInt,
// fmtDate, fmtDateTime, fmtAgo, providerMeta, sparklineSVG, barChartSVG,
// lineChartSVG, demoDashboardData, renderKpis, renderTrendCharts,
// renderSyncHistory, renderConnectionHeader, renderDailyTable) are all
// module-private.
//
// Strategy:
//   1. Stub fetch so api.deviceSyncDashboard() returns a known payload.
//      This lets us verify the rendered KPI tiles, provider header,
//      sync history table, and daily summaries without relying on demo mode
//      (which requires import.meta.env.VITE_ENABLE_DEMO to be set, which is
//      not available in the Node test environment).
//   2. Also test the error-state render when no data is available (both fetch
//      fails and no demo fallback).
//
// NOTE: _isDemoMode() reads import.meta.env which is undefined in Node →
// returns false. Demo-data fallback therefore never runs in this test
// environment. We bypass this by stubbing fetch to return real data.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { pgDeviceDashboard } from './pages-device-dashboard.js';

// ── Synthetic dashboard payload ───────────────────────────────────────────────
function makeDashboardPayload(provider = 'apple_healthkit') {
  const now = Date.now();
  const summaries = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now - i * 86400000);
    summaries.push({
      date: d.toISOString().slice(0, 10),
      rhr_bpm: 62.0 + (Math.random() - 0.5) * 4,
      hrv_ms: 48.0 + (Math.random() - 0.5) * 8,
      sleep_duration_h: 7.2 + (Math.random() - 0.5),
      steps: 8500 + Math.round((Math.random() - 0.5) * 1700),
      spo2_pct: 97.5 + (Math.random() - 0.5) * 0.5,
      readiness_score: 78 + Math.round((Math.random() - 0.5) * 10),
    });
  }
  const latest = summaries[summaries.length - 1];
  const syncEvents = [
    { id: 'ev-0', event_id: 'ev-0', occurred_at: new Date(now - 1200000).toISOString(), event_type: 'sync_success', records_synced: 42, detail: null },
    { id: 'ev-1', event_id: 'ev-1', occurred_at: new Date(now - 5400000).toISOString(), event_type: 'sync_error',   records_synced: 0,  detail: 'Rate limit exceeded — retrying in 5m' },
  ];
  return {
    connection: {
      id: 'conn-test-001',
      source: provider,
      display_name: provider === 'apple_healthkit' ? 'Apple Health' : provider,
      status: 'active',
      last_sync_at: new Date(now - 1200000).toISOString(),
      patient_id: 'pt-test-001',
      patient_name: 'James Morrison',
    },
    kpis: {
      rhr_bpm: latest.rhr_bpm,
      hrv_ms: latest.hrv_ms,
      sleep_h: latest.sleep_duration_h,
      steps: latest.steps,
      spo2_pct: latest.spo2_pct,
      readiness: latest.readiness_score,
    },
    summaries,
    sync_events: syncEvents,
    trends: {
      rhr: summaries.map(s => s.rhr_bpm),
      hrv: summaries.map(s => s.hrv_ms),
      sleep: summaries.map(s => s.sleep_duration_h),
      steps: summaries.map(s => s.steps),
    },
  };
}

// ── DOM + fetch stub helpers ──────────────────────────────────────────────────
let _host;
let _origFetch;

function setupEnv(provider) {
  _host = { innerHTML: '' };
  globalThis.document = { getElementById: (id) => id === 'content' ? _host : null };
  globalThis.window = {
    ...(globalThis.window || {}),
    _nav: () => {},
    _dsToast: null,
    _deviceDashConnectionId: 'conn-test-001',
    _deviceDashProvider: provider || 'apple_healthkit',
  };
  _origFetch = globalThis.fetch;
  const payload = makeDashboardPayload(provider || 'apple_healthkit');
  globalThis.fetch = (url) => {
    if (String(url).includes('/dashboard')) {
      return Promise.resolve(new Response(
        JSON.stringify(payload),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      ));
    }
    return Promise.reject(new Error('unhandled request'));
  };
}

function teardownEnv() {
  delete globalThis.document;
  globalThis.fetch = _origFetch;
}

// ── Export shape ──────────────────────────────────────────────────────────────

describe('pgDeviceDashboard — export shape', () => {
  it('exports pgDeviceDashboard as a function', () => {
    assert.strictEqual(typeof pgDeviceDashboard, 'function');
  });

  it('pgDeviceDashboard returns a Promise', () => {
    setupEnv('fitbit');
    const p = pgDeviceDashboard(() => {});
    assert.ok(p instanceof Promise, 'must return a Promise');
    p.catch(() => {});
    // Immediately tear down — we'll let the promise settle silently
    globalThis.fetch = _origFetch;
    delete globalThis.document;
  });
});

// ── Rendered content (api returns real data) ──────────────────────────────────

describe('pgDeviceDashboard — rendered content (live stub)', () => {
  before(async () => {
    setupEnv('apple_healthkit');
    await pgDeviceDashboard(() => {});
  });
  after(() => teardownEnv());

  it('renders KPI grid with "Resting HR" tile label', () => {
    assert.ok(_host.innerHTML.includes('Resting HR'), '"Resting HR" label should be in KPI grid');
  });

  it('renders HRV tile', () => {
    assert.ok(_host.innerHTML.includes('HRV'), '"HRV" label should be present');
  });

  it('renders Sleep tile', () => {
    assert.ok(_host.innerHTML.includes('Sleep'), '"Sleep" label should be present');
  });

  it('renders SpO2 tile with % unit', () => {
    const html = _host.innerHTML;
    assert.ok(html.includes('SpO2'), '"SpO2" tile should be present');
    assert.ok(html.includes('%'), '% unit for SpO2');
  });

  it('renders Readiness tile with /100 unit', () => {
    const html = _host.innerHTML;
    assert.ok(html.includes('Readiness'), '"Readiness" tile should be present');
    assert.ok(html.includes('/100'), '/100 unit for Readiness');
  });

  it('renders Steps tile', () => {
    assert.ok(_host.innerHTML.includes('Steps'), '"Steps" tile should be present');
  });

  it('renders Sync History section heading', () => {
    assert.ok(_host.innerHTML.includes('Sync History'), '"Sync History" heading should be present');
  });

  it('renders sync error badge in history table', () => {
    // The stub payload includes a sync_error event
    assert.ok(_host.innerHTML.includes('Error'), 'sync error badge ("Error") should be in sync history');
  });

  it('renders Daily Summaries section', () => {
    assert.ok(_host.innerHTML.includes('Daily Summaries'), '"Daily Summaries" heading should be present');
  });

  it('renders patient name "James Morrison" in connection header', () => {
    assert.ok(_host.innerHTML.includes('James Morrison'), 'patient name should appear in connection header');
  });
});

// ── Provider metadata + setTopbar ────────────────────────────────────────────

describe('pgDeviceDashboard — provider metadata', () => {
  it('passes provider label to setTopbar for apple_healthkit', async () => {
    setupEnv('apple_healthkit');
    let topbarTitle = '';
    await pgDeviceDashboard((title) => { topbarTitle = title; });
    teardownEnv();
    assert.ok(topbarTitle.includes('Apple'), `topbar should include "Apple", got: "${topbarTitle}"`);
  });

  it('passes Fitbit label to setTopbar for fitbit provider', async () => {
    setupEnv('fitbit');
    let topbarTitle = '';
    await pgDeviceDashboard((title) => { topbarTitle = title; });
    teardownEnv();
    assert.ok(topbarTitle.includes('Fitbit'), `topbar should include "Fitbit", got: "${topbarTitle}"`);
  });
});

// ── Window handlers exposed after mount ───────────────────────────────────────

describe('pgDeviceDashboard — window handlers', () => {
  before(async () => {
    setupEnv('oura_ring');
    await pgDeviceDashboard(() => {});
  });
  after(() => teardownEnv());

  it('exposes window._ddTriggerSync as a function', () => {
    assert.strictEqual(typeof globalThis.window._ddTriggerSync, 'function');
  });

  it('exposes window._ddSetRange as a function', () => {
    assert.strictEqual(typeof globalThis.window._ddSetRange, 'function');
  });
});

// ── Error state render ────────────────────────────────────────────────────────

describe('pgDeviceDashboard — error state (fetch fails, no demo mode)', () => {
  let errorHost;

  before(async () => {
    errorHost = { innerHTML: '' };
    globalThis.document = { getElementById: (id) => id === 'content' ? errorHost : null };
    globalThis.window = {
      ...(globalThis.window || {}),
      _nav: () => {},
      _deviceDashConnectionId: 'conn-offline',
      _deviceDashProvider: 'garmin_connect',
    };
    _origFetch = globalThis.fetch;
    // Make fetch fail — no demo data fallback in Node env
    globalThis.fetch = () => Promise.reject(new Error('offline'));
    await pgDeviceDashboard(() => {});
  });
  after(() => {
    delete globalThis.document;
    globalThis.fetch = _origFetch;
  });

  it('renders error message "Failed to load device data" when fetch fails', () => {
    assert.ok(
      errorHost.innerHTML.includes('Failed to load device data') ||
      errorHost.innerHTML.includes('No data available'),
      'error state should indicate data unavailability'
    );
  });
});
