// ─────────────────────────────────────────────────────────────────────────────
// pages-video-assessments.js — Video Assessments for Virtual Care (MVP UI)
// Guided camera tasks + clinician structured review. Not autonomous diagnosis.
// ─────────────────────────────────────────────────────────────────────────────
import {
  VIDEO_ASSESSMENT_PROTOCOL,
  VIDEO_ASSESSMENT_TASKS,
  createEmptySession,
  summarizeSession,
} from './video-assessment-protocol.js';
import { showToast } from './helpers.js';
import { api } from './api.js';
import { isDemoSession } from './demo-session.js';
import { currentUser } from './auth.js';

export const VIDEO_ASSESSMENT_ATTACHMENT_STORAGE_KEY = 'ds_video_assessment_attachment_v1';
const LOCAL_REVIEWER_ID = 'local_draft';

const DISCLAIMER =
  'Video Assessments are for guided capture and clinician review only. They are not a substitute for an in-person examination, emergency care, or autonomous diagnosis.';

export function videoAssessmentCanClinicianReview(role = '') {
  return role === 'clinician' || role === 'supervisor' || role === 'admin';
}

export function videoAssessmentBackendActionProfile({ role = '', attached = false, finalized = false } = {}) {
  const clinician = videoAssessmentCanClinicianReview(role);
  return {
    canCreatePersistedSession: role === 'patient',
    canWritePersistedPatientSession: role === 'patient' && attached && !finalized,
    canWritePersistedClinicianSession: clinician && attached && !finalized,
    reviewSaveLabel:
      clinician && attached && !finalized ? 'Save review to session' : 'Save local notes',
    reviewCompleteLabel:
      clinician && attached && !finalized ? 'Mark task reviewed in session' : 'Mark local draft complete',
    summarySaveLabel:
      clinician && attached && !finalized ? 'Save summary to session' : 'Save local summary',
    exportLabel: attached ? 'Download persisted session JSON' : 'Download session draft (JSON)',
  };
}

export function videoAssessmentBuildAttachmentToken(sessionId) {
  const value = String(sessionId || '').trim();
  return value ? { session_id: value } : null;
}

