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
import { ensureAgentBrainStatus } from './agent-brain-status.js';
import { isDemoSession } from './demo-session.js';
import { currentUser } from './auth.js';
import { mountAnalyzerAIReportStrip } from './analyzer-ai-report-ui.js';

const SESSION_STORAGE_KEY = 'ds_video_assessment_session_v2';
export const VIDEO_ASSESSMENT_SESSION_STORAGE_KEY = SESSION_STORAGE_KEY;
const HISTORICAL_AI_FEEDBACK_NOTE_MAX = 300;

const DISCLAIMER =
  'This is a controlled preview using synthetic or clinician-provided data where applicable. ' +
  'This page supports clinical review and decision support only. ' +
  'It does not diagnose, prescribe, triage emergencies, approve treatment, or act autonomously. ' +
  'All outputs require clinician review.';

/** Video-specific safety warnings for camera-based movement analysis. */
const VIDEO_SAFETY_WARNINGS = {
  cameraQuality: 'Camera resolution and frame rate affect movement detection accuracy. HD (720p+) at 30fps recommended. Low-quality cameras may miss subtle movements.',
  lighting: 'Even, front-facing lighting is required. Backlight, shadows, or low light can obscure body landmarks and produce false signals.',
  bodyPositionClothing: 'Body position and clothing may affect analysis. Loose clothing can obscure limb boundaries. Face-down or off-center positioning may reduce landmark accuracy.',
  biasDisclosure: 'Analysis accuracy varies across demographics. Pose estimation performance differs by skin tone, age, and body type. Interpret with cultural and demographic awareness.',
};

/** Evidence grades for guided video assessment tasks. */
const VIDEO_TASK_EVIDENCE = {
  rest_tremor: {
    grade: 'B',
    biomarker: 'rest_tremor_frequency',
    note: '4-6 Hz rest tremor distinguishes PD from essential tremor (8-12 Hz). Contactless measurement ICC 0.82-0.91.',
    safeWording: 'Tremor frequency features are model-assisted observation cues. Camera artifacts may mimic tremor — requires clinician review.',
  },
  postural_tremor: {
    grade: 'C',
    biomarker: 'postural_tremor_amplitude',
    note: 'Amplitude correlates with clinical severity. Camera artifact can mimic tremor — requires clinician review.',
    safeWording: 'Postural tremor amplitude is a model-assisted cue. Not a tremor diagnosis.',
  },
  finger_tap_left: {
    grade: 'A',
    biomarker: 'finger_tapping_speed',
    note: 'Meta-analytic: speed decay most reliable PD feature. AUC 0.85-0.94. Requires clinical confirmation.',
    safeWording: 'Finger tapping speed features may support clinician review of bradykinesia. Not a standalone diagnosis.',
  },
  finger_tap_right: {
    grade: 'A',
    biomarker: 'finger_tapping_speed',
    note: 'Meta-analytic: speed decay most reliable PD feature. AUC 0.85-0.94. Requires clinical confirmation.',
    safeWording: 'Finger tapping speed features may support clinician review of bradykinesia. Not a standalone diagnosis.',
  },
  hand_open_close_left: {
    grade: 'B',
    biomarker: 'pronation_supination_rom',
    note: 'Hand movement ROM and velocity correlate with UPDRS-III. ICC 0.78-0.89 vs clinical rating.',
    safeWording: 'Hand movement features are model-assisted cues for bradykinesia review. Requires clinician confirmation.',
  },
  hand_open_close_right: {
    grade: 'B',
    biomarker: 'pronation_supination_rom',
    note: 'Hand movement ROM and velocity correlate with UPDRS-III. ICC 0.78-0.89 vs clinical rating.',
    safeWording: 'Hand movement features are model-assisted cues for bradykinesia review. Requires clinician confirmation.',
  },
  pronation_supination_left: {
    grade: 'B',
    biomarker: 'pronation_supination_rom',
    note: 'Forearm rotation ROM and velocity correlate with UPDRS-III. ICC 0.78-0.89 vs clinical rating.',
    safeWording: 'Pronation-supination features support clinician bradykinesia review. Not a standalone diagnosis.',
  },
  pronation_supination_right: {
    grade: 'B',
    biomarker: 'pronation_supination_rom',
    note: 'Forearm rotation ROM and velocity correlate with UPDRS-III. ICC 0.78-0.89 vs clinical rating.',
    safeWording: 'Pronation-supination features support clinician bradykinesia review. Not a standalone diagnosis.',
  },
  foot_tap_left: {
    grade: 'B',
    biomarker: 'lower_limb_speed',
    note: 'Lower limb repetitive movement shows correlation with bradykinesia. Less validated than upper limb.',
    safeWording: 'Foot tapping features are model-assisted cues with moderate evidence. Requires clinician review.',
  },
  foot_tap_right: {
    grade: 'B',
    biomarker: 'lower_limb_speed',
    note: 'Lower limb repetitive movement shows correlation with bradykinesia. Less validated than upper limb.',
    safeWording: 'Foot tapping features are model-assisted cues with moderate evidence. Requires clinician review.',
  },
  gait_tandem_walk: {
    grade: 'A',
    biomarker: 'stride_length',
    note: 'Strongest single PD gait predictor. Meta-analytic SMD = -1.12 vs controls. AUC 0.91-0.99 for PD diagnosis.',
    safeWording: 'Gait features are the strongest validated video-based movement biomarkers. Still require clinical confirmation.',
  },
  stand_up_from_chair: {
    grade: 'B',
    biomarker: 'postural_sway_area',
    note: 'Sit-to-stand timing correlates with bradykinesia and postural instability.',
    safeWording: 'Postural transition features are proxy markers. Not a fall-risk determination.',
  },
  balance_eyes_open: {
    grade: 'B',
    biomarker: 'postural_sway_area',
    note: 'COPC sway area correlates with Berg Balance Scale (r=-0.71). Single-leg stance predicts falls over 6 months.',
    safeWording: 'Balance features are proxy markers. Not a fall-risk determination.',
  },
  balance_eyes_closed: {
    grade: 'B',
    biomarker: 'postural_sway_area',
    note: 'COPC sway area correlates with Berg Balance Scale (r=-0.71). Eyes-closed condition more sensitive to proprioceptive loss.',
    safeWording: 'Balance features are proxy markers. Not a fall-risk determination.',
  },
};

function _renderTaskEvidenceBadge(taskId) {
  const ev = VIDEO_TASK_EVIDENCE[taskId];
  if (!ev) return '';
  const colors = {
    A: { bg: 'rgba(34,197,94,0.12)', text: '#16a34a', label: 'A — Meta-analytic' },
    B: { bg: 'rgba(59,130,246,0.12)', text: '#2563eb', label: 'B — Controlled trial' },
    C: { bg: 'rgba(245,158,11,0.12)', text: '#d97706', label: 'C — Observational' },
    D: { bg: 'rgba(249,115,22,0.12)', text: '#f97316', label: 'D — Pilot' },
  };
  const g = String(ev.grade || 'D').toUpperCase();
  const c = colors[g] || colors.D;
  return `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:4px;background:${c.bg};color:${c.text};font-size:11px;font-weight:600">${esc(c.label)}</span>`;
}

function _renderTaskEvidenceBlock(taskId) {
  const ev = VIDEO_TASK_EVIDENCE[taskId];
  if (!ev) return '';
  return `<div style="margin-top:10px;padding:8px 10px;border-radius:6px;background:rgba(155,127,255,0.06);border:1px solid rgba(155,127,255,0.18);font-size:11px;line-height:1.5;color:var(--text-secondary)">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
      <strong style="color:var(--text-primary)">Evidence grade:</strong> ${_renderTaskEvidenceBadge(taskId)}
    </div>
    <div><strong>Biomarker:</strong> ${esc(ev.biomarker)}</div>
    <div>${esc(ev.note)}</div>
    <div style="margin-top:4px;color:var(--text-tertiary)"><strong>Safe wording:</strong> ${esc(ev.safeWording)}</div>
  </div>`;
}

function _renderVideoSafetyPanel() {
  return `<div style="margin-top:12px;padding:10px 12px;border-radius:8px;border:1px solid rgba(239,68,68,0.25);background:rgba(239,68,68,0.05);font-size:11px;line-height:1.6;color:var(--text-secondary)">
    <strong style="color:var(--red)">Video analysis limitations</strong>
    <ul style="margin:6px 0 0 16px;padding:0">
      <li>${esc(VIDEO_SAFETY_WARNINGS.cameraQuality)}</li>
      <li>${esc(VIDEO_SAFETY_WARNINGS.lighting)}</li>
      <li>${esc(VIDEO_SAFETY_WARNINGS.bodyPositionClothing)}</li>
      <li>${esc(VIDEO_SAFETY_WARNINGS.biasDisclosure)}</li>
    </ul>
    <div style="margin-top:8px;padding:6px 8px;border-radius:4px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);color:var(--amber);font-size:11px">
      <strong>IMPORTANT:</strong> No video-based movement biomarker is FDA-approved for standalone diagnosis as of 2026. All outputs are model-assisted observation cues requiring clinician confirmation.
    </div>
  </div>`;
}

/**
 * FUTURE MOTOR FEATURE PANEL (Post-MVP)
 * When MediaPipe / pose-detection backend becomes available:
 * - Joint overlay visualization (shoulders, elbows, wrists, hips, knees)
 * - Confidence scores per keypoint (0–1.0, only show >= 0.7 threshold)
 * - Tremor band power (4–6 Hz) when motion envelope supports it
 * - Bradykinesia amplitude trend (frame-to-frame)
 * - Gait stride length / cadence when walking tasks recorded
 * See video-assessment-protocol.js future_automation_notes for per-task signals.
 *
 * SAFETY NOTES:
 * - All motor features labeled as "model-assisted observation cues"—not autonomous diagnosis
 * - Clinician must confirm any flagged cues manually
 * - Demo mode shows synthetic sample visualizations only (no live camera)
 * - Backend availability guarded by HAS_VIDEO_PIPELINE flag (TBD)
 */

function _canReviewPriorSessions(role = '') {
  return role === 'clinician' || role === 'supervisor' || role === 'admin';
}


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
  if (_sessionHasServerTruth()) {
    return 'Persisted session attached: clinician review saves and exports use backend truth. Browser storage is only a transient mirror for this view.';
  }
  if (!_persistAllowed()) return 'Session data is not persisted across reloads in this build.';
  if (_demoTokenWorkspace()) return 'Demo-token session: draft reviews stay in this browser only (not the clinical record).';
  return 'Draft reviews are stored in this browser session only until backend persistence is enabled—not the clinical record.';
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
/** @type {Record<string, Blob>} task_id -> last accepted local blob before persisted upload */
var _vaBlobByTask = {};
/** @type {Record<string, string>} task_id -> fetched persisted clip object URL */
var _vaRemoteVideoUrlByTask = {};
/** @type {Record<string, boolean>} task_id -> persisted clip fetch in flight */
var _vaRemoteVideoLoadingByTask = {};
/** @type {Record<string, string>} task_id -> persisted clip fetch error */
var _vaRemoteVideoErrorByTask = {};
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
var _vaPriorSessionsState = {
  sessionId: null,
  loading: false,
  loaded: false,
  error: null,
  items: [],
  trendItems: [],
  selectedIds: [],
  aiSummaryLoading: false,
  aiSummaryError: null,
  aiSummaryResult: null,
  aiSummarySelectionKey: '',
  aiSummaryStaleReason: '',
  aiSummaryFeedbackLoading: false,
  aiSummaryFeedbackSaving: false,
  aiSummaryFeedbackError: null,
  aiSummaryFeedbackResult: null,
  aiSummaryFeedbackStatus: '',
  aiSummaryFeedbackNote: '',
  aiSummaryFeedbackSavedInView: false,
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

function _setTaskRemoteVideoUrl(taskId, url) {
  if (_vaRemoteVideoUrlByTask[taskId]) {
    try {
      URL.revokeObjectURL(_vaRemoteVideoUrlByTask[taskId]);
    } catch (_) {}
  }
  if (url) _vaRemoteVideoUrlByTask[taskId] = url;
  else delete _vaRemoteVideoUrlByTask[taskId];
}

function _clearLocalVideoState() {
  Object.keys(_vaBlobUrlByTask).forEach((taskId) => _setTaskBlobUrl(taskId, null));
  _vaBlobByTask = {};
}

function _clearRemoteVideoState() {
  Object.keys(_vaRemoteVideoUrlByTask).forEach((taskId) => _setTaskRemoteVideoUrl(taskId, null));
  _vaRemoteVideoLoadingByTask = {};
  _vaRemoteVideoErrorByTask = {};
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

function _persistSession() {
  try {
    if (_vaSession && _persistAllowed()) {
      const payload = _sessionHasServerTruth(_vaSession)
        ? {
            session_id: _vaSession.id,
            selected_patient_id: _vaSelectedPatientId || _vaSession.patient_id || null,
            persisted_backend_session: true,
          }
        : _vaSession;
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
    }
  } catch (_) {}
}

function _loadPersistedSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        if (parsed.session_id && !parsed.tasks) {
          return parsed;
        }
        if (parsed.id && _isPersistedSessionId(parsed.id)) {
          return {
            session_id: parsed.id,
            selected_patient_id: parsed.patient_id || null,
            persisted_backend_session: true,
          };
        }
      }
      return parsed;
    }
    const legacy = sessionStorage.getItem('ds_video_assessment_session');
    if (legacy) return JSON.parse(legacy);
  } catch (_) {}
  return null;
}

