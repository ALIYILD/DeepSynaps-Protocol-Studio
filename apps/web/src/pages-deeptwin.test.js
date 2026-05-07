import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { api } from './api.js';
import {
  buildDeepTwinExportFilename,
  deeptwinHasPatientScope,
  deeptwinResolvedTab,
} from './pages-deeptwin.js';
import {
  mountSimulation,
  renderCorrelations,
  renderPrediction,
  renderSignalMatrix,
  renderSimulationDetail,
  renderTimeline,
  simulationHasRenderableOutput,
} from './deeptwin/components.js';
import {
  describeTribeComparisonStatus,
  renderTribeComparisonResult,
} from './deeptwin/tribe.js';
import {
  applyDashboard360PatientContext,
  loadDashboard360,
  renderDashboard360,
  wireDashboard360Actions,
} from './deeptwin/dashboard360.js';
import { buildDemoDashboard360Payload } from './deeptwin/demo-dashboard-payload.js';

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body><div id="content"></div></body></html>', {
    url: 'https://example.test/deeptwin',
  });

  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    sessionStorage: globalThis.sessionStorage,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    Event: globalThis.Event,
    KeyboardEvent: globalThis.KeyboardEvent,
    HTMLElement: globalThis.HTMLElement,
    Node: globalThis.Node,
  };

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.sessionStorage = dom.window.sessionStorage;
  globalThis.requestAnimationFrame = (cb) => cb();
  globalThis.Event = dom.window.Event;
  globalThis.KeyboardEvent = dom.window.KeyboardEvent;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;

  return {
    window: dom.window,
    restore() {
      dom.window.close();
      globalThis.window = previous.window;
      globalThis.document = previous.document;
      globalThis.sessionStorage = previous.sessionStorage;
      globalThis.requestAnimationFrame = previous.requestAnimationFrame;
      globalThis.Event = previous.Event;
      globalThis.KeyboardEvent = previous.KeyboardEvent;
      globalThis.HTMLElement = previous.HTMLElement;
      globalThis.Node = previous.Node;
    },
  };
}

function installToken(token) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem(key) {
        return key === 'ds_access_token' ? token : null;
      },
    },
  });
  return () => {
    if (previous) {
      Object.defineProperty(globalThis, 'localStorage', previous);
    } else {
      delete globalThis.localStorage;
    }
  };
}

test('DeepTwin tab guard blocks patientless tab changes', () => {
  assert.equal(deeptwinHasPatientScope(''), false);
  assert.equal(deeptwinHasPatientScope('   '), false);
  assert.equal(deeptwinResolvedTab('', '360'), 'overview');
  assert.equal(deeptwinResolvedTab('   ', 'notes'), 'overview');
  assert.equal(deeptwinResolvedTab('', 'review'), 'overview');
});

test('DeepTwin tab guard allows explicit demo and real patient scope', () => {
  assert.equal(deeptwinHasPatientScope('demo-patient'), true);
  assert.equal(deeptwinHasPatientScope('pt-123'), true);
  assert.equal(deeptwinResolvedTab('demo-patient', '360'), '360');
  assert.equal(deeptwinResolvedTab('pt-123', 'simulations'), 'simulations');
  assert.equal(deeptwinResolvedTab('pt-123', ''), 'overview');
});

test('applyDashboard360PatientContext persists patient scope into window and session storage', () => {
  const writes = [];
  const fakeWindow = { _selectedPatientId: 'old', _profilePatientId: 'old' };
  const fakeStorage = {
    setItem(key, value) {
      writes.push([key, value]);
    },
  };

  assert.equal(applyDashboard360PatientContext('', fakeWindow, fakeStorage), false);
  assert.equal(fakeWindow._selectedPatientId, 'old');
  assert.deepEqual(writes, []);

  assert.equal(applyDashboard360PatientContext('pt-360', fakeWindow, fakeStorage), true);
  assert.equal(fakeWindow._selectedPatientId, 'pt-360');
  assert.equal(fakeWindow._profilePatientId, 'pt-360');
  assert.deepEqual(writes, [['ds_pat_selected_id', 'pt-360']]);
});

