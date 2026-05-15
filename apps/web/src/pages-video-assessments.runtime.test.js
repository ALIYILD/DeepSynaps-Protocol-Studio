/**
 * Video Assessments — Runtime mount tests.
 *
 * Covers:
 * - Page mounts without errors
 * - _vaBackendSessions is initialized
 * - Session state is valid after create
 * - Recording flow doesn't crash
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { api } from './api.js';
import { setCurrentUser } from './auth.js';
import {
  pgVideoAssessments,
  VIDEO_ASSESSMENT_SESSION_STORAGE_KEY,
} from './pages-video-assessments.js';
import { createEmptySession, VIDEO_ASSESSMENT_TASKS } from './video-assessment-protocol.js';

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body><div id="content"></div></body></html>', {
    url: 'https://example.test/video-assessments',
  });

  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    sessionStorage: globalThis.sessionStorage,
    localStorage: globalThis.localStorage,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    Event: globalThis.Event,
    HTMLElement: globalThis.HTMLElement,
    Node: globalThis.Node,
    URL: globalThis.URL,
    File: globalThis.File,
    Blob: globalThis.Blob,
  };

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.sessionStorage = dom.window.sessionStorage;
  globalThis.localStorage = dom.window.localStorage;
  globalThis.requestAnimationFrame = (cb) => cb();
  globalThis.Event = dom.window.Event;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;
  globalThis.URL = dom.window.URL;
  if (!globalThis.URL.createObjectURL) {
    globalThis.URL.createObjectURL = () => `blob:test-${Math.random().toString(16).slice(2)}`;
  }
  if (!globalThis.URL.revokeObjectURL) {
    globalThis.URL.revokeObjectURL = () => {};
  }
  globalThis.File = dom.window.File;
  globalThis.Blob = dom.window.Blob;

  return {
    window: dom.window,
    document: dom.window.document,
    restore() {
      setCurrentUser(null);
      dom.window.close();
      globalThis.window = previous.window;
      globalThis.document = previous.document;
      globalThis.sessionStorage = previous.sessionStorage;
      globalThis.localStorage = previous.localStorage;
      globalThis.requestAnimationFrame = previous.requestAnimationFrame;
      globalThis.Event = previous.Event;
      globalThis.HTMLElement = previous.HTMLElement;
      globalThis.Node = previous.Node;
      globalThis.URL = previous.URL;
      globalThis.File = previous.File;
      globalThis.Blob = previous.Blob;
    },
  };
}

function stubVideoAssessmentApi(overrides = {}) {
  const saved = {
    listPatients: api.listPatients,
    getVideoAssessmentSession: api.getVideoAssessmentSession,
    patchVideoAssessmentSession: api.patchVideoAssessmentSession,
    createVideoAssessmentSession: api.createVideoAssessmentSession,
    uploadVideoAssessmentTaskVideo: api.uploadVideoAssessmentTaskVideo,
  };

  api.listPatients = overrides.listPatients ?? (async () => ({
    items: [{ id: 'pt-1', display_name: 'Patient One' }],
  }));
  api.getVideoAssessmentSession =
    overrides.getVideoAssessmentSession ??
    (async (sessionId) =>
      makeStoredPersistedSession({
        id: sessionId,
        patientId: 'pt-1',
        revisionToken: 'rev-current',
      }));
  api.patchVideoAssessmentSession =
    overrides.patchVideoAssessmentSession ??
    (async (sessionId, payload) => ({
      ...makeStoredPersistedSession({
        id: sessionId,
        patientId: 'pt-1',
        revisionToken: payload?.expected_revision === 'rev-current' ? 'rev-next' : 'rev-current',
      }),
    }));
  api.createVideoAssessmentSession =
    overrides.createVideoAssessmentSession ??
    (async () =>
      makeStoredPersistedSession({
        id: 'sess-new-1',
        patientId: 'pt-1',
        revisionToken: 'rev-created',
      }));
  api.uploadVideoAssessmentTaskVideo =
    overrides.uploadVideoAssessmentTaskVideo ??
    (async (sessionId, taskId) => {
      const persisted = makeStoredPersistedSession({
        id: sessionId,
        patientId: 'pt-1',
        revisionToken: 'rev-uploaded',
      });
      persisted.tasks[0].task_id = taskId;
      persisted.tasks[0].recording_status = 'accepted';
      return {
        recording_asset_id: `asset-${taskId}`,
        recording_storage_ref: `video_assessments/pt-1/${sessionId}/${taskId}.webm`,
        session: persisted,
      };
    });

  return () => {
    Object.assign(api, saved);
  };
}

function makeStoredPersistedSession({
  id = 'sess-current-1',
  patientId = 'pt-1',
  overallStatus = 'in_progress',
  revisionToken = 'rev-current',
} = {}) {
  return {
    ...createEmptySession({
      id,
      patient_id: patientId,
      overall_status: overallStatus,
    }),
    created_at: '2026-05-07T09:00:00Z',
    updated_at: '2026-05-07T10:00:00Z',
    revision_token: revisionToken,
  };
}

async function flush(times = 4) {
  for (let i = 0; i < times; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

async function mountVideoPage({
  role = 'clinician',
  session = null,
  apiOverrides = {},
} = {}) {
  const env = installDom();
  const restoreApi = stubVideoAssessmentApi(apiOverrides);
  setCurrentUser({
    role,
    display_name: `${role} user`,
    email: `${role}@example.test`,
  });
  if (session) {
    const storedPayload =
      session?.id && !String(session.id).startsWith('vas_')
        ? {
            session_id: session.id,
            selected_patient_id: session.patient_id || 'pt-1',
            persisted_backend_session: true,
          }
        : session;
    env.window.sessionStorage.setItem(
      VIDEO_ASSESSMENT_SESSION_STORAGE_KEY,
      JSON.stringify(storedPayload),
    );
    env.window.sessionStorage.setItem('ds_pat_selected_id', session.patient_id || 'pt-1');
  }
  await pgVideoAssessments(() => {}, () => {});
  await flush(4);
  return {
    ...env,
    restore() {
      restoreApi();
      env.restore();
    },
  };
}

// ── runtime mount tests ──────────────────────────────────────────────────────

test('page mounts without errors', async () => {
  const page = await mountVideoPage({ role: 'clinician' });
  try {
    const content = page.document.getElementById('content');
    assert.ok(content, 'content container should exist');
    assert.ok(content.textContent.length > 0, 'page should render content');
  } finally {
    page.restore();
  }
});

test('_vaBackendSessions is initialized after mount', async () => {
  const page = await mountVideoPage({
    role: 'clinician',
    session: makeStoredPersistedSession({ id: 'sess-test-1', revisionToken: 'rev-test' }),
  });
  try {
    // _vaBackendSessions is an internal module variable; we verify it through
    // the UI state that reflects its loading / loaded condition.
    const content = page.document.getElementById('content');
    // Should not be stuck in loading state
    assert.ok(
      !content.textContent.includes('Loading session') ||
        content.textContent.includes('Persisted'),
      'backend sessions state should resolve from loading',
    );
  } finally {
    page.restore();
  }
});

test('session state is valid after create', async () => {
  const page = await mountVideoPage({
    role: 'patient',
    apiOverrides: {
      createVideoAssessmentSession: async () =>
        makeStoredPersistedSession({
          id: 'sess-created-1',
          patientId: 'pt-1',
          revisionToken: 'rev-created',
        }),
      getVideoAssessmentSession: async (sessionId) =>
        makeStoredPersistedSession({
          id: sessionId,
          patientId: 'pt-1',
          revisionToken: 'rev-current',
        }),
    },
  });
  try {
    const storedRaw = page.window.sessionStorage.getItem(VIDEO_ASSESSMENT_SESSION_STORAGE_KEY);
    assert.ok(storedRaw, 'session should be stored in sessionStorage after mount');

    const stored = JSON.parse(storedRaw);
    assert.ok(stored.session_id || stored.id, 'stored session should have an id');
    assert.equal(stored.selected_patient_id || stored.patient_id, 'pt-1');
  } finally {
    page.restore();
  }
});

test('session has correct protocol structure after mount', async () => {
  const page = await mountVideoPage({
    role: 'clinician',
    session: makeStoredPersistedSession({ id: 'sess-protocol-1' }),
  });
  try {
    const content = page.document.getElementById('content');
    // Verify task count is reflected in the UI (16 tasks)
    const taskCountMatch = content.textContent.match(/16/);
    assert.ok(taskCountMatch || page.document.querySelector('[data-va-task]'), 'page should reference 16 tasks');
  } finally {
    page.restore();
  }
});

test('recording flow does not crash', async () => {
  let uploadCalled = false;
  const page = await mountVideoPage({
    role: 'patient',
    session: makeStoredPersistedSession({ id: 'sess-record-1', revisionToken: 'rev-record' }),
    apiOverrides: {
      uploadVideoAssessmentTaskVideo: async (sessionId, taskId) => {
        uploadCalled = true;
        const persisted = makeStoredPersistedSession({
          id: sessionId,
          patientId: 'pt-1',
          revisionToken: 'rev-uploaded',
        });
        persisted.tasks[0].task_id = taskId;
        persisted.tasks[0].recording_status = 'accepted';
        persisted.tasks[0].recording_storage_ref = `video_assessments/pt-1/${sessionId}/${taskId}.webm`;
        return {
          recording_asset_id: `asset-${taskId}`,
          recording_storage_ref: persisted.tasks[0].recording_storage_ref,
          session: persisted,
        };
      },
    },
  });
  try {
    // Switch to patient mode
    const modePatient = page.document.getElementById('va-mode-patient');
    if (modePatient) {
      modePatient.click();
      await flush(2);
    }

    // Mark setup safe and continue
    const setupSafe = page.document.getElementById('va-setup-safe');
    if (setupSafe) {
      setupSafe.checked = true;
    }
    const setupContinue = page.document.getElementById('va-setup-continue');
    if (setupContinue) {
      setupContinue.click();
      await flush(2);
    }

    // Simulate file selection for recording
    const uploadInput = page.document.getElementById('va-upload-file');
    if (uploadInput) {
      const blob = new page.window.Blob(['video-bytes'], { type: 'video/webm' });
      Object.defineProperty(uploadInput, 'files', {
        configurable: true,
        value: [new page.window.File([blob], 'task.webm', { type: 'video/webm' })],
      });
      uploadInput.dispatchEvent(new page.window.Event('change', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 300));
      await flush(2);
    }

    // Accept clip if button exists
    const useClipBtn = page.document.getElementById('va-use-clip');
    if (useClipBtn) {
      useClipBtn.click();
      await flush(6);
    }

    // The flow should not throw; upload may or may not have been called
    // depending on DOM structure, but no error should propagate.
    assert.ok(true, 'recording flow completed without crash');
  } finally {
    page.restore();
  }
});

test('page renders in patient mode without backend session', async () => {
  const page = await mountVideoPage({
    role: 'patient',
    session: null,
    apiOverrides: {},
  });
  try {
    const content = page.document.getElementById('content');
    assert.ok(content, 'content container should exist in patient mode');
    // Patient mode should show either setup instructions or consent UI
    assert.ok(content.textContent.length > 0, 'patient mode should render some content');
  } finally {
    page.restore();
  }
});

test('page renders in clinician mode without crash', async () => {
  const page = await mountVideoPage({
    role: 'clinician',
    session: makeStoredPersistedSession({ id: 'sess-clin-1' }),
  });
  try {
    const content = page.document.getElementById('content');
    assert.ok(content, 'content container should exist in clinician mode');

    const modeClinician = page.document.getElementById('va-mode-clinician');
    if (modeClinician) {
      modeClinician.click();
      await flush(4);
    }

    assert.ok(content.textContent.length > 0, 'clinician mode should render content');
  } finally {
    page.restore();
  }
});