function _sessionHasServerTruth(session = _vaSession) {
  return _isPersistedSessionId(session?.id || '');
}

function _sessionReadOnly(session = _vaSession) {
  return _sessionHasServerTruth(session) && String(session?.overall_status || '').trim().toLowerCase() === 'finalized';
}

function _sessionRevisionToken(session = _vaSession) {
  return String(session?.revision_token || '').trim();
}

function _replaceSession(nextSession, { persist = true } = {}) {
  if (!nextSession || typeof nextSession !== 'object') return;
  _vaSession = nextSession;
  if (_vaSelectedPatientId) _vaSession.patient_id = _vaSelectedPatientId;
  _applySummary();
  if (persist) _persistSession();
}

function _taskLocalBlob(taskId) {
  return _vaBlobByTask[taskId] || null;
}

function _taskRemoteVideoUrl(taskId) {
  return _vaRemoteVideoUrlByTask[taskId] || '';
}

async function _ensureSelectedClinicianTaskVideoLoaded() {
  if (_vaUiMode !== 'clinician') return;
  const session = _ensureSession();
  if (!_sessionHasServerTruth(session)) return;
  const task = session.tasks?.[_vaSelectedClinicianTask];
  if (!task?.task_id || !task?.recording_storage_ref) return;
  if (_vaBlobUrlByTask[task.task_id] || _taskRemoteVideoUrl(task.task_id) || _vaRemoteVideoLoadingByTask[task.task_id]) {
    return;
  }
  _vaRemoteVideoLoadingByTask[task.task_id] = true;
  delete _vaRemoteVideoErrorByTask[task.task_id];
  _render();
  try {
    const res = await api.getVideoAssessmentTaskVideo(session.id, task.task_id);
    if (_vaSession?.id !== session.id) return;
    const url = URL.createObjectURL(res.blob);
    _setTaskRemoteVideoUrl(task.task_id, url);
  } catch (error) {
    _vaRemoteVideoErrorByTask[task.task_id] = error?.message || 'Could not load the stored clip.';
  } finally {
    delete _vaRemoteVideoLoadingByTask[task.task_id];
    _render();
  }
}

function _downloadSessionJsonPayload(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => {
    try {
      URL.revokeObjectURL(a.href);
    } catch (_) {}
  }, 4000);
}

async function _refreshPersistedSessionTruth(sessionId, { renderAfter = true } = {}) {
  if (!_isPersistedSessionId(sessionId)) return null;
  const fresh = await api.getVideoAssessmentSession(sessionId);
  if (_vaSession?.id === sessionId) {
    _replaceSession(fresh);
    if (renderAfter) _render();
  }
  return fresh;
}

async function _recoverPersistedSessionConflict(sessionId, error) {
  try {
    await _refreshPersistedSessionTruth(sessionId, { renderAfter: false });
  } catch (_) {}
  if (error?.code === 'session_conflict') {
    showToast('Persisted session changed on the server. Latest version reloaded.', 'warning');
    return;
  }
  if (error?.code === 'session_finalized' || error?.code === 'session_already_finalized') {
    showToast('Persisted session is finalized and now read-only.', 'warning');
    return;
  }
  showToast(error?.message || 'Could not save the persisted session.', 'error');
}

async function _patchPersistedSession(patch, successMessage) {
  const session = _ensureSession();
  const sessionId = session?.id || '';
  if (!_isPersistedSessionId(sessionId)) return null;
  const nextPatch = {
    ...(patch || {}),
    expected_revision: _sessionRevisionToken(session),
  };
  try {
    const saved = await api.patchVideoAssessmentSession(sessionId, nextPatch);
    _replaceSession(saved);
    _render();
    if (successMessage) showToast(successMessage);
    return saved;
  } catch (error) {
    await _recoverPersistedSessionConflict(sessionId, error);
    _render();
    return null;
  }
}

async function _finalizePersistedSession(successMessage) {
  const session = _ensureSession();
  const sessionId = session?.id || '';
  if (!_isPersistedSessionId(sessionId)) return null;
  try {
    const saved = await api.finalizeVideoAssessmentSession(sessionId, {
      expected_revision: _sessionRevisionToken(session),
      clinician_impression: document.getElementById('va-summary-impression')?.value || '',
      recommended_followup: document.getElementById('va-summary-followup')?.value || '',
    });
    _replaceSession(saved);
    _render();
    if (successMessage) showToast(successMessage);
    return saved;
  } catch (error) {
    await _recoverPersistedSessionConflict(sessionId, error);
    _render();
    return null;
  }
}

async function _patchPersistedTaskState(taskId, taskPatch, successMessage) {
  return _patchPersistedSession(
    {
      tasks: [{ task_id: taskId, ...taskPatch }],
    },
    successMessage,
  );
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


function _currentPriorComparisonSessionId() {
  const sid = _vaSession?.id || '';
  return _isPersistedSessionId(sid) ? sid : null;
}

function _resetPriorSessionsState() {
  _vaPriorSessionsState = {
    sessionId: null,
    loading: false,
    loaded: false,
    error: null,
    items: [],
    trendItems: [],
    selectedIds: [],
    aiSummaryLoading: false,
    aiSummaryError: null,
    aiSummaryResult: null,
    aiSummarySelectionKey: '',
    aiSummaryStaleReason: '',
    aiSummaryFeedbackLoading: false,
    aiSummaryFeedbackSaving: false,
    aiSummaryFeedbackError: null,
    aiSummaryFeedbackResult: null,
    aiSummaryFeedbackStatus: '',
    aiSummaryFeedbackNote: '',
    aiSummaryFeedbackSavedInView: false,
  };
}

function _formatPriorSessionDate(ts) {
  if (!ts) return 'Unknown date';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch (_) {
    return d.toLocaleString();
  }
}

function _priorSessionStatusLabel(item) {
  const status = String(item?.overall_status || '').trim().toLowerCase();
  return status ? status.replace(/_/g, ' ') : 'unknown status';
}

function _priorSessionClipLabel(item) {
  return item?.has_clips ? 'Clips available' : 'No stored clips';
}

function _priorSessionSeverityLabel(item) {
  const severity = String(item?.summary?.severity_level || item?.severity_level || '').trim().toLowerCase();
  return severity || 'not stated';
}

function _priorSessionTasksLabel(item) {
  const completed = Number.isFinite(item?.summary?.tasks_completed)
    ? item.summary.tasks_completed
    : Number.isFinite(item?.tasks_completed)
      ? item.tasks_completed
      : 0;
  const total = Number.isFinite(item?.summary?.tasks_total)
    ? item.summary.tasks_total
    : Number.isFinite(item?.tasks_total)
      ? item.tasks_total
      : 0;
  return `${completed} / ${total}`;
}

function _priorSessionSummaryText(item) {
  const text = String(item?.summary?.key_findings || '').trim();
  return text || 'No clinician summary recorded.';
}

function _selectedPriorSessions() {
  const byId = new Map((_vaPriorSessionsState.items || []).map((item) => [item.session_id, item]));
  return (_vaPriorSessionsState.selectedIds || [])
    .map((sessionId) => byId.get(sessionId))
    .filter(Boolean);
}

function _selectedPriorSessionIds() {
  return _selectedPriorSessions().map((item) => item.session_id);
}

function _currentAiSummarySelectionKey() {
  return _selectedPriorSessionIds().join('|');
}

function _emptyAiSummaryFeedbackDraft() {
  return { feedback_status: '', feedback_note: '' };
}

function _shortSessionId(sessionId) {
  const text = String(sessionId || '').trim();
  if (!text) return 'unknown';
  return text.length <= 12 ? text : text.slice(-8);
}

function _aiSummaryStatusLabel(status) {
  switch (String(status || '').trim()) {
    case 'fresh':
      return 'Current summary';
    case 'unchanged':
      return 'Unchanged from prior generation';
    case 'regenerated_selection_changed':
      return 'Regenerated: selected sessions changed';
    case 'regenerated_source_changed':
      return 'Regenerated: source data changed';
    case 'regenerated_logic_changed':
      return 'Regenerated: summary logic updated';
    default:
      return 'Summary status unavailable';
  }
}

function _aiSummaryStaleCopy(reason) {
  if (reason === 'selection_changed') {
    return 'The previous AI historical summary no longer matches the current selected prior sessions and must be regenerated.';
  }
  return '';
}

function _historicalFeedbackStatusLabel(status) {
  switch (String(status || '').trim()) {
    case 'accepted':
      return 'Accepted';
    case 'partially_accepted':
      return 'Partially accepted';
    case 'disagreed':
      return 'Disagreed';
    case 'not_useful':
      return 'Not useful';
    default:
      return 'Not recorded';
  }
}

function _currentAiSummaryEventId() {
  const eventId = String(_vaPriorSessionsState.aiSummaryResult?.provenance?.event_id || '').trim();
  return eventId || null;
}

function _currentSessionContextLabel() {
  const session = _vaSession || _ensureSession();
  return [
    `Session ${session?.id || 'unknown'}`,
    `Patient ${session?.patient_id || 'not-selected'}`,
    `Protocol ${VIDEO_ASSESSMENT_PROTOCOL.protocol_name}`,
    `Status ${session?.overall_status || 'unknown'}`,
  ].join(' · ');
}

function _sortPriorSessionsOldestFirst(items = []) {
  return [...items].sort((a, b) => {
    const aKey = String(a?.finalized_at || a?.occurred_at || '');
    const bKey = String(b?.finalized_at || b?.occurred_at || '');
    if (aKey === bKey) {
      return String(a?.session_id || '').localeCompare(String(b?.session_id || ''));
    }
    return aKey.localeCompare(bKey);
  });
}

function _sortPriorSessionsNewestFirst(items = []) {
  return [...items].sort((a, b) => {
    const aKey = String(a?.finalized_at || a?.occurred_at || '');
    const bKey = String(b?.finalized_at || b?.occurred_at || '');
    if (aKey === bKey) {
      return String(b?.session_id || '').localeCompare(String(a?.session_id || ''));
    }
    return bKey.localeCompare(aKey);
  });
}

function _severityRank(level) {
  return {
    none: 0,
    mild: 1,
    moderate: 2,
    severe: 3,
  }[String(level || '').trim().toLowerCase()] ?? null;
}

function _buildTrendDeltas(values = []) {
  const deltas = [];
  for (let i = 1; i < values.length; i += 1) {
    deltas.push(values[i] - values[i - 1]);
  }
  return deltas;
}

function _classifyTrend(values, { decreaseLabel, sameLabel, increaseLabel } = {}) {
  if (!Array.isArray(values) || values.length < 2) return 'insufficient data';
  const deltas = _buildTrendDeltas(values);
  if (deltas.length === 0) return 'insufficient data';
  if (deltas.every((delta) => delta === 0)) return sameLabel;
  if (deltas.every((delta) => delta <= 0) && deltas.some((delta) => delta < 0)) return decreaseLabel;
  if (deltas.every((delta) => delta >= 0) && deltas.some((delta) => delta > 0)) return increaseLabel;
  return 'mixed';
}

/*
 * Longitudinal trend summary is read-only. It uses persisted finalized-session
 * backend data only and must not evolve into inferred clinical recommendations
 * or any write-capable workflow in this phase.
 */
function _computePriorTrendSummary(trendItems = []) {
  const ordered = _sortPriorSessionsOldestFirst(trendItems);
  if (ordered.length < 2) {
    return {
      ordered,
      enoughData: false,
      severityTrend: 'insufficient data',
      completionTrend: 'insufficient data',
      clipTrend: 'insufficient data',
    };
  }

  const severityValues = ordered
    .map((item) => _severityRank(item?.severity_level))
    .filter((value) => value != null);
  const completionValues = ordered
    .map((item) => {
      const total = Number(item?.tasks_total);
      const completed = Number(item?.tasks_completed);
      if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(completed)) return null;
      return completed / total;
    })
    .filter((value) => value != null);
  const clipValues = ordered
    .map((item) => (typeof item?.has_clips === 'boolean' ? item.has_clips : null))
    .filter((value) => value != null);

  const severityTrend = _classifyTrend(severityValues, {
    decreaseLabel: 'improved',
    sameLabel: 'stable',
    increaseLabel: 'worsened',
  });
  const completionTrend = _classifyTrend(completionValues, {
    decreaseLabel: 'declined',
    sameLabel: 'stable',
    increaseLabel: 'improved',
  });
  let clipTrend = 'insufficient data';
  if (clipValues.length >= 2) {
    clipTrend = clipValues.every((value) => value === clipValues[0]) ? 'consistent' : 'inconsistent';
  }

  return {
    ordered,
    enoughData: severityValues.length >= 2 || completionValues.length >= 2 || clipValues.length >= 2,
    severityTrend,
    completionTrend,
    clipTrend,
  };
}