export function videoAssessmentReadAttachmentToken(storage = globalThis.sessionStorage) {
  try {
    const raw = storage?.getItem?.(VIDEO_ASSESSMENT_ATTACHMENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const token = videoAssessmentBuildAttachmentToken(parsed?.session_id);
    return token;
  } catch (_) {
    return null;
  }
}

function esc(v) {
  if (v == null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _persistAllowed() {
  try {
    return !!(import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === '1');
  } catch (_) {
    return false;
  }
}

/** Same gate as preview Netlify builds (stored session + roster cache). */
function _demoBuildFlag() {
  return _persistAllowed();
}

function _demoTokenWorkspace() {
  try {
    return isDemoSession();
  } catch (_) {
    return false;
  }
}

function _canUseClinicianWorkbench() {
  return videoAssessmentCanClinicianReview(currentUser?.role || '');
}

function _currentRole() {
  return currentUser?.role || '';
}

function _selectedPatientScope() {
  return _vaSelectedPatientId || _readStoredPatientId() || null;
}

function _latestBackendSession() {
  return _vaBackendSessions.items[0] || null;
}

function _isPersistedSessionId(id) {
  return !!(id && !String(id).startsWith('vas_'));
}

function _sessionIsFinalized(session = _vaSession) {
  return String(session?.overall_status || '') === 'finalized';
}

function _isAttachedBackendSession() {
  return !!(_vaBackendBinding.sessionId && _vaSession?.id === _vaBackendBinding.sessionId);
}

function _backendBindingRoleProfile() {
  return videoAssessmentBackendActionProfile({
    role: _currentRole(),
    attached: _isAttachedBackendSession(),
    finalized: _sessionIsFinalized(),
  });
}

function _canCreatePersistedSession() {
  return _backendBindingRoleProfile().canCreatePersistedSession && !_demoTokenWorkspace();
}

function _canWriteAttachedPatientSession() {
  return _backendBindingRoleProfile().canWritePersistedPatientSession;
}

function _canWriteAttachedClinicianSession() {
  return _backendBindingRoleProfile().canWritePersistedClinicianSession;
}

function _sessionPersistLabel() {
  if (_demoTokenWorkspace()) {
    return 'Demo-token session: drafts stay in this browser only and do not prove a persisted clinical record.';
  }
  if (_isAttachedBackendSession()) {
    if (_sessionIsFinalized()) {
      return `Attached to persisted session ${_vaSession.id}. That session is finalized, so this page is read-only except for JSON export.`;
    }
    if (_canWriteAttachedPatientSession() || _canWriteAttachedClinicianSession()) {
      return `Attached to persisted session ${_vaSession.id}. Eligible actions on this page write through to the backend session and can be reloaded from the API.`;
    }
    return `Attached to persisted session ${_vaSession.id}. This page can read the backend record, but your current role cannot mutate it here.`;
  }
  if (_vaBackendSessions.error) {
    return 'Backend session state could not be verified from the API. Treat this workspace as browser-local scratchpad only.';
  }
  if (_latestBackendSession()) {
    return 'An authorized persisted video-assessment session exists separately. Load it into this page to review, finalize, or export the real backend record.';
  }
  if (_vaBackendSessions.checked) {
    return 'No authorized persisted video-assessment session was found for this patient. Current notes and clips remain in-memory only and will not survive reload.';
  }
  return 'Detached notes and clips are in-memory only and are not the clinical record.';
}

/** @type {ReturnType<typeof createEmptySession> | null} */
var _vaSession = null;
/** @type {'patient'|'clinician'} */
var _vaUiMode = 'patient';
/** @type {'setup'|'task_intro'|'recording'|'post_record'} */
var _vaPatientPhase = 'setup';
var _vaTaskIndex = 0;
var _vaSetupConfirmed = false;
var _vaMediaStream = null;
var _vaMediaRecorder = null;
var _vaRecordedChunks = [];
var _vaPreviewUrl = null;
/** @type {Record<string, string>} task_id -> object URL for last capture */
var _vaBlobUrlByTask = {};
/** @type {Record<string, Blob>} task_id -> last local capture blob */
var _vaBlobByTask = {};
/** @type {Record<string, string>} task_id -> object URL for persisted clip fetched from backend */
var _vaServerBlobUrlByTask = {};
/** @type {Record<string, { loading?: boolean, error?: string | null }>} */
var _vaServerVideoStateByTask = {};
var _vaRecordingDeadline = null;
var _vaCountdownTimer = null;
var _vaRecordingTimer = null;
/** While true, show 3-2-1 in recording UI before MediaRecorder runs */
var _vaRecordingCountdownActive = false;
var _vaSelectedClinicianTask = 0;
var _vaKeysBound = false;
/** @type {{ items?: Array<{id?: string, display_name?: string, name?: string}> } | null} */
var _vaPatientsCache = null;
var _vaPatientsLoadFailed = false;
/** @type {string | null} */
var _vaSelectedPatientId = null;
/** @type {(id: string, params?: unknown) => void} */
var _vaNavigate = () => {};
var _vaBackendSessions = {
  loading: false,
  checked: false,
  patientId: null,
  total: 0,
  items: [],
  error: null,
};
var _vaBackendBinding = {
  sessionId: null,
  loading: false,
  saving: false,
  finalizing: false,
  exporting: false,
  error: null,
};
var _vaConflictDraft = {
  message: null,
  taskReviews: {},
  summary: null,
};

function _readStoredPatientId() {
  try {
    return (
      window._selectedPatientId ||
      window._profilePatientId ||
      sessionStorage.getItem('ds_pat_selected_id') ||
      localStorage.getItem('ds_selected_patient_id') ||
      null
    );
  } catch (_) {
    return null;
  }
}

function _writeStoredAttachmentToken(token) {
  try {
    if (!token?.session_id) {
      sessionStorage.removeItem(VIDEO_ASSESSMENT_ATTACHMENT_STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(
      VIDEO_ASSESSMENT_ATTACHMENT_STORAGE_KEY,
      JSON.stringify({ session_id: token.session_id }),
    );
  } catch (_) {}
}

function _clearStoredAttachmentToken() {
  _writeStoredAttachmentToken(null);
}

function _writeStoredPatientId(id) {
  try {
    window._selectedPatientId = id;
    window._profilePatientId = id;
    sessionStorage.setItem('ds_pat_selected_id', id);
  } catch (_) {}
}

function _taskDef(taskId) {
  return VIDEO_ASSESSMENT_TASKS.find((t) => t.task_id === taskId) || null;
}

function _currentTask() {
  const s = _vaSession;
  if (!s || !s.tasks[_vaTaskIndex]) return null;
  return s.tasks[_vaTaskIndex];
}

function _cleanupPreviewUrl() {
  if (_vaPreviewUrl) {
    try {
      URL.revokeObjectURL(_vaPreviewUrl);
    } catch (_) {}
    _vaPreviewUrl = null;
  }
}

function _setTaskBlobUrl(taskId, url) {
  if (_vaBlobUrlByTask[taskId]) {
    try {
      URL.revokeObjectURL(_vaBlobUrlByTask[taskId]);
    } catch (_) {}
  }
  if (url) _vaBlobUrlByTask[taskId] = url;
  else delete _vaBlobUrlByTask[taskId];
}

function _setTaskBlob(taskId, blob) {
  if (blob) _vaBlobByTask[taskId] = blob;
  else delete _vaBlobByTask[taskId];
}

function _clearServerTaskBlobUrl(taskId) {
  if (_vaServerBlobUrlByTask[taskId]) {
    try {
      URL.revokeObjectURL(_vaServerBlobUrlByTask[taskId]);
    } catch (_) {}
  }
  delete _vaServerBlobUrlByTask[taskId];
  delete _vaServerVideoStateByTask[taskId];
}

function _clearLocalTaskMedia(taskId) {
  _setTaskBlob(taskId, null);
  _setTaskBlobUrl(taskId, null);
}

function _clearLocalMediaCache() {
  _cleanupPreviewUrl();
  Object.keys(_vaBlobUrlByTask).forEach((taskId) => _setTaskBlobUrl(taskId, null));
  _vaBlobByTask = {};
}

function _clearServerMediaCache() {
  Object.keys(_vaServerBlobUrlByTask).forEach((taskId) => _clearServerTaskBlobUrl(taskId));
  _vaServerVideoStateByTask = {};
}

function _clearConflictDraft() {
  _vaConflictDraft = {
    message: null,
    taskReviews: {},
    summary: null,
  };
}

function _stopMedia() {
  if (_vaMediaRecorder && _vaMediaRecorder.state !== 'inactive') {
    try {
      _vaMediaRecorder.stop();
    } catch (_) {}
  }
  _vaMediaRecorder = null;
  _vaRecordedChunks = [];
  if (_vaMediaStream) {
    _vaMediaStream.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch (_) {}
    });
    _vaMediaStream = null;
  }
  clearInterval(_vaCountdownTimer);
  clearInterval(_vaRecordingTimer);
  _vaCountdownTimer = null;
  _vaRecordingTimer = null;
}

function _downloadBinaryResult(result, fallbackFilename) {
  if (!result?.blob) throw new Error('No binary payload returned.');
  const url = URL.createObjectURL(result.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = result.filename || fallbackFilename;
  a.click();
  setTimeout(() => {
    try {
      URL.revokeObjectURL(url);
    } catch (_) {}
  }, 4000);
}

function _persistSession() {
  if (_isAttachedBackendSession()) {
    _writeStoredAttachmentToken(videoAssessmentBuildAttachmentToken(_vaBackendBinding.sessionId));
    return;
  }
  _clearStoredAttachmentToken();
}

function _applySummary() {
  if (!_vaSession) return;
  const sum = summarizeSession(_vaSession);
  const summaryDraft = _vaConflictDraft.summary;
  _vaSession.summary = {
    ..._vaSession.summary,
    tasks_completed: sum.tasks_completed,
    tasks_skipped: sum.tasks_skipped,
    tasks_needing_repeat: sum.tasks_needing_repeat,
    review_completion_percent: sum.review_completion_percent,
    clinician_impression:
      summaryDraft && typeof summaryDraft.clinician_impression === 'string'
        ? summaryDraft.clinician_impression
        : _vaSession.summary?.clinician_impression,
    recommended_followup:
      summaryDraft && typeof summaryDraft.recommended_followup === 'string'
        ? summaryDraft.recommended_followup
        : _vaSession.summary?.recommended_followup,
  };
  _vaSession.safety_flags = sum.safety_task_ids || [];
}

function _ensureSession() {
  if (!_vaSession) {
    const pid =
      _vaSelectedPatientId ||
      _readStoredPatientId() ||
      (_demoTokenWorkspace() ? 'demo-workspace' : 'not-selected');
    _vaSession = createEmptySession({
      patient_id: pid,
    });
    _applySummary();
  }
  return _vaSession;
}

function _syncSessionPatientId() {
  const pid = _vaSelectedPatientId || _readStoredPatientId() || (_demoTokenWorkspace() ? 'demo-workspace' : 'not-selected');
  if (_vaSession && _vaSession.patient_id !== pid && !_isAttachedBackendSession()) {
    _vaSession.patient_id = pid;
    _persistSession();
  }
}

function _replaceSession(doc, { attachedSessionId = null, clearMedia = false } = {}) {
  if (clearMedia) {
    _clearLocalMediaCache();
    _clearServerMediaCache();
  }
  _vaSession = doc;
  _applySummary();
  _vaBackendBinding = {
    ..._vaBackendBinding,
    sessionId: attachedSessionId,
    loading: false,
    saving: false,
    finalizing: false,
    exporting: false,
    error: null,
  };
  _persistSession();
}

function _startScratchpadSession(patientId) {
  const pid = patientId || (_demoTokenWorkspace() ? 'demo-workspace' : 'not-selected');
  _clearConflictDraft();
  _replaceSession(createEmptySession({ patient_id: pid }), {
    attachedSessionId: null,
    clearMedia: true,
  });
}

function _sessionRevisionToken(session = _vaSession) {
  return String(session?.revision_token || '').trim();
}

function _hasMeaningfulLocalDraft() {
  if (_isAttachedBackendSession() || !_vaSession) return false;
  if (Object.keys(_vaBlobByTask).length > 0) return true;
  if ((_vaSession.summary?.clinician_impression || '').trim()) return true;
  if ((_vaSession.summary?.recommended_followup || '').trim()) return true;
  return (_vaSession.tasks || []).some((task) => {
    if (task?.recording_status && task.recording_status !== 'pending') return true;
    if (task?.skip_reason) return true;
    if (task?.unsafe_flag) return true;
    if (task?.clinician_review) return true;
    return false;
  });
}

function _confirmDiscardLocalDraft(actionLabel) {
  if (!_hasMeaningfulLocalDraft()) return true;
  const ask = globalThis.window?.confirm;
  if (typeof ask !== 'function') return true;
  return ask(`${actionLabel} will discard the current local draft on this page. Continue?`);
}

async function _loadBackendSession(sessionId, { quiet = false, fromStoredToken = false } = {}) {
  if (!sessionId) return null;
  _vaBackendBinding = { ..._vaBackendBinding, sessionId, loading: true, error: null };
  _render();
  try {
    const doc = await api.getVideoAssessmentSession(sessionId);
    if (doc?.patient_id) {
      _vaSelectedPatientId = doc.patient_id;
      _writeStoredPatientId(doc.patient_id);
    }
    _replaceSession(doc, { attachedSessionId: sessionId, clearMedia: true });
    if (!quiet) showToast('Persisted session loaded from the API.');
    _render();
    return doc;
  } catch (e) {
    if (fromStoredToken) {
      _clearStoredAttachmentToken();
      _vaBackendBinding = {
        ..._vaBackendBinding,
        sessionId: null,
        loading: false,
        error: 'Stored persisted-session attachment could not be restored from the API. This page has been detached.',
      };
      _render();
      return null;
    }
    _vaBackendBinding = {
      ..._vaBackendBinding,
      loading: false,
      error: e?.message || 'Could not load persisted session',
    };
    _render();
    if (!quiet) showToast('Could not load persisted session: ' + (e?.message || 'Unknown error'));
    return null;
  }
}

async function _createPersistedSession() {
  if (!_canCreatePersistedSession()) return null;
  if (!_confirmDiscardLocalDraft('Creating a persisted session')) return null;
  _vaBackendBinding = { ..._vaBackendBinding, loading: true, error: null };
  _render();
  try {
    const doc = await api.createVideoAssessmentSession({});
    if (doc?.patient_id) {
      _vaSelectedPatientId = doc.patient_id;
      _writeStoredPatientId(doc.patient_id);
    }
    _clearConflictDraft();
    _replaceSession(doc, { attachedSessionId: doc?.id || null, clearMedia: true });
    showToast('Persisted session created and attached.');
    _render();
    void _refreshBackendSessions();
    return doc;
  } catch (e) {
    _vaBackendBinding = {
      ..._vaBackendBinding,
      loading: false,
      error: e?.message || 'Could not create persisted session',
    };
    _render();
    showToast('Could not create persisted session: ' + (e?.message || 'Unknown error'));
    return null;
  }
}

async function _reloadAuthoritativeSession(sessionId) {
  if (!sessionId) return null;
  return _loadBackendSession(sessionId, { quiet: true });
}

async function _handleRevisionConflict(err, preserveDraft = null) {
  const details = err?.body?.details || err?.details || {};
  const sessionId = details.session_id || _vaBackendBinding.sessionId;
  if (preserveDraft?.taskId && preserveDraft?.review) {
    _vaConflictDraft.taskReviews[preserveDraft.taskId] = preserveDraft.review;
  }
  if (preserveDraft?.summary) {
    _vaConflictDraft.summary = {
      ...(preserveDraft.summary || {}),
    };
  }
  _vaConflictDraft.message =
    'Session changed on the server. The latest backend state was reloaded. Any local draft shown here is not yet persisted.';
  _vaBackendBinding = {
    ..._vaBackendBinding,
    error: _vaConflictDraft.message,
  };
  await _reloadAuthoritativeSession(sessionId);
  _vaBackendBinding = {
    ..._vaBackendBinding,
    error: _vaConflictDraft.message,
  };
  _render();
  showToast('Session changed elsewhere. Latest backend state reloaded.', 'warning');
  err._vaConflictHandled = true;
  return null;
}

async function _patchAttachedSession(payload, successMessage, { preserveDraft = null } = {}) {
  if (!_isAttachedBackendSession()) {
    throw new Error('No persisted session is attached.');
  }
  _vaBackendBinding = { ..._vaBackendBinding, saving: true, error: null };
  _render();
  try {
    const doc = await api.patchVideoAssessmentSession(_vaBackendBinding.sessionId, {
      ...(payload || {}),
      expected_revision: _sessionRevisionToken(),
    });
    if (preserveDraft?.taskId) delete _vaConflictDraft.taskReviews[preserveDraft.taskId];
    if (preserveDraft?.summary) _vaConflictDraft.summary = null;
    _vaConflictDraft.message = null;
    _replaceSession(doc, { attachedSessionId: _vaBackendBinding.sessionId });
    if (successMessage) showToast(successMessage);
    _render();
    void _refreshBackendSessions();
    return doc;
  } catch (e) {
    if (e?.status === 409) {
      return _handleRevisionConflict(e, preserveDraft);
    }
    _vaBackendBinding = {
      ..._vaBackendBinding,
      saving: false,
      error: e?.message || 'Could not save persisted session update',
    };
    _render();
    throw e;
  }
}

async function _refreshAttachedSession() {
  if (!_isAttachedBackendSession()) return null;
  return _loadBackendSession(_vaBackendBinding.sessionId, { quiet: false });
}

async function _finalizeAttachedSession(payload) {
  if (!_isAttachedBackendSession()) {
    throw new Error('No persisted session is attached.');
  }
  _vaBackendBinding = { ..._vaBackendBinding, finalizing: true, error: null };
  _render();
  try {
    const doc = await api.finalizeVideoAssessmentSession(_vaBackendBinding.sessionId, {
      ...(payload || {}),
      expected_revision: _sessionRevisionToken(),
    });
    _vaConflictDraft.summary = null;
    _vaConflictDraft.message = null;
    _replaceSession(doc, { attachedSessionId: _vaBackendBinding.sessionId });
    showToast('Persisted session finalized.');
    _render();
    void _refreshBackendSessions();
    return doc;
  } catch (e) {
    if (e?.status === 409) {
      return _handleRevisionConflict(e, {
        summary: {
          clinician_impression: payload?.clinician_impression || '',
          recommended_followup: payload?.recommended_followup || '',
        },
      });
    }
    _vaBackendBinding = {
      ..._vaBackendBinding,
      finalizing: false,
      error: e?.message || 'Could not finalize persisted session',
    };
    _render();
    throw e;
  }
}

async function _exportAttachedSession() {
  if (!_isAttachedBackendSession()) {
    throw new Error('No persisted session is attached.');
  }
  _vaBackendBinding = { ..._vaBackendBinding, exporting: true, error: null };
  _render();
  try {
    const result = await api.exportVideoAssessmentSessionJson(_vaBackendBinding.sessionId);
    _downloadBinaryResult(result, `video_assessment_${_vaBackendBinding.sessionId}.json`);
    showToast('Persisted session JSON downloaded.');
    _vaBackendBinding = { ..._vaBackendBinding, exporting: false, error: null };
    _render();
  } catch (e) {
    _vaBackendBinding = {
      ..._vaBackendBinding,
      exporting: false,
      error: e?.message || 'Could not export persisted session JSON',
    };
    _render();
    throw e;
  }
}

async function _ensureSelectedTaskServerVideo() {
  if (!_isAttachedBackendSession() || _vaUiMode !== 'clinician') return;
  const task = _vaSession?.tasks?.[_vaSelectedClinicianTask];
  if (!task?.task_id || !task.recording_storage_ref) return;
  if (_vaBlobUrlByTask[task.task_id] || _vaServerBlobUrlByTask[task.task_id]) return;
  if (_vaServerVideoStateByTask[task.task_id]?.loading) return;
  _vaServerVideoStateByTask[task.task_id] = { loading: true, error: null };
  _render();
  try {
    const result = await api.fetchVideoAssessmentTaskVideo(_vaBackendBinding.sessionId, task.task_id);
    _clearServerTaskBlobUrl(task.task_id);
    _vaServerBlobUrlByTask[task.task_id] = URL.createObjectURL(result.blob);
    _vaServerVideoStateByTask[task.task_id] = { loading: false, error: null };
  } catch (e) {
    _vaServerVideoStateByTask[task.task_id] = {
      loading: false,
      error: e?.message || 'Could not load stored clip',
    };
  }
  _render();
}

async function _refreshBackendSessions() {
  const role = _currentRole();
  const patientId = _selectedPatientScope();

  if (_demoTokenWorkspace()) {
    _vaBackendSessions = {
      loading: false,
      checked: true,
      patientId,
      total: 0,
      items: [],
      error: 'Demo-token workspace',
    };
    return;
  }

  if (!(role === 'patient' || _canUseClinicianWorkbench())) {
    _vaBackendSessions = {
      loading: false,
      checked: false,
      patientId,
      total: 0,
      items: [],
      error: null,
    };
    return;
  }

  if (role !== 'patient' && !patientId) {
    _vaBackendSessions = {
      loading: false,
      checked: true,
      patientId: null,
      total: 0,
      items: [],
      error: null,
    };
    return;
  }

  _vaBackendSessions = {
    loading: true,
    checked: true,
    patientId,
    total: 0,
    items: [],
    error: null,
  };
  _render();

  try {
    const params = role === 'patient'
      ? { limit: 10 }
      : role === 'admin'
        ? { limit: 50 }
        : { patient_id: patientId, limit: 10 };
    const res = await api.listVideoAssessmentSessions(params);
    let items = Array.isArray(res?.items) ? res.items : [];
    if (role === 'admin' && patientId) {
      items = items.filter((item) => item?.patient_id === patientId);
    }
    _vaBackendSessions = {
      loading: false,
      checked: true,
      patientId,
      total: patientId && role === 'admin' ? items.length : Number.isFinite(res?.total) ? res.total : items.length,
      items,
      error: null,
    };
    if (_vaBackendBinding.sessionId && !items.some((item) => item?.id === _vaBackendBinding.sessionId)) {
      _vaBackendBinding = {
        ..._vaBackendBinding,
        error: 'Attached session no longer appears in the authorized session list for this scope.',
      };
    }
  } catch (e) {
    _vaBackendSessions = {
      loading: false,
      checked: true,
      patientId,
      total: 0,
      items: [],
      error: e?.message || 'Could not load persisted sessions',
    };
  }
  _render();
}

function _formatSessionTimestamp(ts) {
  if (!ts) return 'Unknown time';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toLocaleString();
}

function _renderSessionChooser() {
  if (_demoTokenWorkspace()) return '';
  if (!(_currentRole() === 'patient' || _canUseClinicianWorkbench())) return '';

  let body = '';
  if (_vaBackendSessions.loading) {
    body = '<p class="va-muted" style="margin:0;font-size:12px">Loading available persisted sessions…</p>';
  } else if (_vaBackendSessions.error) {
    body = `<p class="va-muted" style="margin:0;font-size:12px;color:var(--amber)">Could not load available persisted sessions. Refresh or reselect the patient to try again.</p>`;
  } else if ((_vaBackendSessions.items || []).length === 0) {
    body = '<p class="va-muted" style="margin:0;font-size:12px">No persisted sessions are available for this scope yet.</p>';
  } else {
    body = `<div class="va-session-chooser" style="display:grid;gap:8px">${(_vaBackendSessions.items || []).map((item) => {
      const active = _vaBackendBinding.sessionId === item?.id;
      const finalized = item?.finalized || item?.overall_status === 'finalized';
      const shortId = String(item?.id || '').slice(0, 8) || 'session';
      return `<div class="ds-card" style="margin:0;border:${active ? '1px solid rgba(0,212,188,.45)' : '1px solid var(--border)'}">
        <div class="ds-card__body" style="padding:10px 12px;display:flex;justify-content:space-between;gap:12px;align-items:center">
          <div style="min-width:0">
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <strong style="font-size:12px">Session ${esc(shortId)}</strong>
              <span style="font-size:10px;padding:2px 8px;border-radius:999px;border:1px solid ${finalized ? 'rgba(255,181,71,.35)' : 'rgba(0,212,188,.35)'};color:${finalized ? 'var(--amber)' : 'var(--teal)'}">${finalized ? 'Finalized' : 'Active'}</span>
            </div>
            <div class="va-muted" style="font-size:11px;margin-top:4px">Updated ${esc(_formatSessionTimestamp(item?.updated_at))} · status ${esc(item?.overall_status || 'unknown')}</div>
          </div>
          <button type="button" class="btn ${active ? 'btn-secondary' : 'btn-primary'} btn-sm" data-va-attach-session="${esc(item?.id || '')}" ${active ? 'disabled aria-disabled="true"' : ''}>${active ? 'Attached' : 'Attach session'}</button>
        </div>
      </div>`;
    }).join('')}</div>`;
  }

  return `<div class="ds-card" style="margin-top:12px">
    <div class="ds-card__header"><h3 style="margin:0">Persisted sessions</h3></div>
    <div class="ds-card__body">${body}</div>
  </div>`;
}

function _mimeForRecorder() {
  if (typeof MediaRecorder !== 'undefined') {
    if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) return 'video/webm;codecs=vp9';
    if (MediaRecorder.isTypeSupported('video/webm')) return 'video/webm';
  }
  return 'video/webm';
}

/**
 * Best-effort metadata from a Blob (duration, dimensions). Does not upload.
 * @param {Blob} blob
 */
function _probeVideoBlob(blob) {
  return new Promise((resolve) => {
    if (typeof document === 'undefined' || !blob) {
      resolve({ duration_seconds: null, video_width: null, video_height: null, audio_track_present: null, probe_error: 'no_dom' });
      return;
    }
    const url = URL.createObjectURL(blob);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    const done = (payload) => {
      try {
        URL.revokeObjectURL(url);
      } catch (_) {}
      resolve(payload);
    };
    v.onloadedmetadata = () => {
      try {
        const d = v.duration;
        let audioPresent = null;
        try {
          const tr = v.audioTracks;
          if (tr && typeof tr.length === 'number') audioPresent = tr.length > 0;
        } catch (_) {}
        done({
          duration_seconds: Number.isFinite(d) ? Math.round(d * 100) / 100 : null,
          video_width: v.videoWidth || null,
          video_height: v.videoHeight || null,
          audio_track_present: audioPresent,
          probe_error: null,
        });
      } catch (e) {
        done({
          duration_seconds: null,
          video_width: null,
          video_height: null,
          audio_track_present: null,
          probe_error: e && e.message ? String(e.message) : 'probe_failed',
        });
      }
    };
    v.onerror = () =>
      done({
        duration_seconds: null,
        video_width: null,
        video_height: null,
        audio_track_present: null,
        probe_error: 'video_decode',
      });
    v.src = url;
  });
}

async function _startCamera() {
  _stopMedia();
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: true,
  });
  _vaMediaStream = stream;
  const vid = document.getElementById('va-camera-preview');
  if (vid) {
    vid.srcObject = stream;
    try {
      await vid.play();
    } catch (_) {}
  }
}

async function _beginRecording() {
  const task = _currentTask();
  const def = task ? _taskDef(task.task_id) : null;
  if (!_vaMediaStream || !task || !def) return;

  _cleanupPreviewUrl();
  _vaRecordingCountdownActive = false;
  _vaRecordedChunks = [];
  const mime = _mimeForRecorder();
  _vaMediaRecorder = new MediaRecorder(_vaMediaStream, mime ? { mimeType: mime } : undefined);
  _vaMediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) _vaRecordedChunks.push(e.data);
  };
  _vaMediaRecorder.onstop = () => {
    const blob = new Blob(_vaRecordedChunks, { type: mime.split(';')[0] || 'video/webm' });
    _cleanupPreviewUrl();
    _vaPreviewUrl = URL.createObjectURL(blob);
    _setTaskBlob(task.task_id, blob);
    _setTaskBlobUrl(task.task_id, _vaPreviewUrl);
    task.recording_asset_id = 'blob:' + task.task_id + ':' + Date.now();
    task.recording_status = 'pending_review';
    void _probeVideoBlob(blob).then((meta) => {
      task.video_capture_meta = {
        ...meta,
        source: 'browser_recording',
        mime_type: mime.split(';')[0] || 'video/webm',
        captured_at: new Date().toISOString(),
      };
      _persistSession();
      _render();
    });
    _vaPatientPhase = 'post_record';
    _render();
  };

  _vaMediaRecorder.start(200);

  const ms = def.duration_seconds * 1000;
  _vaRecordingDeadline = Date.now() + ms;
  clearInterval(_vaRecordingTimer);
  _vaRecordingTimer = setInterval(() => {
    const el = document.getElementById('va-rec-timer');
    const remain = Math.max(0, Math.ceil((_vaRecordingDeadline - Date.now()) / 1000));
    if (el) el.textContent = String(remain);
    if (remain <= 0) _stopRecordingClip();
  }, 250);
}

