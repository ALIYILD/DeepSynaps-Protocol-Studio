import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import {
  deeptwinHasPatientScope,
  deeptwinResolvedTab,
} from './pages-deeptwin.js';
import {
  applyDashboard360PatientContext,
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
