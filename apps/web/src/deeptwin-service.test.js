import { test } from 'node:test';
import assert from 'node:assert/strict';

import { api } from './api.js';
import {
  generateTwinReport,
  getTwinSummary,
  runTwinSimulation,
} from './deeptwin/service.js';

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

test('runTwinSimulation fails closed for real clinician sessions when API rejects simulation', async () => {
  const restoreToken = installToken('real-clinician-token');
  const original = api.runTwinSimulation;
  const err = new Error('simulation unavailable');
  err.status = 503;
  api.runTwinSimulation = async () => {
    throw err;
  };

  try {
    await assert.rejects(
      runTwinSimulation('pat-1', { protocol_id: 'proto-1', horizon_days: 30 }),
      /simulation unavailable/,
    );
  } finally {
    api.runTwinSimulation = original;
    restoreToken();
  }
});

test('getTwinSummary fails closed for real clinician sessions when API rejects overview reads', async () => {
  const restoreToken = installToken('real-clinician-token');
  const original = api.getTwinSummary;
  const err = new Error('summary unavailable');
  err.status = 503;
  api.getTwinSummary = async () => {
    throw err;
  };

  try {
    await assert.rejects(
      getTwinSummary('pat-1'),
      /summary unavailable/,
    );
  } finally {
    api.getTwinSummary = original;
    restoreToken();
  }
});

test('getTwinSummary may still fall back to seeded data for demo-token sessions', async () => {
  const restoreToken = installToken('abc-demo-token');
  const original = api.getTwinSummary;
  api.getTwinSummary = async () => {
    throw new Error('offline demo path');
  };

  try {
    const out = await getTwinSummary('pat-demo');
    assert.equal(out?.patient_id, 'pat-demo');
    assert.equal(out?.is_demo_view, true);
  } finally {
    api.getTwinSummary = original;
    restoreToken();
  }
});

test('generateTwinReport fails closed for real clinician sessions when API rejects report generation', async () => {
  const restoreToken = installToken('real-clinician-token');
  const original = api.generateTwinReport;
  const err = new Error('report unavailable');
  err.status = 503;
  api.generateTwinReport = async () => {
    throw err;
  };

  try {
    await assert.rejects(
      generateTwinReport('pat-1', { kind: 'clinician_deep' }),
      /report unavailable/,
    );
  } finally {
    api.generateTwinReport = original;
    restoreToken();
  }
});

test('runTwinSimulation may still fall back to demo output for demo-token sessions', async () => {
  const restoreToken = installToken('abc-demo-token');
  const original = api.runTwinSimulation;
  api.runTwinSimulation = async () => {
    throw new Error('offline demo path');
  };

  try {
    const out = await runTwinSimulation('pat-demo', { protocol_id: 'proto-demo', horizon_days: 30 });
    assert.equal(out?.patient_id, 'pat-demo');
  } finally {
    api.runTwinSimulation = original;
    restoreToken();
  }
});