function _stopRecordingClip() {
  clearInterval(_vaRecordingTimer);
  _vaRecordingTimer = null;
  if (_vaMediaRecorder && _vaMediaRecorder.state !== 'inactive') {
    try {
      _vaMediaRecorder.stop();
    } catch (_) {}
  }
}

function _renderModeToggle() {
  const patientActive = _vaUiMode === 'patient';
  const canReview = _canUseClinicianWorkbench();
  return `<div class="va-mode-toggle" role="tablist" aria-label="Assessment mode">
    <button type="button" role="tab" class="btn ${patientActive ? 'btn-primary' : 'btn-secondary'}" aria-selected="${patientActive}" id="va-mode-patient">Patient Capture Mode</button>
    <button type="button" role="tab" class="btn ${!patientActive ? 'btn-primary' : 'btn-secondary'}" aria-selected="${!patientActive}" id="va-mode-clinician" ${canReview ? '' : 'disabled aria-disabled="true" title="Clinician, supervisor, or admin account required"'}>Clinician Review Scratchpad</button>
  </div>`;
}

function _renderProgress() {
  const n = VIDEO_ASSESSMENT_TASKS.length;
  const cur = _vaTaskIndex + 1;
  const pct = Math.round((_vaTaskIndex / n) * 100);
  return `<div class="va-progress" aria-label="Task progress">
    <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-secondary);margin-bottom:6px">
      <span>Task ${cur} of ${n}</span><span>${pct}%</span>
    </div>
    <div style="height:6px;background:rgba(255,255,255,0.06);border-radius:4px;overflow:hidden">
      <div style="height:100%;width:${pct}%;background:var(--teal);transition:width .2s"></div>
    </div>
  </div>`;
}