function _renderHistoricalExportTrendSummary(trend) {
  if (!trend.enoughData) {
    return '<p style="margin:0;color:#4b5563">Not enough finalized sessions to determine trend.</p>';
  }
  return `<div style="display:grid;gap:8px">
    <div><strong>Severity trajectory:</strong> ${esc(trend.severityTrend)}.</div>
    <div><strong>Task completion trajectory:</strong> ${esc(trend.completionTrend)}.</div>
    <div><strong>Clip availability:</strong> ${esc(trend.clipTrend)}.</div>
  </div>`;
}

function _renderHistoricalExportAiSummary(summary) {
  if (!summary) return '';
  const observations = Array.isArray(summary.trend_observations) ? summary.trend_observations : [];
  const limitations = Array.isArray(summary.limitations) ? summary.limitations : [];
  const basis = summary.data_basis || {};
  const provenance = summary.provenance || {};
  const statusLabel = _aiSummaryStatusLabel(summary.summary_status);
  const dataBasisLine = [
    `${basis.session_count ?? 0} finalized session(s)`,
    `severity data ${basis.has_severity_data ? 'available' : 'limited'}`,
    `task completion ${basis.has_task_completion_data ? 'available' : 'limited'}`,
    `clip availability ${basis.has_clip_availability_data ? 'available' : 'limited'}`,
  ].join(' · ');
  const provenanceLine = [
    `Generated ${_formatPriorSessionDate(summary.generated_at)}`,
    `Logic ${provenance.summary_logic_version || 'unknown'}`,
    `${provenance.session_count ?? 0} source session(s)`,
    `Sources ${(Array.isArray(provenance.source_session_ids) ? provenance.source_session_ids : []).map(_shortSessionId).join(', ') || 'none'}`,
  ].join(' · ');
  return `<section class="panel">
      <h2>AI historical summary</h2>
      <p class="meta"><strong>Status:</strong> ${esc(statusLabel)}</p>
      <p>${esc(summary.summary_text || 'No advisory summary text returned.')}</p>
      <div style="margin-top:10px">
        <strong>Trend observations</strong>
        <ul style="margin:6px 0 0 18px;padding:0">${observations.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>
      </div>
      <p class="meta" style="margin-top:10px"><strong>Data basis:</strong> ${esc(dataBasisLine)}</p>
      <p class="meta" style="margin-top:10px"><strong>Provenance / generation metadata:</strong> ${esc(provenanceLine)}</p>
      <div style="margin-top:10px">
        <strong>Limitations</strong>
        <ul style="margin:6px 0 0 18px;padding:0">${limitations.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>
      </div>
      <p class="meta" style="margin-top:12px">Advisory summary generated from persisted finalized-session comparison data. Not a diagnosis or treatment recommendation.</p>
    </section>`;
}

function _renderHistoricalExportAiSummaryFeedback(feedback) {
  if (!feedback || !feedback.has_feedback) return '';
  return `<section class="panel">
      <h2>Clinician feedback on advisory summary</h2>
      <p class="meta"><strong>Feedback status:</strong> ${esc(_historicalFeedbackStatusLabel(feedback.feedback_status))}</p>
      <p class="meta"><strong>Updated:</strong> ${esc(_formatPriorSessionDate(feedback.updated_at))}</p>
      <p class="meta"><strong>Actor role:</strong> ${esc(feedback.actor_role || 'clinician')}</p>
      ${feedback.feedback_note ? `<p style="margin-top:10px">${esc(feedback.feedback_note)}</p>` : '<p class="meta" style="margin-top:10px">No additional note recorded.</p>'}
      <p class="meta" style="margin-top:12px">This feedback records the clinician response to advisory summary output only. It does not alter the persisted session review automatically.</p>
    </section>`;
}

/*
 * Historical comparison export is a presentation layer over already-authorized,
 * persisted backend summaries that are already visible in the UI. It must not
 * fetch broader review payloads or expose hidden local draft state in this phase.
 */
function _buildHistoricalComparisonExportHtml() {
  const session = _vaSession || _ensureSession();
  const selected = _selectedPriorSessions();
  const trend = _computePriorTrendSummary(_vaPriorSessionsState.trendItems || []);
  const aiSummary = _vaPriorSessionsState.aiSummaryResult;
  const aiSummaryFeedback = _vaPriorSessionsState.aiSummaryFeedbackSavedInView
    ? _vaPriorSessionsState.aiSummaryFeedbackResult
    : null;
  const generatedAt = _formatPriorSessionDate(new Date().toISOString());
  const selectedSummaryRows = selected.length
    ? selected.map((item) => `<tr>
        <td style="padding:8px;border-bottom:1px solid #d1d5db">${esc(_formatPriorSessionDate(item.occurred_at))}</td>
        <td style="padding:8px;border-bottom:1px solid #d1d5db">${esc(_priorSessionSeverityLabel(item))}</td>
        <td style="padding:8px;border-bottom:1px solid #d1d5db">${esc(_priorSessionTasksLabel(item))}</td>
        <td style="padding:8px;border-bottom:1px solid #d1d5db">${esc(_priorSessionClipLabel(item))}</td>
        <td style="padding:8px;border-bottom:1px solid #d1d5db">${esc(item.finalized_by || 'Clinician')} · ${esc(_formatPriorSessionDate(item.finalized_at))}</td>
      </tr>`).join('')
    : '<tr><td colspan="5" style="padding:8px;border-bottom:1px solid #d1d5db;color:#4b5563">No prior finalized sessions selected for export.</td></tr>';

  const comparisonTable = selected.length
    ? (() => {
        const headerCells = selected
          .map((item) => `<th style="text-align:left;padding:8px;border-bottom:1px solid #d1d5db;vertical-align:top;min-width:180px">${esc(_formatPriorSessionDate(item.occurred_at))}</th>`)
          .join('');
        const row = (label, mapper) => `<tr>
          <th style="text-align:left;padding:8px;border-bottom:1px solid #d1d5db;vertical-align:top;width:180px">${label}</th>
          ${selected.map((item) => `<td style="padding:8px;border-bottom:1px solid #d1d5db;vertical-align:top">${mapper(item)}</td>`).join('')}
        </tr>`;
        return `<table style="width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed">
          <thead>
            <tr>
              <th style="text-align:left;padding:8px;border-bottom:1px solid #d1d5db">Field</th>
              ${headerCells}
            </tr>
          </thead>
          <tbody>
            ${row('Session date', (item) => esc(_formatPriorSessionDate(item.occurred_at)))}
            ${row('Severity level', (item) => esc(_priorSessionSeverityLabel(item)))}
            ${row('Tasks completed / total', (item) => esc(_priorSessionTasksLabel(item)))}
            ${row('High-level summary', (item) => esc(_priorSessionSummaryText(item)))}
            ${row('Has clips', (item) => esc(item.has_clips ? 'Yes' : 'No'))}
            ${row('Finalized by / at', (item) => esc(`${item.finalized_by || 'Clinician'} · ${_formatPriorSessionDate(item.finalized_at)}`))}
          </tbody>
        </table>`;
      })()
    : '<p style="margin:0;color:#4b5563">No prior finalized sessions selected for side-by-side comparison.</p>';

  const trendStrip = trend.ordered.length
    ? `<table style="width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed">
        <thead>
          <tr>
            <th style="text-align:left;padding:8px;border-bottom:1px solid #d1d5db">Trend field</th>
            ${trend.ordered.map((item) => `<th style="text-align:left;padding:8px;border-bottom:1px solid #d1d5db;vertical-align:top">${esc(_formatPriorSessionDate(item.occurred_at))}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th style="text-align:left;padding:8px;border-bottom:1px solid #d1d5db;vertical-align:top">Severity trajectory</th>
            ${trend.ordered.map((item) => `<td style="padding:8px;border-bottom:1px solid #d1d5db;vertical-align:top">${esc(_priorSessionSeverityLabel(item))}</td>`).join('')}
          </tr>
          <tr>
            <th style="text-align:left;padding:8px;border-bottom:1px solid #d1d5db;vertical-align:top">Task completion trajectory</th>
            ${trend.ordered.map((item) => `<td style="padding:8px;border-bottom:1px solid #d1d5db;vertical-align:top">${esc(_priorSessionTasksLabel(item))}</td>`).join('')}
          </tr>
          <tr>
            <th style="text-align:left;padding:8px;border-bottom:1px solid #d1d5db;vertical-align:top">Clip availability</th>
            ${trend.ordered.map((item) => `<td style="padding:8px;border-bottom:1px solid #d1d5db;vertical-align:top">${esc(_priorSessionClipLabel(item))}</td>`).join('')}
          </tr>
        </tbody>
      </table>`
    : '<p style="margin:0;color:#4b5563">Not enough finalized sessions to determine trend.</p>';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Video assessment historical comparison</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; color: #111827; line-height: 1.45; }
      h1, h2 { margin: 0 0 12px; }
      h2 { margin-top: 24px; font-size: 18px; }
      p { margin: 0 0 10px; }
      .meta { color: #4b5563; font-size: 12px; }
      .panel { margin-top: 18px; padding: 16px; border: 1px solid #d1d5db; border-radius: 10px; }
      table { margin-top: 8px; }
      @media print {
        body { margin: 12mm; }
        .panel { break-inside: avoid; }
      }
    </style>
  </head>
  <body>
    <h1>Video assessment historical comparison</h1>
    <p class="meta"><strong>Current session context:</strong> ${esc(_currentSessionContextLabel())}</p>
    <p class="meta"><strong>Generated:</strong> ${esc(generatedAt)}</p>
    <p class="meta"><strong>Attached session:</strong> ${esc(session?.id || 'unknown')}</p>

    <section class="panel">
      <h2>Selected prior finalized sessions summary</h2>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr>
            <th style="text-align:left;padding:8px;border-bottom:1px solid #d1d5db">Session date</th>
            <th style="text-align:left;padding:8px;border-bottom:1px solid #d1d5db">Severity level</th>
            <th style="text-align:left;padding:8px;border-bottom:1px solid #d1d5db">Tasks completed / total</th>
            <th style="text-align:left;padding:8px;border-bottom:1px solid #d1d5db">Clips</th>
            <th style="text-align:left;padding:8px;border-bottom:1px solid #d1d5db">Finalized by / at</th>
          </tr>
        </thead>
        <tbody>${selectedSummaryRows}</tbody>
      </table>
    </section>

    <section class="panel">
      <h2>Side-by-side comparison</h2>
      ${comparisonTable}
    </section>

    <section class="panel">
      <h2>Longitudinal trend summary</h2>
      ${trendStrip}
      <div style="margin-top:12px">
        ${_renderHistoricalExportTrendSummary(trend)}
      </div>
    </section>

    ${aiSummary ? _renderHistoricalExportAiSummary(aiSummary) : ''}
    ${aiSummaryFeedback ? _renderHistoricalExportAiSummaryFeedback(aiSummaryFeedback) : ''}

    <p class="meta" style="margin-top:24px">Read-only historical comparison generated from persisted finalized-session backend data.</p>
  </body>
</html>`;
}