test('360 panel navigation preserves patient context before navigation fires', () => {
  const { window, restore } = installDom();

  try {
    const payload = buildDemoDashboard360Payload('pt-360');
    document.getElementById('content').innerHTML = renderDashboard360(payload);

    const observed = [];
    window._selectedPatientId = 'stale-patient';
    window._profilePatientId = 'stale-patient';
    window._nav = (target) => {
      observed.push({
        target,
        selectedPatientId: window._selectedPatientId,
        profilePatientId: window._profilePatientId,
        storedPatientId: window.sessionStorage.getItem('ds_pat_selected_id'),
      });
    };

    wireDashboard360Actions(payload);

    const qeegCard = document.querySelector('.dt360-card[data-domain-key="qeeg"]');
    assert.ok(qeegCard, 'qEEG domain card should render');
    qeegCard.click();

    const navButton = document.querySelector('.dt360-panel-action[data-panel-nav="qeeg-launcher"]');
    assert.ok(navButton, 'qEEG detail panel should expose its navigation button');
    navButton.click();

    assert.deepEqual(observed, [{
      target: 'qeeg-launcher',
      selectedPatientId: 'pt-360',
      profilePatientId: 'pt-360',
      storedPatientId: 'pt-360',
    }]);
  } finally {
    restore();
  }
});

test('DeepTwin demo dashboard prediction panel is fail-closed without a validated model', () => {
  const payload = buildDemoDashboard360Payload('pt-360');
  assert.equal(payload.prediction_confidence.available, false);
  assert.equal(payload.prediction_confidence.status, 'not_implemented');
  assert.equal(payload.prediction_confidence.reason, 'no_validated_prediction_model');
  assert.equal(
    payload.domains.find((domain) => domain.key === 'twin_predictions')?.status,
    'unavailable',
  );

  const html = renderDashboard360(payload);
  assert.match(html, /Prediction output is withheld until a validated DeepTwin model is connected/i);
  assert.match(html, /reason: no_validated_prediction_model/i);
});

test('DeepTwin overview renders explicit unavailable states for withheld clinician payloads', () => {
  const signalsHtml = renderSignalMatrix({
    signals: [],
    signalState: {
      available: false,
      status: 'withheld',
      reason: 'patient_scope_incomplete',
      summary: 'Signal aggregation is withheld until patient-linked feeds are confirmed.',
    },
  });
  assert.match(signalsHtml, /Signals unavailable/i);
  assert.match(signalsHtml, /Signal aggregation is withheld until patient-linked feeds are confirmed/i);
  assert.match(signalsHtml, /status: withheld/i);
  assert.match(signalsHtml, /reason: patient_scope_incomplete/i);

  const timelineHtml = renderTimeline({
    patientId: 'pt-123',
    timeline: {
      available: false,
      status: 'unavailable',
      reason: 'timeline_backfill_pending',
      summary: 'Timeline aggregation is waiting for clinical backfill.',
      events: [],
    },
    selectedKinds: ['session'],
  }, 'dt-test-timeline');
  assert.match(timelineHtml, /Timeline unavailable/i);
  assert.match(timelineHtml, /Timeline aggregation is waiting for clinical backfill/i);

  const corrHtml = renderCorrelations({
    correlations: {
      status: 'unavailable',
      reason: 'insufficient_longitudinal_data',
      summary: 'Exploratory relationships are withheld until enough repeated measures exist.',
      cards: [],
      matrix: [],
      labels: [],
      hypotheses: [],
    },
  }, 'dt-test-corr');
  assert.match(corrHtml, /Correlations unavailable/i);
  assert.match(corrHtml, /Exploratory relationships are withheld until enough repeated measures exist/i);

  const predHtml = renderPrediction({
    prediction: {
      available: false,
      status: 'not_implemented',
      reason: 'no_validated_prediction_model',
      summary: 'Prediction output is withheld until a validated DeepTwin model is connected.',
      disclaimer: 'Clinician review remains required.',
      horizon: '6w',
      traces: [],
    },
  }, 'dt-test-pred');
  assert.match(predHtml, /Prediction output withheld/i);
  assert.match(predHtml, /Prediction output is withheld until a validated DeepTwin model is connected/i);
  assert.match(predHtml, /reason: no_validated_prediction_model/i);
  assert.equal(predHtml.includes('id="dt-test-pred"'), false);
});

test('DeepTwin overview renders explicit pending states for empty clinician payloads', () => {
  const signalsHtml = renderSignalMatrix({
    signals: [],
    signalState: { signals: [] },
  });
  assert.match(signalsHtml, /No patient-linked signals yet/i);
  assert.match(signalsHtml, /will populate this matrix after patient-linked metrics are ingested/i);

  const timelineHtml = renderTimeline({
    patientId: 'pt-123',
    timeline: { events: [] },
    selectedKinds: ['session', 'qeeg'],
  }, 'dt-test-timeline');
  assert.match(timelineHtml, /No timeline events available yet/i);
  assert.equal(timelineHtml.includes('data-tl-kind='), false);
});