function _renderSetupChecklist() {
  const locked = _sessionIsFinalized() && _isAttachedBackendSession();
  return `<div class="ds-card"><div class="ds-card__header"><h3>Before you start</h3></div><div class="ds-card__body">
    <ul class="va-checklist">
      <li>Clear enough floor space to stand and take a few steps safely.</li>
      <li>Use a sturdy chair with arms if you need support.</li>
      <li>Turn on lights in front of you so your face and hands are visible.</li>
      <li>Wear comfortable clothes that show your arms and legs if possible.</li>
      <li>If you live alone and cannot stand safely, skip standing and walking tasks.</li>
    </ul>
    <label class="va-checkbox"><input type="checkbox" id="va-setup-safe" ${_vaSetupConfirmed ? 'checked' : ''}/> I confirm I am in a safe space for movement tasks today.</label>
    ${locked ? '<p class="va-muted" style="font-size:11px;margin-top:10px">The attached persisted session is finalized. Start a new persisted session to capture additional clips.</p>' : ''}
    <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">
      <button type="button" class="btn btn-primary" id="va-setup-continue" ${locked ? 'disabled aria-disabled="true"' : ''}>Continue</button>
    </div>
  </div></div>`;
}

function _renderTaskIntro(task, def) {
  const locked = _sessionIsFinalized() && _isAttachedBackendSession();
  const sc = def.script.success_checklist.map((x) => `<li>${esc(x)}</li>`).join('');
  return `<div class="va-task-intro">
    ${_renderProgress()}
    <div class="ds-card"><div class="ds-card__header"><h3>${esc(def.script.title)}</h3></div><div class="ds-card__body">
      <p class="va-muted"><strong>What this checks:</strong> ${esc(def.script.what_this_checks)}</p>
      <p><strong>How to do it:</strong> ${esc(def.script.how_to_do)}</p>
      <p><strong>Camera:</strong> ${esc(def.script.camera_position)}</p>
      <p><strong>Safety:</strong> ${esc(def.script.safety)}</p>
      <div class="va-demo-placeholder" role="note">
        <span>Reference illustration not included</span>
        <small>Task scripts are text-only in this build. On-screen demonstration clips are not shown—follow the written steps and voice prompt.</small>
      </div>
      <p class="va-voice-prompt"><strong>Voice guide:</strong> ${esc(def.script.voice_prompt)}</p>
      <p style="font-size:12px;color:var(--text-secondary);margin-top:10px">Success checklist before recording:</p>
      <ul class="va-checklist">${sc}</ul>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;align-items:center">
        <button type="button" class="btn btn-secondary" id="va-ready-record" ${locked ? 'disabled aria-disabled="true"' : ''}>I’m ready (acknowledge)</button>
        <button type="button" class="btn btn-primary" id="va-start-rec" ${locked ? 'disabled aria-disabled="true"' : ''}>Start recording</button>
        <button type="button" class="btn btn-secondary" id="va-skip-task" ${locked ? 'disabled aria-disabled="true"' : ''}>Skip task</button>
        <button type="button" class="btn btn-secondary" id="va-unsafe-task" ${locked ? 'disabled aria-disabled="true"' : ''} title="Mark if this task is unsafe for you today">Unsafe for me today</button>
      </div>
    </div></div>
  </div>`;
}

function _renderRecording(def, phaseCountdown) {
  const label = phaseCountdown ? 'starting in…' : 'seconds left';
  const startVal = phaseCountdown ? '3' : String(def.duration_seconds);
  return `<div class="va-recording">
    ${_renderProgress()}
    <div class="va-framing-hint">Keep your full movement in frame. ${esc(def.camera_setup)}</div>
    <div class="va-rec-hero"><span id="va-rec-timer" class="va-timer">${startVal}</span><span class="va-muted">${label}</span></div>
    <button type="button" class="btn btn-secondary" id="va-stop-rec">Stop recording</button>
  </div>`;
}

function _renderPostRecord(task, def) {
  const saveToBackend = _canWriteAttachedPatientSession();
  const locked = _sessionIsFinalized() && _isAttachedBackendSession();
  const vid = _vaPreviewUrl
    ? `<video id="va-playback" controls playsinline src="${esc(_vaPreviewUrl)}" style="width:100%;max-height:280px;border-radius:8px;background:#000"></video>`
    : '<p class="va-muted">No preview available.</p>';
  const meta = task?.video_capture_meta;
  const metaBlock =
    meta && typeof meta === 'object'
      ? `<div class="va-meta-block" style="margin-top:10px;font-size:12px;color:var(--text-secondary);line-height:1.5">
        <strong style="color:var(--text-primary)">Clip metadata (browser-estimated)</strong>
        <ul style="margin:6px 0 0 16px;padding:0">
          <li>Duration: ${esc(meta.duration_seconds != null ? meta.duration_seconds + ' s' : 'Unknown')}</li>
          <li>Frame size: ${esc(meta.video_width && meta.video_height ? meta.video_width + '×' + meta.video_height : 'Unknown')}</li>
          <li>Container: ${esc(meta.mime_type || 'video/webm')}</li>
          <li>Audio track (probe): ${esc(meta.audio_track_present === true ? 'Present' : meta.audio_track_present === false ? 'Not detected' : 'Unknown')}</li>
          ${
            meta.probe_error
              ? '<li>Probe note: ' + esc(meta.probe_error) + ' — values may be incomplete; clinician review of the clip is still required.</li>'
              : ''
          }
        </ul>
        <p style="font-size:11px;margin:8px 0 0;color:var(--text-tertiary)">This clip is held in browser memory only until you accept it or leave the page. It is not the clinical record.</p>
      </div>`
      : '';
  return `<div class="va-post">
    ${_renderProgress()}
    <h4 style="margin:0 0 8px">Review clip</h4>
    ${vid}
    ${metaBlock}
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">
      <button type="button" class="btn btn-primary" id="va-use-clip" ${locked ? 'disabled aria-disabled="true"' : ''}>${saveToBackend ? 'Use this recording and upload to session' : 'Use this recording'}</button>
      <button type="button" class="btn btn-secondary" id="va-rerecord" ${locked ? 'disabled aria-disabled="true"' : ''}>Record again</button>
      <button type="button" class="btn btn-secondary" id="va-skip-post" ${locked ? 'disabled aria-disabled="true"' : ''}>Skip task</button>
    </div>
  </div>`;
}

function _patientOptionsHtml() {
  const items = _vaPatientsCache?.items || [];
  const cur = _vaSelectedPatientId || '';
  let opts = `<option value="">Select a patient…</option>`;
  for (const p of items) {
    const id = p.id || p.patient_id || '';
    if (!id) continue;
    const label = p.display_name || p.name || id;
    opts += `<option value="${esc(id)}" ${cur === id ? 'selected' : ''}>${esc(label)}</option>`;
  }
  return opts;
}

function _renderPatientContextCard(session) {
  const pid = session?.patient_id || 'not-selected';
  const strip = [];
  if (_demoTokenWorkspace()) strip.push('Demo-token workspace');
  if (_demoBuildFlag()) strip.push('Preview/demo build');
  strip.push('No local draft reload persistence');
  const warn =
    _vaPatientsLoadFailed && !_demoTokenWorkspace()
      ? `<div class="va-banner va-banner--warn" role="status" style="margin-top:10px;padding:10px 12px;border-radius:8px;border:1px solid rgba(246,178,60,.35);background:rgba(246,178,60,.08);font-size:12px">Could not load the patient list from the API. You can still record locally; reconnect to select a roster patient.</div>`
      : '';
  return `<div class="ds-card va-context-card" style="margin-bottom:16px">
    <div class="ds-card__header"><h3 style="margin:0">Patient & workspace</h3></div>
    <div class="ds-card__body">
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;font-size:11px;color:var(--text-tertiary)">
        ${strip.map((s) => `<span style="padding:2px 8px;border-radius:999px;border:1px solid var(--border)">${esc(s)}</span>`).join('')}
      </div>
      <div class="form-group">
        <label class="form-label" for="va-patient-select">Active patient for this session</label>
        <select id="va-patient-select" class="form-control" style="max-width:420px" aria-describedby="va-patient-help">${_patientOptionsHtml()}</select>
        <p id="va-patient-help" class="va-muted" style="font-size:11px;margin-top:6px">Linked IDs drive navigation, persisted-session checks, and API attachment. ${esc(_sessionPersistLabel())}</p>
      </div>
      <p class="va-muted" style="font-size:12px;margin:0"><strong>Session patient id:</strong> ${esc(pid)}</p>
      ${warn}
    </div>
  </div>`;
}