function _exportHistoricalComparisonReport() {
  const role = currentUser?.role || '';
  if (!_canReviewPriorSessions(role) || !_currentPriorComparisonSessionId()) return;
  const reportWindow = window.open('', '_blank', 'noopener,noreferrer');
  if (!reportWindow || !reportWindow.document) {
    showToast('Could not open the historical comparison export window.');
    return;
  }
  const html = _buildHistoricalComparisonExportHtml();
  reportWindow.document.open();
  reportWindow.document.write(html);
  reportWindow.document.close();
  try {
    reportWindow.focus();
  } catch (_) {}
}

async function _ensurePriorSessionsLoaded() {
  const role = currentUser?.role || '';
  const sessionId = _currentPriorComparisonSessionId();
  if (!_canReviewPriorSessions(role) || !sessionId || _vaUiMode !== 'clinician') {
    if (
      _vaPriorSessionsState.sessionId ||
      _vaPriorSessionsState.loading ||
      _vaPriorSessionsState.loaded ||
      _vaPriorSessionsState.error ||
      _vaPriorSessionsState.items.length
    ) {
      _resetPriorSessionsState();
    }
    return;
  }
  if (_vaPriorSessionsState.loading) return;
  if (_vaPriorSessionsState.loaded && _vaPriorSessionsState.sessionId === sessionId) return;

  _vaPriorSessionsState = {
    sessionId,
    loading: true,
    loaded: false,
    error: null,
    items: [],
    trendItems: [],
    selectedIds: [],
    aiSummaryLoading: false,
    aiSummaryError: null,
    aiSummaryResult: null,
    aiSummarySelectionKey: '',
    aiSummaryStaleReason: '',
    aiSummaryFeedbackLoading: false,
    aiSummaryFeedbackSaving: false,
    aiSummaryFeedbackError: null,
    aiSummaryFeedbackResult: null,
    aiSummaryFeedbackStatus: '',
    aiSummaryFeedbackNote: '',
    aiSummaryFeedbackSavedInView: false,
  };
  _render();
  try {
    const res = await api.getVideoAssessmentPriorFinalizedSessions(sessionId);
    const items = _sortPriorSessionsNewestFirst(Array.isArray(res?.sessions) ? res.sessions : []);
    const trendItems = _sortPriorSessionsOldestFirst(Array.isArray(res?.trend_sessions) ? res.trend_sessions : []);
    _vaPriorSessionsState = {
      sessionId,
      loading: false,
      loaded: true,
      error: null,
      items,
      trendItems,
      selectedIds: [],
      aiSummaryLoading: false,
      aiSummaryError: null,
      aiSummaryResult: null,
      aiSummarySelectionKey: '',
      aiSummaryStaleReason: '',
      aiSummaryFeedbackLoading: false,
      aiSummaryFeedbackSaving: false,
      aiSummaryFeedbackError: null,
      aiSummaryFeedbackResult: null,
      aiSummaryFeedbackStatus: '',
      aiSummaryFeedbackNote: '',
      aiSummaryFeedbackSavedInView: false,
    };
  } catch (e) {
    _vaPriorSessionsState = {
      sessionId,
      loading: false,
      loaded: true,
      error: e?.message || 'Could not load prior finalized sessions from the backend.',
      items: [],
      trendItems: [],
      selectedIds: [],
      aiSummaryLoading: false,
      aiSummaryError: null,
      aiSummaryResult: null,
      aiSummarySelectionKey: '',
      aiSummaryStaleReason: '',
      aiSummaryFeedbackLoading: false,
      aiSummaryFeedbackSaving: false,
      aiSummaryFeedbackError: null,
      aiSummaryFeedbackResult: null,
      aiSummaryFeedbackStatus: '',
      aiSummaryFeedbackNote: '',
      aiSummaryFeedbackSavedInView: false,
    };
  }
  _render();
}

function _togglePriorSessionSelection(sessionId) {
  const current = new Set(_vaPriorSessionsState.selectedIds || []);
  const hadSummary = !!_vaPriorSessionsState.aiSummaryResult;
  if (current.has(sessionId)) {
    current.delete(sessionId);
  } else {
    if (current.size >= 3) {
      showToast('Select up to 3 prior finalized sessions for comparison.');
      return;
    }
    current.add(sessionId);
  }
  _vaPriorSessionsState = {
    ..._vaPriorSessionsState,
    selectedIds: Array.from(current),
    aiSummaryLoading: false,
    aiSummaryError: null,
    aiSummaryResult: null,
    aiSummarySelectionKey: '',
    aiSummaryStaleReason: hadSummary ? 'selection_changed' : '',
    aiSummaryFeedbackLoading: false,
    aiSummaryFeedbackSaving: false,
    aiSummaryFeedbackError: null,
    aiSummaryFeedbackResult: null,
    aiSummaryFeedbackStatus: '',
    aiSummaryFeedbackNote: '',
    aiSummaryFeedbackSavedInView: false,
  };
  _render();
}

async function _loadHistoricalAiSummaryFeedback(sessionId, summaryEventId) {
  if (!sessionId || !summaryEventId) return;
  _vaPriorSessionsState = {
    ..._vaPriorSessionsState,
    aiSummaryFeedbackLoading: true,
    aiSummaryFeedbackError: null,
    aiSummaryFeedbackResult: null,
    aiSummaryFeedbackStatus: '',
    aiSummaryFeedbackNote: '',
    aiSummaryFeedbackSavedInView: false,
  };
  _render();
  try {
    const result = await api.getVideoAssessmentHistoricalAiSummaryFeedback(sessionId, summaryEventId);
    if (_currentPriorComparisonSessionId() !== sessionId || _currentAiSummaryEventId() !== summaryEventId) return;
    _vaPriorSessionsState = {
      ..._vaPriorSessionsState,
      aiSummaryFeedbackLoading: false,
      aiSummaryFeedbackError: null,
      aiSummaryFeedbackResult: result?.has_feedback ? result : null,
      aiSummaryFeedbackStatus: result?.has_feedback ? (result.feedback_status || '') : '',
      aiSummaryFeedbackNote: result?.has_feedback ? (result.feedback_note || '') : '',
      aiSummaryFeedbackSavedInView: false,
    };
  } catch (e) {
    if (_currentPriorComparisonSessionId() !== sessionId || _currentAiSummaryEventId() !== summaryEventId) return;
    _vaPriorSessionsState = {
      ..._vaPriorSessionsState,
      aiSummaryFeedbackLoading: false,
      aiSummaryFeedbackError: e?.message || 'Could not load clinician feedback for this advisory summary.',
      aiSummaryFeedbackResult: null,
      aiSummaryFeedbackStatus: '',
      aiSummaryFeedbackNote: '',
      aiSummaryFeedbackSavedInView: false,
    };
  }
  _render();
}