test('DeepTwin simulation lab renders withheld states without chartable output', () => {
  const blocked = {
    scenario_id: 'scn_real_patient_guard',
    available: false,
    status: 'withheld',
    reason: 'no_validated_simulation_engine',
    summary: 'Simulation output is withheld until a validated engine is connected for patient-linked rows.',
    disclaimer: 'Clinician review remains required.',
  };

  assert.equal(simulationHasRenderableOutput(blocked), false);

  const html = renderSimulationDetail(blocked);
  assert.match(html, /Simulation output withheld/i);
  assert.match(html, /validated engine is connected for patient-linked rows/i);
  assert.match(html, /reason: no_validated_simulation_engine/i);
  assert.match(html, /Clinician review remains required/i);
});

test('DeepTwin simulation chart host renders withheld notices instead of blank or stale charts', () => {
  const { restore } = installDom();

  try {
    document.getElementById('content').innerHTML = '<div id="dt-sim-host"></div>';
    mountSimulation('dt-sim-host', [{
      available: false,
      status: 'withheld',
      reason: 'patient_scope_requires_validated_engine',
      summary: 'No patient-linked simulation trajectory is available for this session.',
    }]);

    const html = document.getElementById('dt-sim-host').innerHTML;
    assert.match(html, /Simulation output withheld/i);
    assert.match(html, /No patient-linked simulation trajectory is available for this session/i);
  } finally {
    restore();
  }
});

test('TRIBE compare renderer shows explicit withheld states for patient-linked rows', () => {
  const payload = {
    patient_id: 'pt-123',
    comparison: {
      available: false,
      status: 'withheld',
      reason: 'no_validated_protocol_comparison_model',
      summary: 'Protocol comparison is withheld until a validated comparison model is connected.',
    },
  };

  const html = renderTribeComparisonResult(payload);
  assert.match(html, /Protocol comparison withheld/i);
  assert.match(html, /validated comparison model is connected/i);
  assert.match(html, /reason: no_validated_protocol_comparison_model/i);
  assert.match(
    describeTribeComparisonStatus(payload),
    /Protocol comparison withheld\. Protocol comparison is withheld until a validated comparison model is connected/i,
  );
});

test('loadDashboard360 fails closed for real clinician sessions when the API rejects', async () => {
  const restoreToken = installToken('real-clinician-token');
  const original = api.deeptwinDashboard360;
  const err = new Error('dashboard unavailable');
  err.status = 503;
  api.deeptwinDashboard360 = async () => {
    throw err;
  };

  try {
    await assert.rejects(
      loadDashboard360('pt-360'),
      /dashboard unavailable/,
    );
  } finally {
    api.deeptwinDashboard360 = original;
    restoreToken();
  }
});

test('loadDashboard360 may still use the demo payload for demo-token sessions', async () => {
  const restoreToken = installToken('abc-demo-token');
  const original = api.deeptwinDashboard360;
  api.deeptwinDashboard360 = async () => {
    throw new Error('offline demo path');
  };

  try {
    const payload = await loadDashboard360('pt-demo');
    assert.equal(payload?.patient_id, 'pt-demo');
    assert.equal(Array.isArray(payload?.domains), true);
    assert.equal(payload?.domains?.length, 22);
  } finally {
    api.deeptwinDashboard360 = original;
    restoreToken();
  }
});

test('buildDeepTwinExportFilename masks the raw patient id in real clinician sessions', () => {
  const restoreToken = installToken('real-clinician-token');

  try {
    const filename = buildDeepTwinExportFilename('clinician_deep', 'patient-raw-123', 'json');
    assert.match(filename, /^deeptwin_clinician_deep_patient-[a-z0-9]+\.json$/);
    assert.equal(filename.includes('patient-raw-123'), false);
  } finally {
    restoreToken();
  }
});

test('buildDeepTwinExportFilename uses a stable demo filename for demo-token sessions', () => {
  const restoreToken = installToken('abc-demo-token');

  try {
    assert.equal(
      buildDeepTwinExportFilename('prediction', 'demo-pt-123', 'md'),
      'deeptwin_prediction_demo-patient.md',
    );
  } finally {
    restoreToken();
  }
});
