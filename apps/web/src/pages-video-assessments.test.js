/**
 * Video Assessments persisted workflow coverage.
 *
 * Scenario groups:
 * - storage + reload reattachment
 * - chooser + attach selection
 * - detached draft protection on create
 * - patient persisted upload path
 * - clinician persisted review / video / finalize / export
 * - conflict recovery + invalid stored token handling
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { api } from './api.js';
import { setCurrentUser } from './auth.js';
import {
  pgVideoAssessments,
  VIDEO_ASSESSMENT_ATTACHMENT_STORAGE_KEY,
  videoAssessmentBackendActionProfile,
  videoAssessmentBuildAttachmentToken,
  videoAssessmentCanClinicianReview,
  videoAssessmentReadAttachmentToken,
} from './pages-video-assessments.js';
import { createEmptySession } from './video-assessment-protocol.js';

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body><div id="content"></div></body></html>', {
    url: 'https://example.test/video-assessments',
  });

  const safeGlobal = (name) => {
    try {
      return globalThis[name];
    } catch (_) {
      return undefined;
    }
  };

  const previous = {
    window: safeGlobal('window'),
    document: safeGlobal('document'),
    sessionStorage: safeGlobal('sessionStorage'),
    localStorage: safeGlobal('localStorage'),
    requestAnimationFrame: safeGlobal('requestAnimationFrame'),
    Event: safeGlobal('Event'),
    HTMLElement: safeGlobal('HTMLElement'),
    Node: safeGlobal('Node'),
    URL: safeGlobal('URL'),
    File: safeGlobal('File'),
    Blob: safeGlobal('Blob'),
  };

  const createObjectUrls = [];
  let urlCounter = 0;
  const realCreateElement = dom.window.document.createElement.bind(dom.window.document);
  dom.window.document.createElement = function patchedCreateElement(tagName, options) {
    const el = realCreateElement(tagName, options);
    if (String(tagName).toLowerCase() === 'video') {
      let srcValue = '';
      Object.defineProperty(el, 'duration', { configurable: true, value: 12 });
      Object.defineProperty(el, 'videoWidth', { configurable: true, value: 640 });
      Object.defineProperty(el, 'videoHeight', { configurable: true, value: 480 });
      Object.defineProperty(el, 'audioTracks', { configurable: true, value: { length: 1 } });
      Object.defineProperty(el, 'src', {
        configurable: true,
        get() { return srcValue; },
        set(v) {
          srcValue = v;
          queueMicrotask(() => {
            if (typeof el.onloadedmetadata === 'function') el.onloadedmetadata();
          });
        },
      });
    }
    if (String(tagName).toLowerCase() === 'a') {
      el.click = () => {
        el.__clicked = true;
      };
    }
    return el;
  };

  const urlApi = {
    createObjectURL(blob) {
      const url = `blob:va-test-${++urlCounter}`;
      createObjectUrls.push({ url, blob });
      return url;
    },
    revokeObjectURL() {},
  };

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.sessionStorage = dom.window.sessionStorage;
  globalThis.localStorage = dom.window.localStorage;
  globalThis.requestAnimationFrame = (cb) => cb();
  globalThis.Event = dom.window.Event;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;
  globalThis.File = dom.window.File;
  globalThis.Blob = dom.window.Blob;
  globalThis.URL = { ...dom.window.URL, ...urlApi };
  dom.window.URL.createObjectURL = globalThis.URL.createObjectURL;
  dom.window.URL.revokeObjectURL = globalThis.URL.revokeObjectURL;
  dom.window.confirm = () => true;

  return {
    window: dom.window,
    document: dom.window.document,
    createdObjectUrls: createObjectUrls,
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
    listVideoAssessmentSessions: api.listVideoAssessmentSessions,
    createVideoAssessmentSession: api.createVideoAssessmentSession,
    getVideoAssessmentSession: api.getVideoAssessmentSession,
    patchVideoAssessmentSession: api.patchVideoAssessmentSession,
    uploadVideoAssessmentTaskClip: api.uploadVideoAssessmentTaskClip,
    fetchVideoAssessmentTaskVideo: api.fetchVideoAssessmentTaskVideo,
    finalizeVideoAssessmentSession: api.finalizeVideoAssessmentSession,
    exportVideoAssessmentSessionJson: api.exportVideoAssessmentSessionJson,
  };

  api.listPatients = overrides.listPatients ?? (async () => ({
    items: [{ id: 'pt-1', display_name: 'Patient One' }],
  }));
  api.listVideoAssessmentSessions = overrides.listVideoAssessmentSessions ?? (async () => ({ items: [], total: 0 }));
  api.createVideoAssessmentSession = overrides.createVideoAssessmentSession ?? (async () => {
    throw new Error('createVideoAssessmentSession not stubbed');
  });
  api.getVideoAssessmentSession = overrides.getVideoAssessmentSession ?? (async () => {
    throw new Error('getVideoAssessmentSession not stubbed');
  });
  api.patchVideoAssessmentSession = overrides.patchVideoAssessmentSession ?? (async () => {
    throw new Error('patchVideoAssessmentSession not stubbed');
  });
  api.uploadVideoAssessmentTaskClip = overrides.uploadVideoAssessmentTaskClip ?? (async () => {
    throw new Error('uploadVideoAssessmentTaskClip not stubbed');
  });
  api.fetchVideoAssessmentTaskVideo = overrides.fetchVideoAssessmentTaskVideo ?? (async () => {
    throw new Error('fetchVideoAssessmentTaskVideo not stubbed');
  });
  api.finalizeVideoAssessmentSession = overrides.finalizeVideoAssessmentSession ?? (async () => {
    throw new Error('finalizeVideoAssessmentSession not stubbed');
  });
  api.exportVideoAssessmentSessionJson = overrides.exportVideoAssessmentSessionJson ?? (async () => ({
    blob: new Blob(['{}'], { type: 'application/json' }),
    filename: 'video_assessment_export.json',
    contentType: 'application/json',
  }));

  return () => {
    Object.assign(api, saved);
  };
}

function makePersistedSession({
  id = 'sess-1',
  patientId = 'pt-1',
  updatedAt = '2026-05-07T12:00:00Z',
  overallStatus = 'in_progress',
  mutate,
} = {}) {
  const session = createEmptySession({
    id,
    patient_id: patientId,
    overall_status: overallStatus,
  });
  session.updated_at = updatedAt;
  session.revision_token = updatedAt;
  session.finalized = overallStatus === 'finalized';
  if (session.finalized) {
    session.completed_at = '2026-05-07T12:30:00Z';
  }
  if (typeof mutate === 'function') mutate(session);
  return session;
}

function listItemFromSession(session) {
  return {
    id: session.id,
    patient_id: session.patient_id,
    overall_status: session.overall_status,
    updated_at: session.updated_at,
    revision_token: session.revision_token,
    finalized: !!session.finalized,
    review_completion_percent: session.summary?.review_completion_percent ?? 0,
  };
}

async function flush(times = 4) {
  for (let i = 0; i < times; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

async function mountVideoPage({
  role = 'patient',
  patientId = 'pt-1',
  apiOverrides = {},
  selectedPatientInStorage = true,
} = {}) {
  const env = installDom();
  const restoreApi = stubVideoAssessmentApi(apiOverrides);
  setCurrentUser({
    role,
    display_name: `${role} user`,
    email: `${role}@example.test`,
  });
  if (selectedPatientInStorage) {
    env.window.sessionStorage.setItem('ds_pat_selected_id', patientId);
  }
  await pgVideoAssessments(() => {}, () => {});
  await flush();
  return {
    ...env,
    restore() {
      restoreApi();
      env.restore();
    },
  };
}

function setInputFiles(input, files) {
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: files,
  });
}

test('role helpers still gate clinician review correctly', () => {
  assert.equal(videoAssessmentCanClinicianReview('clinician'), true);
  assert.equal(videoAssessmentCanClinicianReview('supervisor'), true);
  assert.equal(videoAssessmentCanClinicianReview('admin'), true);
  assert.equal(videoAssessmentCanClinicianReview('patient'), false);
  const profile = videoAssessmentBackendActionProfile({ role: 'clinician', attached: true, finalized: false });
  assert.equal(profile.reviewSaveLabel, 'Save review to session');
});

test('creating a persisted session stores only a minimal attachment token', async () => {
  const created = makePersistedSession({ id: 'sess-create-1' });
  const page = await mountVideoPage({
    role: 'patient',
    apiOverrides: {
      createVideoAssessmentSession: async () => created,
    },
  });
  try {
    page.document.getElementById('va-create-persisted-session').click();
    await flush(6);
    const raw = page.window.sessionStorage.getItem(VIDEO_ASSESSMENT_ATTACHMENT_STORAGE_KEY);
    assert.ok(raw);
    assert.deepEqual(JSON.parse(raw), { session_id: 'sess-create-1' });
    assert.equal(raw.includes('tasks'), false);
    assert.equal(raw.includes('summary'), false);
    assert.equal(raw.includes('clinician_review'), false);
    assert.deepEqual(videoAssessmentReadAttachmentToken(page.window.sessionStorage), videoAssessmentBuildAttachmentToken('sess-create-1'));
  } finally {
    page.restore();
  }
});

test('reload with stored attachment token refetches authoritative backend session', async () => {
  const session = makePersistedSession({ id: 'sess-reattach-1' });
  const calls = [];
  const page = await mountVideoPage({
    role: 'patient',
    apiOverrides: {
      listVideoAssessmentSessions: async () => ({ items: [listItemFromSession(session)], total: 1 }),
      getVideoAssessmentSession: async (sessionId) => {
        calls.push(sessionId);
        return session;
      },
    },
  });
  try {
    page.window.sessionStorage.setItem(
      VIDEO_ASSESSMENT_ATTACHMENT_STORAGE_KEY,
      JSON.stringify({ session_id: 'sess-reattach-1' }),
    );
    await pgVideoAssessments(() => {}, () => {});
    await flush(6);
    assert.deepEqual(calls, ['sess-reattach-1']);
    assert.match(page.document.body.textContent, /Attached persisted session/i);
  } finally {
    page.restore();
  }
});

test('invalid stored attachment token clears cleanly to detached state', async () => {
  const page = await mountVideoPage({
    role: 'patient',
    apiOverrides: {
      getVideoAssessmentSession: async () => {
        const err = new Error('Session not found');
        err.status = 404;
        throw err;
      },
    },
  });
  try {
    page.window.sessionStorage.setItem(
      VIDEO_ASSESSMENT_ATTACHMENT_STORAGE_KEY,
      JSON.stringify({ session_id: 'sess-missing' }),
    );
    await pgVideoAssessments(() => {}, () => {});
    await flush(6);
    assert.equal(page.window.sessionStorage.getItem(VIDEO_ASSESSMENT_ATTACHMENT_STORAGE_KEY), null);
    assert.match(page.document.body.textContent, /could not be restored from the API/i);
  } finally {
    page.restore();
  }
});

test('multiple persisted sessions render in chooser and selected session attaches explicitly', async () => {
  const latest = makePersistedSession({ id: 'sess-newer', updatedAt: '2026-05-07T14:00:00Z' });
  const chosen = makePersistedSession({ id: 'sess-older', updatedAt: '2026-05-07T13:00:00Z', overallStatus: 'finalized' });
  const chosenCalls = [];
  const page = await mountVideoPage({
    role: 'clinician',
    apiOverrides: {
      listVideoAssessmentSessions: async () => ({
        items: [listItemFromSession(latest), listItemFromSession(chosen)],
        total: 2,
      }),
      getVideoAssessmentSession: async (sessionId) => {
        chosenCalls.push(sessionId);
        return sessionId === chosen.id ? chosen : latest;
      },
    },
  });
  try {
    assert.match(page.document.body.textContent, /Persisted sessions/);
    assert.match(page.document.body.textContent, /Finalized/);
    assert.deepEqual(chosenCalls, []);
    const buttons = [...page.document.querySelectorAll('[data-va-attach-session]')];
    const target = buttons.find((el) => el.getAttribute('data-va-attach-session') === 'sess-older');
    assert.ok(target);
    target.click();
    await flush(6);
    assert.deepEqual(chosenCalls, ['sess-older']);
    assert.match(page.document.body.textContent, /Attached persisted session: sess-older/i);
    assert.deepEqual(
      JSON.parse(page.window.sessionStorage.getItem(VIDEO_ASSESSMENT_ATTACHMENT_STORAGE_KEY)),
      { session_id: 'sess-older' },
    );
  } finally {
    page.restore();
  }
});

test('empty and failed chooser states are rendered honestly', async () => {
  const emptyPage = await mountVideoPage({
    role: 'clinician',
    apiOverrides: {
      listVideoAssessmentSessions: async () => ({ items: [], total: 0 }),
    },
  });
  try {
    assert.match(emptyPage.document.body.textContent, /No persisted sessions are available/i);
  } finally {
    emptyPage.restore();
  }

  const errorPage = await mountVideoPage({
    role: 'clinician',
    apiOverrides: {
      listVideoAssessmentSessions: async () => {
        throw new Error('offline');
      },
    },
  });
  try {
    assert.match(errorPage.document.body.textContent, /Could not load available persisted sessions/i);
  } finally {
    errorPage.restore();
  }
});

test('creating a persisted session warns before discarding a non-empty local draft', async () => {
  const page = await mountVideoPage({
    role: 'patient',
    apiOverrides: {
      createVideoAssessmentSession: async () => {
        throw new Error('create should have been blocked');
      },
    },
  });
  try {
    let confirmCalls = 0;
    page.window.confirm = () => {
      confirmCalls += 1;
      return false;
    };
    page.document.getElementById('va-setup-safe').checked = true;
    page.document.getElementById('va-setup-continue').click();
    await flush();
    page.document.getElementById('va-skip-task').click();
    await flush();
    page.document.getElementById('va-create-persisted-session').click();
    await flush();
    assert.equal(confirmCalls, 1);
    assert.equal(page.window.sessionStorage.getItem(VIDEO_ASSESSMENT_ATTACHMENT_STORAGE_KEY), null);
  } finally {
    page.restore();
  }
});

test('patient attached clip upload uses persisted session revision flow', async () => {
  const base = makePersistedSession({ id: 'sess-upload', updatedAt: '2026-05-07T12:00:00Z' });
  const afterUpload = makePersistedSession({
    id: 'sess-upload',
    updatedAt: '2026-05-07T12:05:00Z',
    mutate(session) {
      const task = session.tasks[0];
      task.recording_asset_id = 'asset-1';
      task.recording_storage_ref = 'video_assessments/pt-1/sess-upload/rest_tremor_asset-1.webm';
      task.recording_status = 'recorded';
    },
  });
  const afterPatch = makePersistedSession({
    id: 'sess-upload',
    updatedAt: '2026-05-07T12:06:00Z',
    mutate(session) {
      const task = session.tasks[0];
      task.recording_asset_id = 'asset-1';
      task.recording_storage_ref = 'video_assessments/pt-1/sess-upload/rest_tremor_asset-1.webm';
      task.recording_status = 'pending_review';
      task.video_capture_meta = { source: 'file_upload' };
    },
  });
  const uploadCalls = [];
  const patchCalls = [];
  const page = await mountVideoPage({
    role: 'patient',
    apiOverrides: {
      listVideoAssessmentSessions: async () => ({ items: [listItemFromSession(base)], total: 1 }),
      getVideoAssessmentSession: async () => base,
      uploadVideoAssessmentTaskClip: async (sessionId, taskId, file, opts) => {
        uploadCalls.push({ sessionId, taskId, fileName: file.name, expected_revision: opts.expected_revision });
        return { session: afterUpload };
      },
      patchVideoAssessmentSession: async (_sessionId, payload) => {
        patchCalls.push(payload);
        return afterPatch;
      },
    },
  });
  try {
    page.window.sessionStorage.setItem(VIDEO_ASSESSMENT_ATTACHMENT_STORAGE_KEY, JSON.stringify({ session_id: 'sess-upload' }));
    await pgVideoAssessments(() => {}, () => {});
    await flush(6);
    page.document.getElementById('va-setup-safe').checked = true;
    page.document.getElementById('va-setup-continue').click();
    await flush();
    const fileInput = page.document.getElementById('va-upload-file');
    setInputFiles(fileInput, [new page.window.File(['clip-bytes'], 'clip.webm', { type: 'video/webm' })]);
    fileInput.dispatchEvent(new page.window.Event('change', { bubbles: true }));
    await flush(6);
    page.document.getElementById('va-use-clip').click();
    await flush(8);
    assert.deepEqual(uploadCalls[0], {
      sessionId: 'sess-upload',
      taskId: 'rest_tremor',
      fileName: uploadCalls[0].fileName,
      expected_revision: '2026-05-07T12:00:00Z',
    });
    assert.equal(patchCalls[0].expected_revision, '2026-05-07T12:05:00Z');
  } finally {
    page.restore();
  }
});

test('clinician stored video, review save, finalize, readonly, and export use persisted backend state', async () => {
  const active = makePersistedSession({
    id: 'sess-clin',
    updatedAt: '2026-05-07T15:00:00Z',
    mutate(session) {
      const task = session.tasks[0];
      task.recording_asset_id = 'asset-2';
      task.recording_storage_ref = 'video_assessments/pt-1/sess-clin/rest_tremor_asset-2.webm';
      task.recording_status = 'pending_review';
    },
  });
  const afterReview = makePersistedSession({
    id: 'sess-clin',
    updatedAt: '2026-05-07T15:05:00Z',
    mutate(session) {
      const task = session.tasks[0];
      task.recording_asset_id = 'asset-2';
      task.recording_storage_ref = 'video_assessments/pt-1/sess-clin/rest_tremor_asset-2.webm';
      task.recording_status = 'accepted';
      task.clinician_review = {
        reviewer_id: 'actor-clinician-demo',
        reviewed_at: '2026-05-07T15:05:00Z',
        video_quality: 'good',
      };
    },
  });
  const finalized = makePersistedSession({
    id: 'sess-clin',
    updatedAt: '2026-05-07T15:10:00Z',
    overallStatus: 'finalized',
    mutate(session) {
      const task = session.tasks[0];
      task.recording_asset_id = 'asset-2';
      task.recording_storage_ref = 'video_assessments/pt-1/sess-clin/rest_tremor_asset-2.webm';
      task.recording_status = 'accepted';
      task.clinician_review = {
        reviewer_id: 'actor-clinician-demo',
        reviewed_at: '2026-05-07T15:05:00Z',
        video_quality: 'good',
      };
      session.summary.clinician_impression = 'Finalized';
    },
  });
  const fetchCalls = [];
  const patchCalls = [];
  const finalizeCalls = [];
  const exportCalls = [];
  const page = await mountVideoPage({
    role: 'clinician',
    apiOverrides: {
      listVideoAssessmentSessions: async () => ({ items: [listItemFromSession(active)], total: 1 }),
      getVideoAssessmentSession: async () => active,
      fetchVideoAssessmentTaskVideo: async (sessionId, taskId) => {
        fetchCalls.push({ sessionId, taskId });
        return { blob: new Blob(['video-bytes'], { type: 'video/webm' }), filename: 'clip.webm', contentType: 'video/webm' };
      },
      patchVideoAssessmentSession: async (_sessionId, payload) => {
        patchCalls.push(payload);
        return afterReview;
      },
      finalizeVideoAssessmentSession: async (_sessionId, payload) => {
        finalizeCalls.push(payload);
        return finalized;
      },
      exportVideoAssessmentSessionJson: async (sessionId) => {
        exportCalls.push(sessionId);
        return { blob: new Blob(['{}'], { type: 'application/json' }), filename: 'sess-clin.json', contentType: 'application/json' };
      },
    },
  });
  try {
    page.window.sessionStorage.setItem(VIDEO_ASSESSMENT_ATTACHMENT_STORAGE_KEY, JSON.stringify({ session_id: 'sess-clin' }));
    await pgVideoAssessments(() => {}, () => {});
    await flush(6);
    page.document.getElementById('va-mode-clinician').click();
    await flush(6);
    assert.deepEqual(fetchCalls[0], { sessionId: 'sess-clin', taskId: 'rest_tremor' });
    const quality = page.document.querySelector('[data-va-field="video_quality"]');
    quality.value = 'good';
    quality.dispatchEvent(new page.window.Event('change', { bubbles: true }));
    page.document.getElementById('va-save-draft').click();
    await flush(6);
    assert.equal(patchCalls[0].expected_revision, '2026-05-07T15:00:00Z');
    page.document.getElementById('va-summary-impression').value = 'Finalize this session';
    page.document.getElementById('va-summary-followup').value = 'Routine';
    page.document.getElementById('va-finalize-session').click();
    await flush(6);
    assert.equal(finalizeCalls[0].expected_revision, '2026-05-07T15:05:00Z');
    assert.match(page.document.body.textContent, /read-only/i);
    page.document.getElementById('va-export-json').click();
    await flush(4);
    assert.deepEqual(exportCalls, ['sess-clin']);
  } finally {
    page.restore();
  }
});

test('stale clinician save handles 409 honestly and reloads authoritative state', async () => {
  const initial = makePersistedSession({ id: 'sess-conflict', updatedAt: '2026-05-07T16:00:00Z' });
  const refreshed = makePersistedSession({
    id: 'sess-conflict',
    updatedAt: '2026-05-07T16:05:00Z',
    mutate(session) {
      session.tasks[0].clinician_review = {
        reviewer_id: 'actor-clinician-other',
        reviewed_at: '2026-05-07T16:04:00Z',
        video_quality: 'fair',
      };
    },
  });
  let getCount = 0;
  const page = await mountVideoPage({
    role: 'clinician',
    apiOverrides: {
      listVideoAssessmentSessions: async () => ({ items: [listItemFromSession(initial)], total: 1 }),
      getVideoAssessmentSession: async () => {
        getCount += 1;
        return getCount === 1 ? initial : refreshed;
      },
      patchVideoAssessmentSession: async () => {
        const err = new Error('Session was updated elsewhere.');
        err.status = 409;
        err.body = {
          details: {
            session_id: 'sess-conflict',
            revision_token: '2026-05-07T16:05:00Z',
            updated_at: '2026-05-07T16:05:00Z',
            finalized: false,
            overall_status: 'in_progress',
          },
        };
        throw err;
      },
    },
  });
  try {
    page.window.sessionStorage.setItem(VIDEO_ASSESSMENT_ATTACHMENT_STORAGE_KEY, JSON.stringify({ session_id: 'sess-conflict' }));
    await pgVideoAssessments(() => {}, () => {});
    await flush(6);
    page.document.getElementById('va-mode-clinician').click();
    await flush(4);
    const quality = page.document.querySelector('[data-va-field="video_quality"]');
    quality.value = 'good';
    page.document.getElementById('va-save-draft').click();
    await flush(8);
    assert.equal(getCount, 2);
    assert.match(page.document.body.textContent, /latest backend state was reloaded/i);
    assert.match(page.document.body.textContent, /Local conflict draft restored/i);
  } finally {
    page.restore();
  }
});