async function _generateHistoricalAiSummary() {
  const role = currentUser?.role || '';
  const sessionId = _currentPriorComparisonSessionId();
  if (!_canReviewPriorSessions(role) || !sessionId) return;
  const selectedIds = _selectedPriorSessionIds();
  const selectionKey = selectedIds.join('|');
  if (!selectedIds.length) {
    showToast('Select at least one prior finalized session first.');
    return;
  }
  _vaPriorSessionsState = {
    ..._vaPriorSessionsState,
    aiSummaryLoading: true,
    aiSummaryError: null,
    aiSummaryResult: null,
    aiSummarySelectionKey: selectionKey,
    aiSummaryStaleReason: '',
    aiSummaryFeedbackLoading: false,
    aiSummaryFeedbackSaving: false,
    aiSummaryFeedbackError: null,
    aiSummaryFeedbackResult: null,
    aiSummaryFeedbackStatus: '',
    aiSummaryFeedbackNote: '',
    aiSummaryFeedbackSavedInView: false,
  };
  _render();
  try {
    const result = await api.generateVideoAssessmentHistoricalAiSummary(sessionId, {
      selected_session_ids: selectedIds,
    });
    if (_currentPriorComparisonSessionId() !== sessionId || _currentAiSummarySelectionKey() !== selectionKey) {
      return;
    }
    _vaPriorSessionsState = {
      ..._vaPriorSessionsState,
      aiSummaryLoading: false,
      aiSummaryError: null,
      aiSummaryResult: result || null,
      aiSummarySelectionKey: selectionKey,
      aiSummaryStaleReason: '',
      aiSummaryFeedbackLoading: false,
      aiSummaryFeedbackSaving: false,
      aiSummaryFeedbackError: null,
      aiSummaryFeedbackResult: null,
      aiSummaryFeedbackStatus: '',
      aiSummaryFeedbackNote: '',
      aiSummaryFeedbackSavedInView: false,
    };
    _render();
    await _loadHistoricalAiSummaryFeedback(sessionId, String(result?.provenance?.event_id || '').trim());
    return;
  } catch (e) {
    if (_currentPriorComparisonSessionId() !== sessionId || _currentAiSummarySelectionKey() !== selectionKey) {
      return;
    }
    _vaPriorSessionsState = {
      ..._vaPriorSessionsState,
      aiSummaryLoading: false,
      aiSummaryError: e?.message || 'Historical AI summary is temporarily unavailable.',
      aiSummaryResult: null,
      aiSummarySelectionKey: selectionKey,
      aiSummaryStaleReason: '',
      aiSummaryFeedbackLoading: false,
      aiSummaryFeedbackSaving: false,
      aiSummaryFeedbackError: null,
      aiSummaryFeedbackResult: null,
      aiSummaryFeedbackStatus: '',
      aiSummaryFeedbackNote: '',
      aiSummaryFeedbackSavedInView: false,
    };
  }
  _render();
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
    let settled = false;
    const done = (payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      try {
        URL.revokeObjectURL(url);
      } catch (_) {}
      resolve(payload);
    };
    const timeoutId = setTimeout(() => {
      done({
        duration_seconds: null,
        video_width: null,
        video_height: null,
        audio_track_present: null,
        probe_error: 'metadata_timeout',
      });
    }, 250);
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
    _setTaskBlob(task.task_id, blob);
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
    ${_renderVideoSafetyPanel()}
    <label class="va-checkbox" style="margin-top:12px;display:block"><input type="checkbox" id="va-setup-safe" ${_vaSetupConfirmed ? 'checked' : ''}/> I confirm I am in a safe space for movement tasks today.</label>
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
    <div class="ds-card"><div class="ds-card__header"><h3 style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">${esc(def.script.title)} ${_renderTaskEvidenceBadge(task.task_id)}</h3></div><div class="ds-card__body">
      <p class="va-muted"><strong>What this checks:</strong> ${esc(def.script.what_this_checks)}</p>
      <p><strong>How to do it:</strong> ${esc(def.script.how_to_do)}</p>
      <p><strong>Camera:</strong> ${esc(def.script.camera_position)}</p>
      <p><strong>Safety:</strong> ${esc(def.script.safety)}</p>
      ${_renderTaskEvidenceBlock(task.task_id)}
      <div class="va-demo-placeholder" role="note" style="margin-top:10px">
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
    ${_renderTaskEvidenceBlock(task.task_id)}
    <div style="margin-top:10px;padding:8px 10px;border-radius:6px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);font-size:11px;color:var(--text-secondary);line-height:1.5">
      <strong style="color:var(--amber)">⚠ Camera quality may affect accuracy:</strong> ${esc(VIDEO_SAFETY_WARNINGS.cameraQuality)}
      <div style="margin-top:4px">${esc(VIDEO_SAFETY_WARNINGS.biasDisclosure)}</div>
    </div>
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
    if ((t.recording_asset_id && _vaBlobUrlByTask[t.task_id]) || t.recording_storage_ref) withClip++;
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
      <div style="margin-top:12px;padding:8px 10px;border-radius:6px;background:rgba(155,127,255,0.06);border:1px solid rgba(155,127,255,0.18)">
        <strong style="color:var(--text-primary)">Movement biomarker evidence grades (per task):</strong>
        <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:6px">
          <span style="font-size:11px;padding:2px 8px;border-radius:4px;background:rgba(34,197,94,0.12);color:#16a34a;font-weight:600">A — Meta-analytic support</span>
          <span style="font-size:11px;padding:2px 8px;border-radius:4px;background:rgba(59,130,246,0.12);color:#2563eb;font-weight:600">B — Controlled trial</span>
          <span style="font-size:11px;padding:2px 8px;border-radius:4px;background:rgba(245,158,11,0.12);color:#d97706;font-weight:600">C — Observational</span>
        </div>
        <p style="margin:8px 0 0;font-size:11px;color:var(--text-tertiary)">No video-based movement biomarker is FDA-approved for standalone diagnosis as of 2026. All outputs require clinician confirmation.</p>
      </div>
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
      <button type="button" class="btn btn-ghost btn-sm" id="va-link-assessments" ${dis}>Assessments</button>
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
            <div style="margin-top:10px;padding:8px;border-radius:6px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);font-size:11px;color:var(--text-secondary);line-height:1.5">
              <strong style="color:var(--amber)">📹 Camera quality check:</strong> ${esc(VIDEO_SAFETY_WARNINGS.cameraQuality)}
              <div style="margin-top:4px"><strong>💡 Lighting:</strong> ${esc(VIDEO_SAFETY_WARNINGS.lighting)}</div>
              <div style="margin-top:4px"><strong>👤 Position & clothing:</strong> ${esc(VIDEO_SAFETY_WARNINGS.bodyPositionClothing)}</div>
              <div style="margin-top:4px"><strong>⚖️ Bias note:</strong> ${esc(VIDEO_SAFETY_WARNINGS.biasDisclosure)}</div>
            </div>
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
  const rev = _mergeReview(task.clinician_review, def);
  const readOnly = _sessionReadOnly();
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

  const blobSrc = (task.recording_asset_id ? _vaBlobUrlByTask[task.task_id] : null) || _taskRemoteVideoUrl(task.task_id) || null;
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
  const remoteLoading = !!_vaRemoteVideoLoadingByTask[task.task_id];
  const remoteError = _vaRemoteVideoErrorByTask[task.task_id] || '';
  const canLoadStoredClip = _sessionHasServerTruth() && !!task.recording_storage_ref;
  const videoBlock = blobSrc
    ? `${metaHtml}<video controls src="${esc(blobSrc)}" style="width:100%;border-radius:8px;background:#000"></video>`
    : remoteLoading
      ? `<div class="va-video-placeholder">Loading stored persisted clip…</div>`
      : canLoadStoredClip
        ? `<div class="va-video-placeholder">Stored persisted clip is available for this task.${remoteError ? ' ' + esc(remoteError) : ''} <button type="button" class="btn btn-secondary btn-sm" id="va-load-stored-video" style="margin-left:8px">Load stored clip</button></div>`
        : `<div class="va-video-placeholder">No recording is available for this task in the current session or persisted backend storage.</div>`;

  return `<div class="va-clinician-form">
    ${conflictBanner}
    ${unsafeBadge}${skipBadge}
    <div style="margin-bottom:12px">${videoBlock}</div>
    ${_renderTaskEvidenceBlock(task.task_id)}
    ${readOnly ? '<p class="va-muted" style="font-size:12px;margin:0 0 12px;color:var(--amber)">This persisted session is finalized. Structured review fields are read-only.</p>' : ''}
    <fieldset style="border:0;padding:0;margin:0" ${readOnly ? 'disabled' : ''}>
      ${baseFields}
      ${structured}
      <div class="form-group"><label class="form-label">Free-text comment</label>
        <textarea class="form-control" rows="3" data-va-field="free_text_comment">${esc(rev.free_text_comment)}</textarea></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button type="button" class="btn btn-secondary" id="va-save-draft">${_sessionHasServerTruth() ? 'Save to persisted session' : 'Save draft'}</button>
        <button type="button" class="btn btn-primary" id="va-mark-reviewed">${_sessionHasServerTruth() ? 'Mark reviewed in persisted session' : 'Mark reviewed'}</button>
      </div>
    </fieldset>
  </div>`;
}

/*
 * Prior finalized-session comparison is read-only. It consumes compact,
 * persisted backend summaries only and must never trigger patch/finalize/upload
 * writes from this UI surface.
 */
function _renderPriorSessionsComparison() {
  const role = currentUser?.role || '';
  const attachedSessionId = _currentPriorComparisonSessionId();
  if (!_canReviewPriorSessions(role) || !attachedSessionId) return '';

  const currentStatus = _vaSession?.overall_status || 'unknown';
  const state = _vaPriorSessionsState;
  let body = '';

  if (state.loading) {
    body = '<p class="va-muted" style="font-size:12px;margin:0">Loading prior finalized sessions from the backend…</p>';
  } else if (state.error) {
    body = `<p class="va-muted" role="alert" style="font-size:12px;margin:0;color:var(--amber)">Prior finalized sessions are temporarily unavailable. Refresh to retry. ${esc(state.error)}</p>`;
  } else if ((state.items || []).length === 0) {
    body = '<p class="va-muted" style="font-size:12px;margin:0">No prior finalized sessions are available for this patient and assessment context.</p>';
  } else {
    const selectedCount = (state.selectedIds || []).length;
    const exportDisabled = state.loading || !!state.error;
    const aiSummaryDisabled = exportDisabled || selectedCount === 0;
    const aiSummaryActionLabel =
      state.aiSummaryResult || state.aiSummaryStaleReason
        ? 'Regenerate AI historical summary'
        : 'Generate AI historical summary';
    const staleNotice = state.aiSummaryStaleReason
      ? `<p class="va-muted" role="status" style="font-size:12px;margin:0 0 12px;color:var(--amber)">${esc(_aiSummaryStaleCopy(state.aiSummaryStaleReason))}</p>`
      : '';
    const cards = (state.items || []).map((item) => {
      const selected = state.selectedIds.includes(item.session_id);
      const disableNewSelection = !selected && selectedCount >= 3;
      const summary = item.summary || {};
      const comparePanelId = `va-prior-compare-panel-${esc(item.session_id)}`;
      return `<div class="ds-card" style="margin:0;border:${selected ? '1px solid rgba(0,212,188,.45)' : '1px solid var(--border)'}">
        <div class="ds-card__body" style="padding:12px;display:grid;gap:8px">
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
            <div>
              <strong style="display:block;font-size:13px">${esc(_formatPriorSessionDate(item.occurred_at))}</strong>
              <span class="va-muted" style="font-size:11px">Status: ${esc(_priorSessionStatusLabel(item))}</span>
            </div>
            <button
              type="button"
              class="btn ${selected ? 'btn-secondary' : 'btn-primary'} btn-sm"
              data-va-prior-select="${esc(item.session_id)}"
              aria-pressed="${selected ? 'true' : 'false'}"
              aria-controls="${comparePanelId}"
              ${disableNewSelection ? 'disabled aria-disabled="true"' : ''}
            >${selected ? 'Selected' : 'Compare'}</button>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;font-size:10px">
            <span style="padding:2px 8px;border:1px solid rgba(255,181,71,.35);background:rgba(255,181,71,.10);border-radius:999px;color:var(--amber)">Finalized</span>
            <span style="padding:2px 8px;border:1px solid var(--border);border-radius:999px">Severity: ${esc(_priorSessionSeverityLabel(item))}</span>
            <span style="padding:2px 8px;border:1px solid var(--border);border-radius:999px">Tasks: ${esc(_priorSessionTasksLabel(item))}</span>
            <span style="padding:2px 8px;border:1px solid ${item.has_clips ? 'rgba(0,212,188,.35)' : 'var(--border)'};background:${item.has_clips ? 'rgba(0,212,188,.08)' : 'transparent'};border-radius:999px;color:${item.has_clips ? 'var(--teal)' : 'var(--text-secondary)'}">${esc(_priorSessionClipLabel(item))}</span>
          </div>
          <p class="va-muted" style="font-size:12px;line-height:1.5;margin:0">${esc(_priorSessionSummaryText(item))}</p>
          <div class="va-muted" style="font-size:11px">Finalized by ${esc(item.finalized_by || 'Clinician')} · ${esc(_formatPriorSessionDate(item.finalized_at))}</div>
        </div>
      </div>`;
    }).join('');

    const selected = _selectedPriorSessions();
    let compareTable = '';
    if (selected.length > 0) {
      const headers = selected.map((item) => `<th id="va-prior-compare-panel-${esc(item.session_id)}" style="text-align:left;padding:8px;border-bottom:1px solid var(--border);min-width:220px">${esc(_formatPriorSessionDate(item.occurred_at))}</th>`).join('');
      const row = (label, mapper) => `<tr>
        <th style="text-align:left;padding:8px;border-bottom:1px solid var(--border);vertical-align:top">${label}</th>
        ${selected.map((item) => `<td style="padding:8px;border-bottom:1px solid var(--border);vertical-align:top">${mapper(item)}</td>`).join('')}
      </tr>`;
      compareTable = `<div class="ds-card" style="margin-top:12px">
        <div class="ds-card__header"><h3 style="margin:0">Side-by-side comparison</h3></div>
        <div class="ds-card__body" style="overflow:auto">
          <table style="width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed">
            <thead>
              <tr>
                <th style="text-align:left;padding:8px;border-bottom:1px solid var(--border)">Field</th>
                ${headers}
              </tr>
            </thead>
            <tbody>
              ${row('Session date', (item) => esc(_formatPriorSessionDate(item.occurred_at)))}
              ${row('Severity level', (item) => esc(_priorSessionSeverityLabel(item)))}
              ${row('Tasks completed / total', (item) => esc(_priorSessionTasksLabel(item)))}
              ${row('High-level summary', (item) => esc(_priorSessionSummaryText(item)))}
              ${row('Has clips', (item) => esc(item.has_clips ? 'Yes' : 'No'))}
              ${row('Finalized by / at', (item) => esc(`${item.finalized_by || 'Clinician'} · ${_formatPriorSessionDate(item.finalized_at)}`))}
            </tbody>
          </table>
        </div>
      </div>`;
    }

    body = `
      <p class="va-muted" style="font-size:12px;margin-top:0">Current session status: <strong>${esc(currentStatus)}</strong>. Select 1 to 3 prior finalized sessions to compare. This area is read-only and uses persisted backend data only.</p>
      ${staleNotice}
      <div style="display:flex;justify-content:flex-end;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 12px">
        <button type="button" class="btn btn-secondary btn-sm" id="va-generate-history-ai" ${aiSummaryDisabled ? 'disabled title="Select at least one prior finalized session to summarize"' : ''}>${state.aiSummaryLoading ? 'Generating…' : aiSummaryActionLabel}</button>
        <button type="button" class="btn btn-secondary btn-sm" id="va-export-history" ${exportDisabled ? 'disabled' : ''}>Export historical comparison</button>
      </div>
      <div class="va-prior-session-grid" style="display:grid;gap:10px" role="list" aria-label="Prior finalized sessions">${cards}</div>
      ${_renderLongitudinalTrendSummary()}
      ${_renderHistoricalAiSummaryPanel()}
      ${compareTable}
    `;
  }

  return `<div class="ds-card" style="margin-top:12px">
    <div class="ds-card__header"><h3 style="margin:0">Prior finalized sessions (read-only, backend data)</h3></div>
    <div class="ds-card__body">${body}</div>
  </div>`;
}