function _renderVideoAvailabilityCard(session) {
  const tasks = session?.tasks || [];
  let withClip = 0;
  for (const t of tasks) {
    if (t.recording_asset_id && _vaBlobUrlByTask[t.task_id]) withClip++;
  }
  const ai = session?.future_ai_metrics_placeholder || {};
  const hasAiSlot = ai && typeof ai === 'object';
  const latest = _latestBackendSession();
  const attached = _isAttachedBackendSession();
  const attachedId = attached ? _vaBackendBinding.sessionId : null;
  const attachedSummary = attached
    ? `Attached persisted session: ${esc(attachedId)} · status ${esc(session?.overall_status || 'unknown')}.`
    : 'No persisted session is attached to this page right now.';
  const backendLine = _vaBackendSessions.loading
    ? 'Checking authorized persisted session state from the API…'
    : _vaBackendSessions.error
      ? `Could not verify persisted session state from the API: ${esc(_vaBackendSessions.error)}.`
      : attached
        ? `${attachedSummary} Eligible capture/review actions on this page now write through to the backend session.`
        : latest
          ? `Authorized persisted session detected: status ${esc(latest.overall_status || 'unknown')}, last updated ${esc(latest.updated_at || 'unknown')}. Load it into this page to continue review, finalize it, or export the stored JSON.`
          : _canUseClinicianWorkbench() && !_selectedPatientScope()
            ? 'Select a patient to check whether an authorized persisted session exists for clinician review.'
            : 'No authorized persisted video-assessment session was found for this patient.';
  const actionButtons = [];
  if (_canCreatePersistedSession()) {
    actionButtons.push(`<button type="button" class="btn btn-secondary btn-sm" id="va-create-persisted-session" ${_vaBackendBinding.loading || _vaBackendBinding.saving || _vaBackendBinding.finalizing ? 'disabled aria-disabled="true"' : ''}>Create persisted session</button>`);
  }
  if (attached) {
    actionButtons.push(`<button type="button" class="btn btn-secondary btn-sm" id="va-refresh-persisted-session" ${_vaBackendBinding.loading ? 'disabled aria-disabled="true"' : ''}>Refresh attached session</button>`);
  }
  const noteText = _vaBackendBinding.error || _vaConflictDraft.message || '';
  const bindingNote = noteText
    ? `<p style="margin-bottom:0;font-size:12px;color:var(--amber)"><strong>Backend action note:</strong> ${esc(noteText)}</p>`
    : '';
  return `<div class="ds-card" style="margin-bottom:16px">
    <div class="ds-card__header"><h3 style="margin:0">Persistence & review status</h3></div>
    <div class="ds-card__body" style="font-size:13px;line-height:1.55;color:var(--text-secondary)">
      <p style="margin-top:0"><strong>Browser clips this session:</strong> ${withClip} task(s) with a local preview blob.</p>
      <p><strong>Persisted session state:</strong> ${backendLine}</p>
      <p><strong>Automated pose / affect / movement scoring:</strong> ${
        hasAiSlot
          ? '<span style="color:var(--amber)">Not connected</span> — this workspace records structured clinician observation and clips only. No model runs are claimed here.'
          : 'Unavailable.'
      }</p>
      ${actionButtons.length ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 6px">${actionButtons.join('')}</div>` : ''}
      ${_renderSessionChooser()}
      ${bindingNote}
      <p style="margin-bottom:0;font-size:12px;color:var(--text-tertiary)">Clinician review remains clinician-entered only. ${esc(_sessionPersistLabel())}</p>
    </div>
  </div>`;
}

function _renderGovernanceCard() {
  return `<div class="ds-card" style="margin-bottom:16px;border-color:rgba(0,212,188,.25)">
    <div class="ds-card__header"><h3 style="margin:0">Evidence, governance & limitations</h3></div>
    <div class="ds-card__body" style="font-size:12px;line-height:1.55;color:var(--text-secondary)">
      <ul style="margin:0;padding-left:18px">
        <li>This page does not provide neurological or psychiatric diagnosis, treatment eligibility, protocol approval, or surveillance.</li>
        <li>Structured scores are clinician-entered observation—not autonomous AI outputs.</li>
        <li>Detached drafts remain browser-local. Attached persisted sessions still require clinician judgment and are not autonomous model outputs.</li>
        <li>Any future automated markers must show method, uncertainty, and require clinician review (not shipped here yet).</li>
        <li>Exports are JSON drafts for workflow handoff; they are not signed clinical documents.</li>
      </ul>
    </div>
  </div>`;
}

function _renderQuickLinks() {
  const pid = esc(_vaSelectedPatientId || _readStoredPatientId() || '');
  const dis = pid ? '' : 'disabled title="Select a patient first"';
  return `<div class="va-quicklinks ds-card" style="margin-bottom:16px">
    <div class="ds-card__header"><h3 style="margin:0">Linked modules</h3><span class="va-muted" style="font-size:11px;font-weight:400">Opens existing Studio routes · context only</span></div>
    <div class="ds-card__body" style="display:flex;flex-wrap:wrap;gap:8px">
      <button type="button" class="btn btn-ghost btn-sm" id="va-link-profile" ${dis}>Patient profile</button>
      <button type="button" class="btn btn-ghost btn-sm" id="va-link-assessments" ${dis}>Assessments hub</button>
      <button type="button" class="btn btn-ghost btn-sm" id="va-link-documents" ${dis}>Documents</button>
      <button type="button" class="btn btn-ghost btn-sm" id="va-link-qeeg" ${dis}>qEEG launcher</button>
      <button type="button" class="btn btn-ghost btn-sm" id="va-link-mri" ${dis}>MRI analysis</button>
      <button type="button" class="btn btn-ghost btn-sm" id="va-link-voice" ${dis}>Voice analyzer</button>
      <button type="button" class="btn btn-ghost btn-sm" id="va-link-text" ${dis}>Text analyzer</button>
      <button type="button" class="btn btn-ghost btn-sm" id="va-link-biomarkers" ${dis}>Biomarkers</button>
      <button type="button" class="btn btn-ghost btn-sm" id="va-link-deeptwin" ${dis}>DeepTwin</button>
      <button type="button" class="btn btn-ghost btn-sm" id="va-link-protocol" ${dis}>Protocol Studio</button>
      <button type="button" class="btn btn-ghost btn-sm" id="va-link-brainmap" ${dis}>Brainmap planner</button>
      <button type="button" class="btn btn-ghost btn-sm" id="va-link-schedule" ${dis}>Schedule</button>
      <button type="button" class="btn btn-ghost btn-sm" id="va-link-inbox">Inbox</button>
      <button type="button" class="btn btn-ghost btn-sm" id="va-link-handbooks">Handbooks</button>
      <button type="button" class="btn btn-ghost btn-sm" id="va-link-evidence">Research evidence</button>
      <button type="button" class="btn btn-ghost btn-sm" id="va-link-live">Live session</button>
    </div>
    <div class="ds-card__body" style="padding-top:0;font-size:11px;color:var(--text-tertiary)">DeepTwin / Protocol Studio receive identifiers for continuity only—not autonomous video-based protocol or diagnosis suggestions.</div>
  </div>`;
}

function _renderPatientColumn() {
  const session = _ensureSession();
  session.mode = 'patient_capture';
  const attached = _canWriteAttachedPatientSession();
  const locked = _sessionIsFinalized() && _isAttachedBackendSession();

  const uploadCard = `<div class="ds-card" style="margin-bottom:12px">
    <div class="ds-card__header"><h3 style="margin:0">Upload a clip file</h3></div>
    <div class="ds-card__body">
      <p class="va-muted" style="font-size:12px;margin-top:0">Load a local video for the <strong>current task</strong> (${attached ? 'accepted clips upload into the attached persisted session' : 'preview only in this browser until a persisted session is attached'}).</p>
      <p class="va-muted" style="font-size:11px">Typical containers: MP4, WebM, QuickTime/MOV (browser-dependent). ${locked ? 'The attached persisted session is finalized, so new uploads are locked.' : 'Upload alone does not imply clinician sign-off.'}</p>
      <label class="btn btn-secondary btn-sm" style="cursor:pointer;display:inline-flex;align-items:center;gap:6px;margin-top:8px">
        Choose video file
        <input type="file" id="va-upload-file" accept="video/mp4,video/webm,video/quicktime,video/x-matroska,video/avi" style="position:absolute;width:0;height:0;opacity:0" aria-label="Choose video file for current task" ${locked ? 'disabled aria-disabled="true"' : ''}/>
      </label>
    </div>
  </div>`;

  let inner = '';
  if (!_vaSetupConfirmed && _vaPatientPhase === 'setup') {
    inner = _renderSetupChecklist();
  } else if (_vaTaskIndex >= session.tasks.length) {
    inner = `<div class="ds-card"><div class="ds-card__body"><h3 style="margin-top:0">All tasks addressed</h3>
      <p class="va-muted">Authorized staff can open the Clinician Review Scratchpad for local notes. Reload does not retain detached local draft state; attach a persisted session if you need authoritative continuity.</p></div></div>`;
  } else {
    const task = _currentTask();
    const def = task ? _taskDef(task.task_id) : null;
    if (!task || !def) {
      inner = '<p>Session complete or invalid.</p>';
    } else if (_vaPatientPhase === 'task_intro') {
      inner = _renderTaskIntro(task, def);
    } else if (_vaPatientPhase === 'recording') {
      inner = _renderRecording(def, _vaRecordingCountdownActive);
    } else if (_vaPatientPhase === 'post_record') {
      inner = _renderPostRecord(task, def);
    }
  }

  const camBlock =
    _vaUiMode === 'patient'
      ? `<div class="va-camera-card ds-card">
          <div class="ds-card__header"><h3>Camera</h3><button type="button" class="btn btn-sm btn-secondary" id="va-start-cam">Start camera</button></div>
          <div class="ds-card__body">
            <div class="va-video-wrap"><video id="va-camera-preview" autoplay playsinline muted></video></div>
            <p class="va-muted" style="font-size:11px;margin-top:8px">${esc(DISCLAIMER)}</p>
          </div>
        </div>`
      : '';

  return `<div class="va-col va-col-patient">
    ${uploadCard}
    ${camBlock}
    <div class="va-patient-flow">${inner}</div>
  </div>`;
}

function _reviewDefaults(def) {
  const o = {
    video_quality: '',
    patient_compliance: '',
    task_completed: '',
    repeat_needed: '',
    free_text_comment: '',
    structured_scores: {},
  };
  if (!def) return o;
  for (const [k, vals] of Object.entries(def.structured_clinician_fields)) {
    o.structured_scores[k] = Array.isArray(vals) ? '' : vals;
  }
  return o;
}

function _mergeReview(existing, def) {
  const base = _reviewDefaults(def);
  if (!existing) return base;
  return {
    ...base,
    ...existing,
    structured_scores: { ...base.structured_scores, ...(existing.structured_scores || {}) },
  };
}

function _renderClinicianForm(task) {
  const def = _taskDef(task.task_id);
  const conflictReview = _vaConflictDraft.taskReviews[task.task_id] || null;
  const rev = _mergeReview(conflictReview || task.clinician_review, def);
  const profile = _backendBindingRoleProfile();
  const fieldDisabled = _isAttachedBackendSession() && !_canWriteAttachedClinicianSession();
  const disabledAttr = fieldDisabled ? 'disabled aria-disabled="true"' : '';
  const opts = (name, values) =>
    values.map((v) => `<option value="${esc(v)}" ${rev[name] === v ? 'selected' : ''}>${esc(v.replace(/_/g, ' '))}</option>`).join('');

  const baseFields = `
    <div class="form-group"><label class="form-label">Video quality</label>
      <select class="form-control" data-va-field="video_quality" ${disabledAttr}><option value="">Select…</option>${opts('video_quality', ['poor', 'fair', 'good'])}</select></div>
    <div class="form-group"><label class="form-label">Patient compliance</label>
      <select class="form-control" data-va-field="patient_compliance" ${disabledAttr}><option value="">Select…</option>${opts('patient_compliance', ['poor', 'fair', 'good'])}</select></div>
    <div class="form-group"><label class="form-label">Task completed (video)</label>
      <select class="form-control" data-va-field="task_completed" ${disabledAttr}><option value="">Select…</option>${opts('task_completed', ['yes', 'partial', 'no'])}</select></div>
    <div class="form-group"><label class="form-label">Repeat needed</label>
      <select class="form-control" data-va-field="repeat_needed" ${disabledAttr}><option value="">Select…</option>${opts('repeat_needed', ['yes', 'no'])}</select></div>`;

  let structured = '';
  if (def) {
    for (const [k, vals] of Object.entries(def.structured_clinician_fields)) {
      const cur = rev.structured_scores[k] || '';
      const optHtml = (Array.isArray(vals) ? vals : []).map((v) =>
        `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(String(v).replace(/_/g, ' '))}</option>`
      ).join('');
      structured += `<div class="form-group"><label class="form-label">${esc(k.replace(/_/g, ' '))}</label>
        <select class="form-control" data-va-score="${esc(k)}" ${disabledAttr}><option value="">Select…</option>${optHtml}</select></div>`;
    }
  }

  const unsafeBadge =
    task.unsafe_flag || task.recording_status === 'unsafe_skipped'
      ? `<div class="va-unsafe-banner">Patient marked this task as unsafe or not appropriate today. This is not a failure—review context only.</div>`
      : '';
  const skipBadge =
    task.recording_status === 'skipped' || task.recording_status === 'unsafe_skipped'
      ? `<div class="va-skip-note">Skipped: ${esc(task.skip_reason || 'skipped')}</div>`
      : '';

  const blobSrc = task.recording_asset_id ? _vaBlobUrlByTask[task.task_id] : null;
  const serverSrc = task.recording_storage_ref ? _vaServerBlobUrlByTask[task.task_id] : null;
  const serverState = _vaServerVideoStateByTask[task.task_id] || {};
  const meta = task.video_capture_meta;
  const metaHtml =
    meta && typeof meta === 'object'
      ? `<div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px;line-height:1.45">
        <strong style="color:var(--text-primary)">Browser-estimated clip metadata</strong> · source: ${esc(meta.source || 'unknown')}
        · duration ${esc(meta.duration_seconds != null ? meta.duration_seconds + ' s' : 'unknown')}
        · ${esc(meta.video_width && meta.video_height ? meta.video_width + '×' + meta.video_height : 'resolution unknown')}
        ${meta.probe_error ? ' · probe: ' + esc(meta.probe_error) : ''}
      </div>`
      : '';
  const videoSrc = blobSrc || serverSrc;
  const videoBlock = videoSrc
    ? `${metaHtml}<video controls src="${esc(videoSrc)}" style="width:100%;border-radius:8px;background:#000"></video>`
    : task.recording_storage_ref
      ? `<div class="va-video-placeholder">${serverState.loading ? 'Loading stored clip from the persisted session…' : serverState.error ? `Stored clip could not be loaded: ${esc(serverState.error)}` : 'Stored clip is available in the persisted session but is not loaded into the browser yet.'}</div>
        <div style="margin-top:8px"><button type="button" class="btn btn-secondary btn-sm" id="va-load-stored-clip">${serverState.error ? 'Retry stored clip load' : 'Load stored clip'}</button></div>`
      : `<div class="va-video-placeholder">No local or persisted recording is available for this task yet.</div>`;
  const reviewHelp = _sessionIsFinalized() && _isAttachedBackendSession()
    ? 'The attached persisted session is finalized. Review fields are read-only on this page.'
    : profile.canWritePersistedClinicianSession
      ? 'These controls write structured clinician review into the attached persisted session.'
      : 'These controls edit browser-local scratchpad data only. They do not finalize or sign a persisted clinical review.';
  const conflictBanner = conflictReview
    ? `<div class="va-banner va-banner--warn" role="status" style="margin-bottom:10px;padding:10px 12px;border-radius:8px;border:1px solid rgba(246,178,60,.35);background:rgba(246,178,60,.08);font-size:12px">Local conflict draft restored for this task. It is visible here but has not been persisted yet.</div>`
    : '';

  return `<div class="va-clinician-form">
    ${conflictBanner}
    ${unsafeBadge}${skipBadge}
    <div style="margin-bottom:12px">${videoBlock}</div>
    ${baseFields}
    ${structured}
    <div class="form-group"><label class="form-label">Free-text comment</label>
      <textarea class="form-control" rows="3" data-va-field="free_text_comment" ${disabledAttr}>${esc(rev.free_text_comment)}</textarea></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button type="button" class="btn btn-secondary" id="va-save-draft" ${fieldDisabled ? 'disabled aria-disabled="true"' : ''}>${profile.reviewSaveLabel}</button>
      <button type="button" class="btn btn-primary" id="va-mark-reviewed" ${fieldDisabled ? 'disabled aria-disabled="true"' : ''}>${profile.reviewCompleteLabel}</button>
    </div>
    <p class="va-muted" style="font-size:11px;margin-top:10px">${esc(reviewHelp)}</p>
  </div>`;
}

function _renderClinicianColumn() {
  const session = _ensureSession();
  session.mode = 'clinician_review';
  if (!_canUseClinicianWorkbench()) {
    return `<div class="va-col va-col-clinician">
      <div class="ds-card"><div class="ds-card__body">
        <p class="va-muted" style="margin:0;font-size:13px">Structured clinician review scratchpad tools are limited to clinician, supervisor, or admin accounts. You can still complete capture tasks in Patient Capture Mode.</p>
      </div></div>
    </div>`;
  }
  const tasks = session.tasks;
  const idx = Math.min(Math.max(0, _vaSelectedClinicianTask), tasks.length - 1);
  const task = tasks[idx];
  const def = task ? _taskDef(task.task_id) : null;
  const latest = _latestBackendSession();
  const scopeNote = _vaBackendSessions.loading
    ? 'Checking whether an authorized persisted video-assessment session exists for this patient.'
    : _vaBackendSessions.error
      ? 'Persisted session state could not be verified from the API. Treat the controls below as local scratchpad only.'
      : _isAttachedBackendSession()
        ? _sessionIsFinalized()
          ? `Attached persisted session "${esc(_vaSession.id)}" is finalized. Stored review is visible here but cannot be edited from this page.`
          : `Attached persisted session "${esc(_vaSession.id)}" is active. Eligible review edits below write to that record.`
        : latest
          ? `Authorized persisted session found with status "${esc(latest.overall_status || 'unknown')}". Load it to continue review from the stored record.`
        : _selectedPatientScope()
          ? 'No authorized persisted video-assessment session was found for this patient. Local edits below remain scratchpad-only.'
          : 'Select a patient to check persisted session state. Until then, local edits below remain scratchpad-only.';

  const sidebar = tasks
    .map((t, i) => {
      const active = i === idx ? 'active' : '';
      const review = t.clinician_review?.reviewed_at ? ' ✓' : '';
      const flag =
        t.unsafe_flag || t.recording_status === 'unsafe_skipped'
          ? ' ⚠'
          : '';
      return `<button type="button" class="va-side-item ${active}" data-va-task-idx="${i}">${esc(t.task_name)}${review}${flag}</button>`;
    })
    .join('');

  const historyPlaceholder = `<div class="ds-card" style="margin-top:12px"><div class="ds-card__header"><h3>Prior sessions</h3></div><div class="ds-card__body"><p class="va-muted" style="font-size:12px">Side-by-side comparison with prior visits will appear here after longitudinal storage is enabled.</p></div></div>`;

  return `<div class="va-col va-col-clinician">
    <div class="va-banner va-banner--warn" role="status" style="margin-bottom:12px;padding:10px 12px;border-radius:8px;border:1px solid rgba(246,178,60,.35);background:rgba(246,178,60,.08);font-size:12px">${scopeNote}</div>
    <div class="va-clin-layout">
      <aside class="va-sidebar" aria-label="Tasks">${sidebar}</aside>
      <div class="va-clin-main">
        <h4 style="margin:0 0 8px">${task ? esc(task.task_name) : ''}</h4>
        <p class="va-muted" style="font-size:12px">${def ? esc(def.clinical_purpose) : ''}</p>
        ${_renderClinicianForm(task)}
        ${historyPlaceholder}
      </div>
    </div>
    <p class="va-muted" style="font-size:11px;margin-top:10px">Tip: use ↑ / ↓ to move between tasks when the sidebar is focused.</p>
  </div>`;
}

function _renderSummaryPanel() {
  const session = _ensureSession();
  _applySummary();
  const s = session.summary;
  const flags = (session.safety_flags || []).length;
  const latest = _latestBackendSession();
  const profile = _backendBindingRoleProfile();
  const locked = _isAttachedBackendSession() && !_canWriteAttachedClinicianSession();
  const summaryDraft = _vaConflictDraft.summary || null;
  return `<div class="ds-card va-summary"><div class="ds-card__header"><h3>${_isAttachedBackendSession() ? 'Persisted review session' : 'Local review scratchpad'}</h3></div><div class="ds-card__body">
    <div class="va-summary-grid">
      <div><span class="va-muted">Tasks recorded</span><strong>${s.tasks_completed}</strong></div>
      <div><span class="va-muted">Tasks skipped</span><strong>${s.tasks_skipped}</strong></div>
      <div><span class="va-muted">Safety flags</span><strong>${flags}</strong></div>
      <div><span class="va-muted">Draft completion</span><strong>${s.review_completion_percent}%</strong></div>
    </div>
    ${summaryDraft ? '<div class="va-banner va-banner--warn" role="status" style="margin-bottom:10px;padding:10px 12px;border-radius:8px;border:1px solid rgba(246,178,60,.35);background:rgba(246,178,60,.08);font-size:12px">Local summary draft restored after a save conflict. It is shown here but is not yet persisted.</div>' : ''}
    <div class="form-group" style="margin-top:12px"><label class="form-label">Clinician impression ${_isAttachedBackendSession() ? '(session)' : '(local draft)'}</label>
      <textarea id="va-summary-impression" class="form-control" rows="2" placeholder="Brief overall impression" ${locked ? 'disabled aria-disabled="true"' : ''}>${esc(summaryDraft?.clinician_impression ?? (session.summary.clinician_impression || ''))}</textarea></div>
    <div class="form-group"><label class="form-label">Recommended follow-up</label>
      <textarea id="va-summary-followup" class="form-control" rows="2" placeholder="Optional" ${locked ? 'disabled aria-disabled="true"' : ''}>${esc(summaryDraft?.recommended_followup ?? (session.summary.recommended_followup || ''))}</textarea></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button type="button" class="btn btn-secondary" id="va-export-json" ${_vaBackendBinding.exporting ? 'disabled aria-disabled="true"' : ''}>${profile.exportLabel}</button>
      <button type="button" class="btn btn-primary" id="va-save-summary" ${locked || _vaBackendBinding.saving ? 'disabled aria-disabled="true"' : ''}>${profile.summarySaveLabel}</button>
      ${_canWriteAttachedClinicianSession() ? `<button type="button" class="btn btn-primary" id="va-finalize-session" ${_vaBackendBinding.finalizing ? 'disabled aria-disabled="true"' : ''}>Finalize persisted session</button>` : ''}
    </div>
    <p class="va-muted" style="font-size:11px;margin-top:10px">${
      _isAttachedBackendSession()
        ? _sessionIsFinalized()
          ? 'This attached session is finalized. JSON export remains available; summary fields are read-only.'
          : 'This attached persisted session can be saved and finalized from this panel.'
        : latest
          ? 'An authorized persisted session exists separately. Load it first if you want these fields to hit the backend record.'
          : 'No authorized persisted session is attached here; these fields stay local on this page.'
    } ${_vaConflictDraft.message ? esc(_vaConflictDraft.message) + ' ' : ''}JSON export is a workflow artifact, not a signed report or EHR upload.</p>
  </div></div>`;
}

function _render() {
  const el = document.getElementById('content');
  if (!el) return;

  const session = _ensureSession();
  _syncSessionPatientId();

  const patientCol = _vaUiMode === 'patient' ? _renderPatientColumn() : `<div class="va-col"><p class="va-muted">Switch to Patient Capture Mode to use the guided flow.</p></div>`;

  const clinicianCol =
    _vaUiMode === 'clinician' ? _renderClinicianColumn() : `<div class="va-col"><p class="va-muted">Switch to Clinician Review Scratchpad for local annotation notes.</p></div>`;

  el.innerHTML = `