function _renderLongitudinalTrendSummary() {
  const role = currentUser?.role || '';
  if (!_canReviewPriorSessions(role) || !_currentPriorComparisonSessionId()) return '';

  const trend = _computePriorTrendSummary(_vaPriorSessionsState.trendItems || []);
  if (!trend.ordered.length) return '';

  if (!trend.enoughData) {
    return `<div class="ds-card" style="margin-top:12px">
      <div class="ds-card__header"><h3 style="margin:0">Longitudinal trend summary (read-only, finalized sessions)</h3></div>
      <div class="ds-card__body">
        <p class="va-muted" style="font-size:12px;margin:0">Not enough finalized sessions to determine trend.</p>
      </div>
    </div>`;
  }

  const headerCells = trend.ordered
    .map((item) => `<th style="text-align:left;padding:8px;border-bottom:1px solid var(--border);min-width:140px">${esc(_formatPriorSessionDate(item.occurred_at))}</th>`)
    .join('');
  const valueRow = (label, values) => `<tr>
    <th style="text-align:left;padding:8px;border-bottom:1px solid var(--border);vertical-align:top">${label}</th>
    ${values.map((value) => `<td style="padding:8px;border-bottom:1px solid var(--border);vertical-align:top">${value}</td>`).join('')}
  </tr>`;
  const textualSummary = [
    `Severity trajectory: ${trend.severityTrend}.`,
    `Task completion trajectory: ${trend.completionTrend}.`,
    `Clip availability: ${trend.clipTrend}.`,
  ].join(' ');

  return `<div class="ds-card" style="margin-top:12px">
    <div class="ds-card__header"><h3 style="margin:0">Longitudinal trend summary (read-only, finalized sessions)</h3></div>
    <div class="ds-card__body">
      <div style="overflow:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed">
          <thead>
            <tr>
              <th style="text-align:left;padding:8px;border-bottom:1px solid var(--border)">Trend field</th>
              ${headerCells}
            </tr>
          </thead>
          <tbody>
            ${valueRow('Severity trajectory', trend.ordered.map((item) => esc(_priorSessionSeverityLabel(item))))}
            ${valueRow('Task completion trajectory', trend.ordered.map((item) => esc(_priorSessionTasksLabel(item))))}
            ${valueRow('Clip availability', trend.ordered.map((item) => esc(_priorSessionClipLabel(item))))}
          </tbody>
        </table>
      </div>
      <div class="va-muted" style="font-size:12px;line-height:1.6;margin-top:12px">
        <strong style="color:var(--text-primary)">Trend summary</strong>
        <p style="margin:6px 0 0">${esc(textualSummary)}</p>
      </div>
    </div>
  </div>`;
}

function _renderHistoricalAiSummaryFeedbackSection() {
  const role = currentUser?.role || '';
  if (!_canReviewPriorSessions(role)) return '';
  const state = _vaPriorSessionsState;
  const saved = state.aiSummaryFeedbackResult;
  const statusOptions = [
    ['accepted', 'Accepted'],
    ['partially_accepted', 'Partially accepted'],
    ['disagreed', 'Disagreed'],
    ['not_useful', 'Not useful'],
  ].map(([value, label]) => `<option value="${value}" ${state.aiSummaryFeedbackStatus === value ? 'selected' : ''}>${label}</option>`).join('');
  const savedLine = saved?.has_feedback && saved?.updated_at
    ? `<p class="va-muted" role="status" style="font-size:12px;margin:8px 0 0;color:var(--teal)">Saved ${esc(_formatPriorSessionDate(saved.updated_at))} · ${esc(_historicalFeedbackStatusLabel(saved.feedback_status))}</p>`
    : '';
  const loadingLine = state.aiSummaryFeedbackLoading
    ? '<p class="va-muted" style="font-size:12px;margin:0 0 8px">Loading saved clinician feedback…</p>'
    : '';
  const errorLine = state.aiSummaryFeedbackError
    ? `<p class="va-muted" role="alert" style="font-size:12px;margin:8px 0 0;color:var(--amber)">${esc(state.aiSummaryFeedbackError)}</p>`
    : '';
  return `<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">
      <strong style="display:block;margin-bottom:6px">Clinician feedback on advisory summary</strong>
      <p class="va-muted" style="font-size:12px;line-height:1.5;margin:0 0 10px">This records the clinician's response to the advisory summary. It does not alter the persisted session review automatically.</p>
      ${loadingLine}
      <div class="form-group" style="margin-bottom:10px">
        <label class="form-label" for="va-history-feedback-status">Feedback status</label>
        <select id="va-history-feedback-status" class="form-control" ${state.aiSummaryFeedbackSaving ? 'disabled' : ''}>
          <option value="">Select…</option>
          ${statusOptions}
        </select>
      </div>
      <div class="form-group" style="margin-bottom:10px">
        <label class="form-label" for="va-history-feedback-note">Optional note</label>
        <textarea id="va-history-feedback-note" class="form-control" rows="2" maxlength="${HISTORICAL_AI_FEEDBACK_NOTE_MAX}" placeholder="Optional short note" ${state.aiSummaryFeedbackSaving ? 'disabled' : ''}>${esc(state.aiSummaryFeedbackNote || '')}</textarea>
      </div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <button type="button" class="btn btn-secondary btn-sm" id="va-save-history-feedback" ${state.aiSummaryFeedbackSaving || state.aiSummaryFeedbackLoading ? 'disabled' : ''}>${state.aiSummaryFeedbackSaving ? 'Saving…' : 'Save feedback'}</button>
        ${savedLine}
      </div>
      ${errorLine}
    </div>`;
}

function _renderHistoricalAiSummaryPanel() {
  const role = currentUser?.role || '';
  if (!_canReviewPriorSessions(role) || !_currentPriorComparisonSessionId()) return '';
  const state = _vaPriorSessionsState;
  if (state.aiSummaryLoading) {
    return `<div class="ds-card" style="margin-top:12px">
      <div class="ds-card__header"><h3 style="margin:0">AI historical summary</h3></div>
      <div class="ds-card__body">
        <p class="va-muted" style="font-size:12px;margin:0">Generating advisory summary from persisted finalized-session comparison data…</p>
      </div>
    </div>`;
  }
  if (state.aiSummaryError) {
    return `<div class="ds-card" style="margin-top:12px">
      <div class="ds-card__header"><h3 style="margin:0">AI historical summary</h3></div>
      <div class="ds-card__body">
        <p class="va-muted" role="alert" style="font-size:12px;margin:0;color:var(--amber)">Historical AI summary is temporarily unavailable. ${esc(state.aiSummaryError)}</p>
      </div>
    </div>`;
  }
  const summary = state.aiSummaryResult;
  if (!summary) return '';
  const observations = Array.isArray(summary.trend_observations) ? summary.trend_observations : [];
  const limitations = Array.isArray(summary.limitations) ? summary.limitations : [];
  const basis = summary.data_basis || {};
  const provenance = summary.provenance || {};
  const statusLabel = _aiSummaryStatusLabel(summary.summary_status);
  const feedbackDraft = state.aiSummaryFeedbackDraft || _emptyAiSummaryFeedbackDraft();
  const feedbackStatus = String(feedbackDraft.feedback_status || '').trim();
  const feedbackNote = String(feedbackDraft.feedback_note || '');
  const feedbackRequired = _feedbackRequiresNote(feedbackStatus);
  const feedbackSaved = state.aiSummaryFeedbackSaved;
  const feedbackPreloaded = state.aiSummaryFeedbackPreloaded;
  const dataBasisLine = [
    `${basis.session_count ?? 0} finalized session(s)`,
    `severity data ${basis.has_severity_data ? 'available' : 'limited'}`,
    `task completion ${basis.has_task_completion_data ? 'available' : 'limited'}`,
    `clip availability ${basis.has_clip_availability_data ? 'available' : 'limited'}`,
  ].join(' · ');
  const provenanceLine = [
    `Generated ${_formatPriorSessionDate(summary.generated_at)}`,
    `Logic ${provenance.summary_logic_version || 'unknown'}`,
    `${provenance.session_count ?? 0} source session(s)`,
    `Sources ${(Array.isArray(provenance.source_session_ids) ? provenance.source_session_ids : []).map(_shortSessionId).join(', ') || 'none'}`,
  ].join(' · ');
  let feedbackStateCopy = '';
  if (feedbackSaved) {
    feedbackStateCopy = `Saved in this view at ${_formatPriorSessionDate(feedbackSaved.updated_at)}. Export includes only this saved feedback snapshot.`;
  } else if (feedbackPreloaded) {
    feedbackStateCopy = 'Loaded saved feedback from backend. Re-save here to include it in export.';
  }
  const feedbackDirtyCopy = state.aiSummaryFeedbackDirty
    ? 'You have unsaved feedback edits. They do not change the persisted session review and will not appear in export until you save them here.'
    : '';
  const feedbackLoading = state.aiSummaryFeedbackLoading
    ? '<p class="va-muted" style="margin:8px 0 0">Loading previously saved feedback for this summary…</p>'
    : '';
  const feedbackError = state.aiSummaryFeedbackError
    ? `<p class="va-muted" role="alert" style="margin:8px 0 0;color:var(--amber)">${esc(state.aiSummaryFeedbackError)}</p>`
    : '';
  return `<div class="ds-card" style="margin-top:12px">
    <div class="ds-card__header"><h3 style="margin:0">AI historical summary</h3></div>
    <div class="ds-card__body" style="font-size:12px;line-height:1.6">
      <p class="va-muted" style="margin-top:0"><strong style="color:var(--text-primary)">Status</strong>: ${esc(statusLabel)}</p>
      <p style="margin-top:0">${esc(summary.summary_text || 'No advisory summary text returned.')}</p>
      <div style="margin-top:12px">
        <strong style="display:block;margin-bottom:6px">Trend observations</strong>
        <ul style="margin:0;padding-left:18px">${observations.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>
      </div>
      <p class="va-muted" style="margin:12px 0 0"><strong style="color:var(--text-primary)">Data basis</strong>: ${esc(dataBasisLine)}</p>
      <!-- Freshness / provenance metadata indicates traceability and state alignment only, not summary correctness. -->
      <p class="va-muted" style="margin:8px 0 0"><strong style="color:var(--text-primary)">Provenance / generation metadata</strong>: ${esc(provenanceLine)}</p>
      <div style="margin-top:12px">
        <strong style="display:block;margin-bottom:6px">Limitations</strong>
        <ul style="margin:0;padding-left:18px">${limitations.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>
      </div>
      <p class="va-muted" style="margin:12px 0 0">Advisory summary generated from persisted finalized-session comparison data. Not a diagnosis or treatment recommendation.</p>
      ${_renderHistoricalAiSummaryFeedbackSection()}
    </div>
  </div>`;
}

/*
 * Prior finalized-session comparison is read-only. It consumes compact,
 * persisted backend summaries only and must never trigger patch/finalize/upload
 * writes from this UI surface.
 */

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
      const ev = VIDEO_TASK_EVIDENCE[t.task_id];
      const gradeBadge = ev
        ? `<span style="margin-left:auto;font-size:10px;padding:1px 6px;border-radius:4px;background:${ev.grade === 'A' ? 'rgba(34,197,94,0.12);color:#16a34a' : ev.grade === 'B' ? 'rgba(59,130,246,0.12);color:#2563eb' : 'rgba(245,158,11,0.12);color:#d97706'}">${esc(ev.grade)}</span>`
        : '';
      return `<button type="button" class="va-side-item ${active}" data-va-task-idx="${i}">${esc(t.task_name)}${review}${flag}${gradeBadge}</button>`;
    })
    .join('');

  return `<div class="va-col va-col-clinician">
    <div class="va-banner va-banner--warn" role="status" style="margin-bottom:12px;padding:10px 12px;border-radius:8px;border:1px solid rgba(246,178,60,.35);background:rgba(246,178,60,.08);font-size:12px">${scopeNote}</div>
    <div class="va-clin-layout">
      <aside class="va-sidebar" aria-label="Tasks">${sidebar}</aside>
      <div class="va-clin-main">
        <h4 style="margin:0 0 8px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">${task ? esc(task.task_name) : ''} ${_renderTaskEvidenceBadge(task?.task_id || '')}</h4>
        <p class="va-muted" style="font-size:12px">${def ? esc(def.clinical_purpose) : ''}</p>
        ${_renderClinicianForm(task)}
        ${_renderPriorSessionsComparison()}
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
  const persisted = _sessionHasServerTruth(session);
  const readOnly = _sessionReadOnly(session);
  return `<div class="ds-card va-summary"><div class="ds-card__header"><h3>Summary</h3></div><div class="ds-card__body">
    <div class="va-summary-grid">
      <div><span class="va-muted">Tasks recorded</span><strong>${s.tasks_completed}</strong></div>
      <div><span class="va-muted">Tasks skipped</span><strong>${s.tasks_skipped}</strong></div>
      <div><span class="va-muted">Safety flags</span><strong>${flags}</strong></div>
      <div><span class="va-muted">Draft completion</span><strong>${s.review_completion_percent}%</strong></div>
    </div>
    ${persisted ? `<p class="va-muted" style="font-size:11px;margin-top:12px">${readOnly ? 'This attached persisted session is finalized. Notes below are read-only server truth.' : 'This attached persisted session saves clinician summary changes to backend truth with conflict checks.'}</p>` : ''}
    <fieldset style="border:0;padding:0;margin:0" ${readOnly ? 'disabled' : ''}>
      <div class="form-group" style="margin-top:12px"><label class="form-label">Clinician impression ${persisted ? '' : '(draft)'}</label>
        <textarea id="va-summary-impression" class="form-control" rows="2" placeholder="Brief overall impression">${esc(session.summary.clinician_impression || '')}</textarea></div>
      <div class="form-group"><label class="form-label">Recommended follow-up</label>
        <textarea id="va-summary-followup" class="form-control" rows="2" placeholder="Optional">${esc(session.summary.recommended_followup || '')}</textarea></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button type="button" class="btn btn-primary" id="va-save-summary">${persisted ? 'Save summary to persisted session' : 'Save draft summary'}</button>
        ${persisted && !readOnly ? '<button type="button" class="btn btn-secondary" id="va-finalize-session">Finalize persisted review</button>' : ''}
      </div>
    </fieldset>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px">
      <button type="button" class="btn btn-secondary" id="va-export-json">${persisted ? 'Download persisted session JSON' : 'Download session draft (JSON)'}</button>
    </div>
    <p class="va-muted" style="font-size:11px;margin-top:10px">${persisted ? 'JSON export reflects the persisted backend session for workflow handoff; it is not a signed clinical report or EHR upload.' : 'JSON export is a local draft for workflow handoff—not a signed report or EHR upload.'}</p>
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
  ensureAgentBrainStatus(el);

  // Mount the shared analyzer AI report strip (decision support).
  // Row key: _vaSession.id — the canonical VideoAssessmentSession.id used by
  // _refreshPersistedSessionTruth, patchVideoAssessmentSession, and
  // finalizeVideoAssessmentSession throughout this file.
  if (!el.querySelector('[data-aar-strip="video_assessment"]')) {
    const _aarHost = document.createElement('div');
    _aarHost.dataset.aarStrip = 'video_assessment';
    el.prepend(_aarHost);
    mountAnalyzerAIReportStrip({
      container: _aarHost,
      analyzerType: 'video_assessment',
      getAnalysisId: () => (_vaSession && _vaSession.id) || '',
      getPatientContext: () => (_vaSession && _vaSession.patient_id) || _vaSelectedPatientId || '',
      label: 'AI Decision Support',
    });
  }

  _wire();
  void _ensurePriorSessionsLoaded();
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

function _setAiSummaryFeedbackDraftField(field, value) {
  _vaPriorSessionsState = {
    ..._vaPriorSessionsState,
    aiSummaryFeedbackDraft: {
      ...(_vaPriorSessionsState.aiSummaryFeedbackDraft || _emptyAiSummaryFeedbackDraft()),
      [field]: value,
    },
    aiSummaryFeedbackDirty: true,
    aiSummaryFeedbackError: null,
  };
  _render();
}