<div class="ch-shell va-shell">
  <div class="qeeg-hero" style="margin-bottom:20px">
    <div class="qeeg-hero__icon">🎥</div>
    <div>
      <div class="qeeg-hero__title">Video Assessments</div>
      <div class="qeeg-hero__sub">Clinician-reviewed video capture & structured observation (decision-support)</div>
      <p style="max-width:820px;margin-top:10px;font-size:13px;color:var(--text-secondary);line-height:1.5">
        Guided camera tasks with structured clinician scoring—not autonomous diagnosis, emotion certainty, or surveillance.
        This screen can now attach to an authorized persisted session for real upload, review, finalize, and export flows. When no session is attached, it stays a local scratchpad.
      </p>
    </div>
  </div>

  ${_renderPatientContextCard(session)}
  ${_renderVideoAvailabilityCard(session)}
  ${_renderGovernanceCard()}
  ${_renderQuickLinks()}

  ${_renderModeToggle()}

  <div class="va-grid">
    ${patientCol}
    ${clinicianCol}
  </div>

  ${_canUseClinicianWorkbench() ? _renderSummaryPanel() : ''}

  <div class="ds-card" style="margin-top:16px"><div class="ds-card__body" style="font-size:11px;color:var(--text-tertiary);line-height:1.5">
    Protocol: ${esc(VIDEO_ASSESSMENT_PROTOCOL.protocol_name)} v${esc(VIDEO_ASSESSMENT_PROTOCOL.protocol_version)} ·
    ${esc(DISCLAIMER)}
  </div></div>