async function _saveHistoricalAiSummaryFeedback() {
  const role = currentUser?.role || '';
  const sessionId = _currentPriorComparisonSessionId();
  const summaryEventId = _vaPriorSessionsState.aiSummaryResult?.provenance?.event_id || '';
  if (!_canReviewPriorSessions(role) || !sessionId || !summaryEventId) return;
  const draft = _vaPriorSessionsState.aiSummaryFeedbackDraft || _emptyAiSummaryFeedbackDraft();
  const feedbackStatus = String(draft.feedback_status || '').trim();
  const feedbackNote = String(draft.feedback_note || '').trim();
  if (!feedbackStatus) {
    _vaPriorSessionsState = {
      ..._vaPriorSessionsState,
      aiSummaryFeedbackError: 'Select a feedback status before saving.',
    };
    _render();
    return;
  }
  if (_feedbackRequiresNote(feedbackStatus) && !feedbackNote) {
    _vaPriorSessionsState = {
      ..._vaPriorSessionsState,
      aiSummaryFeedbackError: 'Please add a short rationale when marking this advisory summary as disagreed or not useful.',
    };
    _render();
    return;
  }
  _vaPriorSessionsState = {
    ..._vaPriorSessionsState,
    aiSummaryFeedbackSaving: true,
    aiSummaryFeedbackError: null,
  };
  _render();
  try {
    const saved = await api.saveVideoAssessmentHistoricalAiSummaryFeedback(sessionId, {
      summary_event_id: summaryEventId,
      feedback_status: feedbackStatus,
      feedback_note: feedbackNote,
    });
    if (
      _currentPriorComparisonSessionId() !== sessionId ||
      _vaPriorSessionsState.aiSummaryResult?.provenance?.event_id !== summaryEventId
    ) {
      return;
    }
    const normalizedSaved = {
      ...saved,
      feedback_status: saved?.feedback_status || feedbackStatus,
      feedback_note: saved?.feedback_note ?? feedbackNote,
    };
    _vaPriorSessionsState = {
      ..._vaPriorSessionsState,
      aiSummaryFeedbackSaving: false,
      aiSummaryFeedbackError: null,
      aiSummaryFeedbackDraft: {
        feedback_status: normalizedSaved.feedback_status,
        feedback_note: normalizedSaved.feedback_note || '',
      },
      aiSummaryFeedbackPreloaded: normalizedSaved,
      aiSummaryFeedbackSaved: normalizedSaved,
      aiSummaryFeedbackDirty: false,
    };
    showToast('Advisory-summary feedback saved.');
  } catch (e) {
    if (
      _currentPriorComparisonSessionId() !== sessionId ||
      _vaPriorSessionsState.aiSummaryResult?.provenance?.event_id !== summaryEventId
    ) {
      return;
    }
    _vaPriorSessionsState = {
      ..._vaPriorSessionsState,
      aiSummaryFeedbackSaving: false,
      aiSummaryFeedbackError:
        e?.code === 'feedback_note_required'
          ? 'Please add a short rationale when marking this advisory summary as disagreed or not useful.'
          : (e?.message || 'Could not save historical-summary feedback.'),
    };
  }
  _render();
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
  document.getElementById('va-link-assessments')?.addEventListener('click', () => navWithPatient('assessments-v2'));
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
    void _ensureSelectedClinicianTaskVideoLoaded();
  });

  document.querySelectorAll('[data-va-prior-select]').forEach((btn) => {
    const toggleSelection = () => {
      const sessionId = btn.getAttribute('data-va-prior-select') || '';
      if (!sessionId) return;
      _togglePriorSessionSelection(sessionId);
    };
    btn.addEventListener('click', toggleSelection);
    btn.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      toggleSelection();
    });
  });

  document.getElementById('va-export-history')?.addEventListener('click', () => {
    _exportHistoricalComparisonReport();
  });
  document.getElementById('va-generate-history-ai')?.addEventListener('click', () => {
    void _generateHistoricalAiSummary();
  });
  document.getElementById('va-history-feedback-status')?.addEventListener('change', (ev) => {
    _vaPriorSessionsState = {
      ..._vaPriorSessionsState,
      aiSummaryFeedbackStatus: ev.target?.value || '',
      aiSummaryFeedbackError: null,
    };
  });
  document.getElementById('va-history-feedback-note')?.addEventListener('input', (ev) => {
    _vaPriorSessionsState = {
      ..._vaPriorSessionsState,
      aiSummaryFeedbackNote: ev.target?.value || '',
      aiSummaryFeedbackError: null,
    };
  });
  document.getElementById('va-save-history-feedback')?.addEventListener('click', () => {
    void _saveHistoricalAiSummaryFeedback();
  });

  document.querySelectorAll('[data-va-prior-select]').forEach((btn) => {
    const toggleSelection = () => {
      const sessionId = btn.getAttribute('data-va-prior-select') || '';
      if (!sessionId) return;
      _togglePriorSessionSelection(sessionId);
    };
    btn.addEventListener('click', toggleSelection);
    btn.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      toggleSelection();
    });
  });

  document.getElementById('va-export-history')?.addEventListener('click', () => {
    _exportHistoricalComparisonReport();
  });
  document.getElementById('va-generate-history-ai')?.addEventListener('click', () => {
    void _generateHistoricalAiSummary();
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

  document.getElementById('va-skip-task')?.addEventListener('click', () => void _skipCurrent('patient_pref'));
  document.getElementById('va-unsafe-task')?.addEventListener('click', () => void _skipCurrent('unsafe'));

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
    const session = _ensureSession();
    const task = _currentTask();
    if (!task) return;
    const lastTask = _vaTaskIndex >= ((session.tasks?.length || 1) - 1);
    if (_sessionHasServerTruth(session)) {
      const blob = _taskLocalBlob(task.task_id);
      if (!blob) {
        showToast('Accepted clip is no longer available in browser memory. Record or upload the clip again.', 'warning');
        return;
      }
      try {
        const uploaded = await api.uploadVideoAssessmentTaskVideo(
          session.id,
          task.task_id,
          blob,
          {
            expectedRevision: _sessionRevisionToken(session),
            filename: `${task.task_id}.${blob.type === 'video/mp4' ? 'mp4' : blob.type === 'video/quicktime' ? 'mov' : 'webm'}`,
          },
        );
        if (uploaded?.session) _replaceSession(uploaded.session);
        _setTaskBlob(task.task_id, null);
        showToast('Clip uploaded to persisted session.');
        if (lastTask) {
          const completed = await _patchPersistedSession(
            {
              overall_status: 'completed',
              completed_at: new Date().toISOString(),
            },
            null,
          );
          if (!completed) return;
        }
      } catch (error) {
        await _recoverPersistedSessionConflict(session.id, error);
        _render();
        return;
      }
      _advanceTask(false);
      return;
    }
    task.recording_status = 'accepted';
    task.unsafe_flag = false;
    _advanceTask();
  });

  document.getElementById('va-rerecord')?.addEventListener('click', () => {
    _vaPatientPhase = 'task_intro';
    _cleanupPreviewUrl();
    _render();
  });

  document.getElementById('va-skip-post')?.addEventListener('click', () => void _skipCurrent('patient_pref'));

  document.querySelectorAll('[data-va-task-idx]').forEach((btn) => {
    btn.addEventListener('click', () => {
      _vaSelectedClinicianTask = parseInt(btn.getAttribute('data-va-task-idx'), 10);
      _render();
      void _ensureSelectedClinicianTaskVideoLoaded();
    });
  });

  document.getElementById('va-load-stored-video')?.addEventListener('click', () => {
    void _ensureSelectedClinicianTaskVideoLoaded();
  });

  document.getElementById('va-save-draft')?.addEventListener('click', async () => {
    const session = _ensureSession();
    const task = session.tasks[_vaSelectedClinicianTask];
    if (!task) return;
    const reviewBody = _collectReviewFromDom(task);
    if (!reviewBody) return;
    const nextReview = {
      ...reviewBody,
      reviewer_id: currentUser?.email || currentUser?.display_name || currentUser?.role || 'clinician',
      reviewed_at: null,
    };
    if (_sessionHasServerTruth(session)) {
      await _patchPersistedSession(
        {
          tasks: [{ task_id: task.task_id, clinician_review: nextReview }],
        },
        'Draft saved to persisted session.',
      );
      return;
    }
    task.clinician_review = nextReview;
    _persistSession();
    showToast('Local notes saved');
    _applySummary();
    _render();
  });

  document.getElementById('va-mark-reviewed')?.addEventListener('click', async () => {
    const session = _ensureSession();
    const task = session.tasks[_vaSelectedClinicianTask];
    if (!task) return;
    const body = _collectReviewFromDom(task);
    if (!body) return;
    const nextReview = {
      ...body,
      reviewer_id: currentUser?.email || currentUser?.display_name || currentUser?.role || 'clinician',
      reviewed_at: new Date().toISOString(),
    };
    if (_sessionHasServerTruth(session)) {
      await _patchPersistedSession(
        {
          tasks: [{ task_id: task.task_id, clinician_review: nextReview }],
        },
        'Marked reviewed in persisted session.',
      );
      return;
    }
    task.clinician_review = {
      ...nextReview,
    };
    _persistSession();
    showToast('Local draft marked complete');
    _applySummary();
    _render();
  });

  document.getElementById('va-save-summary')?.addEventListener('click', async () => {
    const session = _ensureSession();
    const clinicianImpression = document.getElementById('va-summary-impression')?.value || '';
    const recommendedFollowup = document.getElementById('va-summary-followup')?.value || '';
    if (_sessionHasServerTruth(session)) {
      await _patchPersistedSession(
        {
          summary: {
            clinician_impression: clinicianImpression,
            recommended_followup: recommendedFollowup,
          },
        },
        'Summary saved to persisted session.',
      );
      return;
    }
    session.summary.clinician_impression = clinicianImpression;
    session.summary.recommended_followup = recommendedFollowup;
    _persistSession();
    showToast('Local summary saved');
    _render();
  });

  document.getElementById('va-export-json')?.addEventListener('click', async () => {
    const session = _ensureSession();
    if (_sessionHasServerTruth(session)) {
      try {
        const payload = await api.exportVideoAssessmentSessionJson(session.id);
        _downloadSessionJsonPayload(payload, `video-assessment-session-${session.id || 'session'}.json`);
        showToast('Persisted session JSON downloaded — review before sharing.');
      } catch (error) {
        showToast(error?.message || 'Could not export the persisted session JSON.', 'error');
      }
      return;
    }
    session.summary.clinician_impression = document.getElementById('va-summary-impression')?.value || '';
    session.summary.recommended_followup = document.getElementById('va-summary-followup')?.value || '';
    const payload = {
      exported_at: new Date().toISOString(),
      export_kind: 'video_assessment_session_draft',
      disclaimer: DISCLAIMER,
      persistence_note: _sessionPersistLabel(),
      session_json: session,
      blob_urls_not_included: true,
    };
    _downloadSessionJsonPayload(payload, `video-assessment-draft-${session.id || 'session'}.json`);
    showToast('Draft JSON downloaded — review before sharing.');
  });

  document.getElementById('va-finalize-session')?.addEventListener('click', async () => {
    const session = _ensureSession();
    if (!_sessionHasServerTruth(session)) return;
    await _finalizePersistedSession('Persisted session finalized.');
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
      _setTaskBlob(task.task_id, blob);
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
  const session = _ensureSession();
  const nextStatus = reason === 'unsafe' ? 'unsafe_skipped' : 'skipped';
  const persisted = _sessionHasServerTruth(session);
  const lastTask = _vaTaskIndex >= ((session.tasks?.length || 1) - 1);
  if (persisted) {
    const saved = await _patchPersistedTaskState(
      task.task_id,
      {
        recording_status: nextStatus,
        skip_reason: reason,
        unsafe_flag: reason === 'unsafe',
      },
      null,
    );
    if (!saved) return;
    if (lastTask) {
      const completed = await _patchPersistedSession(
        {
          overall_status: 'completed',
          completed_at: new Date().toISOString(),
        },
        null,
      );
      if (!completed) return;
    }
  }
  if (!persisted) {
    task.recording_status = nextStatus;
    task.skip_reason = reason;
    task.unsafe_flag = reason === 'unsafe';
    if (reason === 'unsafe') {
      session.safety_flags = [...new Set([...(session.safety_flags || []), task.task_id])];
    }
  } else {
    _setTaskBlob(task.task_id, null);
    _setTaskBlobUrl(task.task_id, null);
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
  if (_sessionHasServerTruth(session)) {
    if (_vaTaskIndex < session.tasks.length - 1) {
      _vaTaskIndex++;
      _vaPatientPhase = 'task_intro';
    } else {
      _vaTaskIndex = session.tasks.length;
      _vaPatientPhase = 'setup';
      showToast(fromSkip ? 'Last task handled—session complete.' : 'Session complete.');
    }
    _applySummary();
    _render();
    return;
  }
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
  _resetPriorSessionsState();

  _vaSession = null;
  const persisted = _loadPersistedSession();
  if (persisted) {
    if (persisted.session_id && !persisted.tasks) {
      const pid =
        persisted.selected_patient_id ||
        _vaSelectedPatientId ||
        (_demoTokenWorkspace() ? 'demo-workspace' : 'not-selected');
      _vaSession = createEmptySession({
        id: persisted.session_id,
        patient_id: pid,
      });
    } else {
      _vaSession = persisted;
    }
    if (_vaSelectedPatientId) _vaSession.patient_id = _vaSelectedPatientId;
    else if (!_vaSession.patient_id || _vaSession.patient_id === 'demo-patient') {
      _vaSession.patient_id = _demoTokenWorkspace() ? 'demo-workspace' : 'not-selected';
    }
    _applySummary();
  } else {
    const pid =
      _vaSelectedPatientId || (_demoTokenWorkspace() ? 'demo-workspace' : 'not-selected');
    _vaSession = createEmptySession({ patient_id: pid });
  }

  if (_isPersistedSessionId(_vaSession?.id || '')) {
    try {
      await _refreshPersistedSessionTruth(_vaSession.id, { renderAfter: false });
    } catch (e) {
      showToast('Could not reload persisted session from backend. Using the local mirror until refresh succeeds.', 'warning');
    }
  }

  _vaUiMode = 'patient';
  _vaPatientPhase = 'setup';
  _vaTaskIndex = 0;
  _vaSetupConfirmed = false;
  _vaSelectedClinicianTask = 0;
  _clearLocalVideoState();
  _clearRemoteVideoState();
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
  _clearRemoteVideoState();
  _stopMedia();
  _cleanupPreviewUrl();

  if (!_vaKeysBound && typeof document !== 'undefined') {
    _vaKeysBound = true;
    document.addEventListener('keydown', (e) => {
      const tag = (e.target?.tagName || '').toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable;

      // Global shortcuts (not when typing in a field)
      if (!isTyping) {
        if (e.key === '?' || (e.shiftKey && e.key === '/')) {
          e.preventDefault();
          _vaKeyboardHelpVisible = !_vaKeyboardHelpVisible;
          _render();
          return;
        }
        if (e.key === 'f' || e.key === 'F') {
          e.preventDefault();
          if (!document.fullscreenElement) { document.documentElement.requestFullscreen().catch(() => {}); }
          else { document.exitFullscreen().catch(() => {}); }
          return;
        }
        if (e.key === 'c' || e.key === 'C') {
          e.preventDefault();
          _vaComparisonView = !_vaComparisonView;
          _render();
          return;
        }
        if (e.key === 's' || e.key === 'S') {
          e.preventDefault();
          _vaSkeletonOverlay = !_vaSkeletonOverlay;
          _render();
          return;
        }
        if (e.key === 'e' || e.key === 'E') {
          e.preventDefault();
          _vaEvidencePanel = !_vaEvidencePanel;
          _render();
          return;
        }
        if (e.key === 'a' || e.key === 'A') {
          e.preventDefault();
          const video = document.querySelector('video');
          const time = video ? Math.round(video.currentTime * 10) / 10 : 0;
          const noteField = document.querySelector('[data-va-field="free_text_comment"]');
          if (noteField) {
            noteField.focus();
            const prefix = time ? '[' + time + 's] ' : '';
            if (!noteField.value.includes(prefix)) noteField.value = prefix + noteField.value;
          }
          return;
        }
        if (e.key === ' ' || e.code === 'Space') {
          e.preventDefault();
          const video = document.querySelector('video');
          if (video) {
            if (video.paused) { video.play(); _applyPlaybackSpeed(video); }
            else video.pause();
          }
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          const idx = VA_SPEEDS.indexOf(_vaPlaybackSpeed);
          _vaPlaybackSpeed = idx < VA_SPEEDS.length - 1 ? VA_SPEEDS[idx + 1] : 2;
          document.querySelectorAll('video').forEach(_applyPlaybackSpeed);
          _render();
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          const idx = VA_SPEEDS.indexOf(_vaPlaybackSpeed);
          _vaPlaybackSpeed = idx > 0 ? VA_SPEEDS[idx - 1] : 0.25;
          document.querySelectorAll('video').forEach(_applyPlaybackSpeed);
          _render();
          return;
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          const video = document.querySelector('video');
          if (video) video.currentTime = Math.max(0, video.currentTime + (e.shiftKey ? -1 : -5));
          return;
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          const video = document.querySelector('video');
          if (video) video.currentTime = Math.min(video.duration || Infinity, video.currentTime + (e.shiftKey ? 1 : 5));
          return;
        }
      }

    });
  }