</div>`;

  _wire();
}

function _collectReviewFromDom(task) {
  const def = _taskDef(task.task_id);
  const panel = document.querySelector('.va-clinician-form');
  if (!panel) return null;
  const r = _reviewDefaults(def);
  panel.querySelectorAll('[data-va-field]').forEach((el) => {
    const k = el.getAttribute('data-va-field');
    if (k) r[k] = el.value;
  });
  panel.querySelectorAll('[data-va-score]').forEach((el) => {
    const k = el.getAttribute('data-va-score');
    if (k) r.structured_scores[k] = el.value;
  });
  return r;
}

function _wire() {
  document.getElementById('va-patient-select')?.addEventListener('change', (e) => {
    const v = /** @type {HTMLSelectElement} */ (e.target).value?.trim();
    _vaSelectedPatientId = v || null;
    if (v) _writeStoredPatientId(v);
    if (_isAttachedBackendSession() && v && _vaSession?.patient_id && _vaSession.patient_id !== v) {
      _startScratchpadSession(v);
      showToast('Patient scope changed. Detached from the previous persisted session.');
    } else {
      _ensureSession().patient_id = v || (_demoTokenWorkspace() ? 'demo-workspace' : 'not-selected');
      _persistSession();
      showToast(v ? 'Patient context updated for this session.' : 'No patient selected.');
    }
    _render();
    void _refreshBackendSessions();
  });

  const pidForLinks = () => _vaSelectedPatientId || _readStoredPatientId();
  const navWithPatient = (page, setTwin) => {
    const pid = pidForLinks();
    if (!pid) {
      showToast('Select a patient first.');
      return;
    }
    if (setTwin) {
      try {
        window._deeptwinPatientId = pid;
      } catch (_) {}
    }
    _vaNavigate(page);
  };

  document.getElementById('va-link-profile')?.addEventListener('click', () => navWithPatient('patient-profile'));
  document.getElementById('va-link-assessments')?.addEventListener('click', () => navWithPatient('assessments'));
  document.getElementById('va-link-documents')?.addEventListener('click', () => navWithPatient('documents-hub'));
  document.getElementById('va-link-qeeg')?.addEventListener('click', () => navWithPatient('qeeg-launcher'));
  document.getElementById('va-link-mri')?.addEventListener('click', () => navWithPatient('mri-analysis'));
  document.getElementById('va-link-voice')?.addEventListener('click', () => navWithPatient('voice-analyzer'));
  document.getElementById('va-link-text')?.addEventListener('click', () => navWithPatient('text-analyzer'));
  document.getElementById('va-link-biomarkers')?.addEventListener('click', () => navWithPatient('biomarkers'));
  document.getElementById('va-link-deeptwin')?.addEventListener('click', () => navWithPatient('deeptwin', true));
  document.getElementById('va-link-protocol')?.addEventListener('click', () => navWithPatient('protocol-studio'));
  document.getElementById('va-link-brainmap')?.addEventListener('click', () => navWithPatient('brainmap-v2'));
  document.getElementById('va-link-schedule')?.addEventListener('click', () => navWithPatient('schedule-v2'));
  document.getElementById('va-link-inbox')?.addEventListener('click', () => _vaNavigate('inbox'));
  document.getElementById('va-link-handbooks')?.addEventListener('click', () => _vaNavigate('handbooks-v2'));
  document.getElementById('va-link-evidence')?.addEventListener('click', () => _vaNavigate('research-evidence'));
  document.getElementById('va-link-live')?.addEventListener('click', () => _vaNavigate('live-session'));

  document.getElementById('va-mode-patient')?.addEventListener('click', () => {
    _vaUiMode = 'patient';
    _render();
  });
  document.getElementById('va-mode-clinician')?.addEventListener('click', () => {
    if (!_canUseClinicianWorkbench()) {
      showToast('Clinician review scratchpad is limited to clinician, supervisor, or admin accounts.');
      return;
    }
    _vaUiMode = 'clinician';
    _render();
  });

  document.getElementById('va-create-persisted-session')?.addEventListener('click', async () => {
    await _createPersistedSession();
  });

  document.querySelectorAll('[data-va-attach-session]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const sessionId = btn.getAttribute('data-va-attach-session') || '';
      if (!sessionId) return;
      if (!_confirmDiscardLocalDraft('Attaching a persisted session')) return;
      _clearConflictDraft();
      await _loadBackendSession(sessionId);
    });
  });

  document.getElementById('va-refresh-persisted-session')?.addEventListener('click', async () => {
    if (!_isAttachedBackendSession()) return;
    await _refreshAttachedSession();
  });

  document.getElementById('va-setup-continue')?.addEventListener('click', () => {
    const cb = document.getElementById('va-setup-safe');
    if (!cb?.checked) {
      showToast('Please confirm your space is safe to continue.');
      return;
    }
    _vaSetupConfirmed = true;
    _vaPatientPhase = 'task_intro';
    _render();
  });

  document.getElementById('va-start-cam')?.addEventListener('click', async () => {
    try {
      await _startCamera();
      showToast('Camera started');
    } catch (e) {
      showToast('Could not access camera: ' + (e && e.message));
    }
  });

  document.getElementById('va-ready-record')?.addEventListener('click', () => {
    showToast('Review the checklist, then press Start recording when you are set.');
  });

  document.getElementById('va-skip-task')?.addEventListener('click', () => {
    void _skipCurrent('patient_pref');
  });
  document.getElementById('va-unsafe-task')?.addEventListener('click', () => {
    void _skipCurrent('unsafe');
  });

  document.getElementById('va-start-rec')?.addEventListener('click', async () => {
    try {
      if (!_vaMediaStream) await _startCamera();
      _vaRecordingCountdownActive = true;
      _vaPatientPhase = 'recording';
      _render();
      clearInterval(_vaCountdownTimer);
      let remain = 3;
      const elTimer = () => document.getElementById('va-rec-timer');
      if (elTimer()) elTimer().textContent = '3';
      _vaCountdownTimer = setInterval(() => {
        remain -= 1;
        if (remain <= 0) {
          clearInterval(_vaCountdownTimer);
          _vaCountdownTimer = null;
          _vaRecordingCountdownActive = false;
          _render();
          _beginRecording();
          return;
        }
        const el = elTimer();
        if (el) el.textContent = String(remain);
      }, 1000);
    } catch (e) {
      showToast(String(e && e.message));
    }
  });

  document.getElementById('va-stop-rec')?.addEventListener('click', () => {
    _stopRecordingClip();
  });

  document.getElementById('va-use-clip')?.addEventListener('click', async () => {
    const task = _currentTask();
    if (!task) return;
    if (_canWriteAttachedPatientSession()) {
      const blob = _vaBlobByTask[task.task_id];
      if (!blob && !task.recording_storage_ref) {
        showToast('No local clip is available to upload for this task.');
        return;
      }
      try {
        if (blob) {
          const fileName = `${task.task_id}-${Date.now()}.webm`;
          const fileType = blob.type || 'video/webm';
          const upload = await api.uploadVideoAssessmentTaskClip(
            _vaBackendBinding.sessionId,
            task.task_id,
            new File([blob], fileName, { type: fileType }),
            { expected_revision: _sessionRevisionToken() },
          );
          _replaceSession(upload?.session || _vaSession, { attachedSessionId: _vaBackendBinding.sessionId });
        }
        await _patchAttachedSession({
          tasks: [
            {
              task_id: task.task_id,
              recording_status: 'pending_review',
              skip_reason: null,
              unsafe_flag: false,
              video_capture_meta: task.video_capture_meta || null,
            },
          ],
        }, 'Clip saved to persisted session.');
      } catch (e) {
        if (e?._vaConflictHandled) return;
        if (e?.status === 409) {
          await _handleRevisionConflict(e);
          return;
        }
        showToast('Could not save clip to persisted session: ' + (e?.message || 'Unknown error'));
        return;
      }
    } else {
      task.recording_status = 'accepted';
      task.unsafe_flag = false;
      task.skip_reason = null;
    }
    _advanceTask();
  });

  document.getElementById('va-rerecord')?.addEventListener('click', () => {
    _vaPatientPhase = 'task_intro';
    _cleanupPreviewUrl();
    _render();
  });

  document.getElementById('va-skip-post')?.addEventListener('click', () => {
    void _skipCurrent('patient_pref');
  });

  document.querySelectorAll('[data-va-task-idx]').forEach((btn) => {
    btn.addEventListener('click', () => {
      _vaSelectedClinicianTask = parseInt(btn.getAttribute('data-va-task-idx'), 10);
      _render();
    });
  });

  document.getElementById('va-save-draft')?.addEventListener('click', () => {
    const session = _ensureSession();
    const task = session.tasks[_vaSelectedClinicianTask];
    if (!task) return;
    const reviewBody = {
      ..._collectReviewFromDom(task),
      reviewer_id: LOCAL_REVIEWER_ID,
      reviewed_at: null,
    };
    if (_canWriteAttachedClinicianSession()) {
      void _patchAttachedSession({
        tasks: [
          {
            task_id: task.task_id,
            clinician_review: reviewBody,
          },
        ],
      }, 'Review saved to persisted session.', {
        preserveDraft: { taskId: task.task_id, review: reviewBody },
      }).catch((e) => {
        if (e?._vaConflictHandled) return;
        showToast('Could not save review to persisted session: ' + (e?.message || 'Unknown error'));
      });
      return;
    }
    task.clinician_review = reviewBody;
    _persistSession();
    showToast('Local notes saved');
    _applySummary();
    _render();
  });

  document.getElementById('va-mark-reviewed')?.addEventListener('click', () => {
    const session = _ensureSession();
    const task = session.tasks[_vaSelectedClinicianTask];
    if (!task) return;
    const body = _collectReviewFromDom(task);
    const reviewBody = {
      ...body,
      reviewer_id: LOCAL_REVIEWER_ID,
      reviewed_at: new Date().toISOString(),
    };
    if (_canWriteAttachedClinicianSession()) {
      const patch = {
        task_id: task.task_id,
        clinician_review: reviewBody,
      };
      if (!task.skip_reason && task.recording_status !== 'unsafe_skipped' && task.recording_status !== 'skipped') {
        patch.recording_status = 'accepted';
      }
      void _patchAttachedSession({ tasks: [patch] }, 'Persisted task review completed.', {
        preserveDraft: { taskId: task.task_id, review: reviewBody },
      }).catch((e) => {
        if (e?._vaConflictHandled) return;
        showToast('Could not mark persisted task reviewed: ' + (e?.message || 'Unknown error'));
      });
      return;
    }
    task.clinician_review = reviewBody;
    _persistSession();
    showToast('Local draft marked complete');
    _applySummary();
    _render();
  });

  document.getElementById('va-save-summary')?.addEventListener('click', () => {
    const session = _ensureSession();
    const clinician_impression = document.getElementById('va-summary-impression')?.value || '';
    const recommended_followup = document.getElementById('va-summary-followup')?.value || '';
    if (_canWriteAttachedClinicianSession()) {
      void _patchAttachedSession({
        summary: { clinician_impression, recommended_followup },
      }, 'Persisted session summary saved.', {
        preserveDraft: {
          summary: { clinician_impression, recommended_followup },
        },
      }).catch((e) => {
        if (e?._vaConflictHandled) return;
        showToast('Could not save persisted summary: ' + (e?.message || 'Unknown error'));
      });
      return;
    }
    session.summary.clinician_impression = clinician_impression;
    session.summary.recommended_followup = recommended_followup;
    _persistSession();
    showToast('Local summary saved');
    _render();
  });

  document.getElementById('va-finalize-session')?.addEventListener('click', () => {
    if (!_canWriteAttachedClinicianSession()) return;
    const clinician_impression = document.getElementById('va-summary-impression')?.value || '';
    const recommended_followup = document.getElementById('va-summary-followup')?.value || '';
    void _finalizeAttachedSession({ clinician_impression, recommended_followup }).catch((e) => {
      if (e?._vaConflictHandled) return;
      showToast('Could not finalize persisted session: ' + (e?.message || 'Unknown error'));
    });
  });

  document.getElementById('va-export-json')?.addEventListener('click', () => {
    const session = _ensureSession();
    const clinician_impression = document.getElementById('va-summary-impression')?.value || '';
    const recommended_followup = document.getElementById('va-summary-followup')?.value || '';
    if (_isAttachedBackendSession()) {
      void _exportAttachedSession().catch((e) => {
        showToast('Could not export persisted session JSON: ' + (e?.message || 'Unknown error'));
      });
      return;
    }
    session.summary.clinician_impression = clinician_impression;
    session.summary.recommended_followup = recommended_followup;
    const payload = {
      exported_at: new Date().toISOString(),
      export_kind: 'video_assessment_session_draft',
      disclaimer: DISCLAIMER,
      persistence_note: _sessionPersistLabel(),
      session_json: session,
      blob_urls_not_included: true,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `video-assessment-draft-${session.id || 'session'}.json`;
    a.click();
    setTimeout(() => {
      try {
        URL.revokeObjectURL(a.href);
      } catch (_) {}
    }, 4000);
    showToast('Draft JSON downloaded — review before sharing.');
  });

  document.getElementById('va-upload-file')?.addEventListener('change', async (ev) => {
    const input = /** @type {HTMLInputElement} */ (ev.target);
    const file = input.files?.[0];
    if (!file) return;
    const task = _currentTask();
    if (!task) {
      showToast('No active task — start or reset the session.');
      input.value = '';
      return;
    }
    try {
      const blob = file.slice(0, file.size, file.type || 'video/mp4');
      const url = URL.createObjectURL(blob);
      _setTaskBlob(task.task_id, blob);
      _setTaskBlobUrl(task.task_id, url);
      task.recording_asset_id = 'file:' + task.task_id + ':' + Date.now();
      task.recording_status = 'pending_review';
      const meta = await _probeVideoBlob(blob);
      task.video_capture_meta = {
        ...meta,
        source: 'file_upload',
        file_name: file.name,
        reported_type: file.type || 'unknown',
        captured_at: new Date().toISOString(),
      };
      _vaPatientPhase = 'post_record';
      _vaPreviewUrl = url;
      _persistSession();
      showToast('File loaded for review — browser-only until accepted.');
      _render();
    } catch (e) {
      showToast('Could not load file: ' + (e && e.message));
    }
    input.value = '';
  });

  document.getElementById('va-load-stored-clip')?.addEventListener('click', () => {
    void _ensureSelectedTaskServerVideo();
  });

  if (_vaUiMode === 'clinician') {
    void _ensureSelectedTaskServerVideo();
  }
}


async function _skipCurrent(reason) {
  const task = _currentTask();
  if (!task) return;
  const original = {
    recording_status: task.recording_status,
    skip_reason: task.skip_reason,
    unsafe_flag: task.unsafe_flag,
  };
  task.recording_status = reason === 'unsafe' ? 'unsafe_skipped' : 'skipped';
  task.skip_reason = reason;
  task.unsafe_flag = reason === 'unsafe';
  if (reason === 'unsafe') {
    _ensureSession().safety_flags = [...new Set([...(_ensureSession().safety_flags || []), task.task_id])];
  }
  if (_canWriteAttachedPatientSession()) {
    try {
      await _patchAttachedSession({
        tasks: [
          {
            task_id: task.task_id,
            recording_status: task.recording_status,
            skip_reason: task.skip_reason,
            unsafe_flag: task.unsafe_flag,
          },
        ],
      }, 'Task status saved to persisted session.');
    } catch (e) {
      task.recording_status = original.recording_status;
      task.skip_reason = original.skip_reason;
      task.unsafe_flag = original.unsafe_flag;
      _applySummary();
      _render();
      showToast('Could not save task status to persisted session: ' + (e?.message || 'Unknown error'));
      return;
    }
  }
  _cleanupPreviewUrl();
  _vaPatientPhase = 'task_intro';
  _advanceTask(true);
}

function _advanceTask(fromSkip) {
  const session = _ensureSession();
  if (_vaTaskIndex < session.tasks.length - 1) {
    _vaTaskIndex++;
    _vaPatientPhase = 'task_intro';
  } else {
    _vaTaskIndex = session.tasks.length;
    if (!_isAttachedBackendSession()) {
      session.overall_status = 'completed';
      session.completed_at = new Date().toISOString();
    }
    _vaPatientPhase = 'setup';
    showToast(
      _isAttachedBackendSession()
        ? (fromSkip ? 'Last task handled in the persisted session.' : 'All tasks addressed for the persisted session.')
        : (fromSkip ? 'Last task handled—session complete.' : 'Session complete.')
    );
  }
  _applySummary();
  _persistSession();
  _render();
}

/**
 * @param {(title: string, subtitle?: string) => void} setTopbar
 * @param {(id: string) => void} navigate
 */
export async function pgVideoAssessments(setTopbar, navigate) {
  if (typeof setTopbar === 'function') setTopbar('Video Assessments', 'Virtual care');
  _vaNavigate = typeof navigate === 'function' ? navigate : () => {};
  const storedAttachment = videoAssessmentReadAttachmentToken();
  _vaBackendSessions = {
    loading: false,
    checked: false,
    patientId: _selectedPatientScope(),
    total: 0,
    items: [],
    error: null,
  };

  _vaPatientsLoadFailed = false;
  _vaPatientsCache = null;
  try {
    _vaPatientsCache = await api.listPatients({ limit: 200 });
  } catch (_) {
    _vaPatientsLoadFailed = true;
  }

  const storedPid = _readStoredPatientId();
  _vaSelectedPatientId = storedPid || null;

  _vaSession = null;
  _clearLocalMediaCache();
  _clearServerMediaCache();
  _clearConflictDraft();
  _vaBackendBinding = {
    sessionId: storedAttachment?.session_id || null,
    loading: false,
    saving: false,
    finalizing: false,
    exporting: false,
    error: null,
  };
  const pid =
    _vaSelectedPatientId || (_demoTokenWorkspace() ? 'demo-workspace' : 'not-selected');
  _vaSession = createEmptySession({ patient_id: pid });

  _vaUiMode = 'patient';
  _vaPatientPhase = 'setup';
  _vaTaskIndex = 0;
  _vaSetupConfirmed = false;
  _vaSelectedClinicianTask = 0;
  _stopMedia();
  _cleanupPreviewUrl();

  if (!_vaKeysBound && typeof document !== 'undefined') {
    _vaKeysBound = true;
    document.addEventListener('keydown', (e) => {
      if (_vaUiMode !== 'clinician') return;
      const session = _vaSession;
      if (!session?.tasks?.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        _vaSelectedClinicianTask = Math.min(_vaSelectedClinicianTask + 1, session.tasks.length - 1);
        _render();
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        _vaSelectedClinicianTask = Math.max(0, _vaSelectedClinicianTask - 1);
        _render();
      }
    });
  }

  _render();
  void _refreshBackendSessions().then(() => {
    if (_vaBackendBinding.sessionId) {
      void _loadBackendSession(_vaBackendBinding.sessionId, { quiet: true, fromStoredToken: true });
    }
  });
}
