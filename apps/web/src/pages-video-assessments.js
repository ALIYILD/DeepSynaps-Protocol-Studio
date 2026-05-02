// ─────────────────────────────────────────────────────────────────────────────
// pages-video-assessments.js — Video Assessments for Virtual Care (MVP UI)
// Guided camera tasks + clinician structured review. Not autonomous diagnosis.
// ─────────────────────────────────────────────────────────────────────────────
import {
  VIDEO_ASSESSMENT_PROTOCOL,
  VIDEO_ASSESSMENT_TASKS,
  createEmptySession,
  mergeServerDocument,
  summarizeSession,
} from './video-assessment-protocol.js';
import { analyzeVideoBlobMotion, MOTION_ENGINE_ID } from './video-assessment-motion.js';
import { api, downloadBlob, getToken } from './api.js';
import { currentUser } from './auth.js';
import { showToast } from './helpers.js';

const DISCLAIMER =
  'Video Assessments support clinician review and authorized research when used under local policy and informed consent. Outputs are observational and require clinical judgment — not a standalone diagnosis, emergency triage system, or validated rating scale.';

const EMERGENCY_BOX =
  'Medical emergency? Call your local emergency number (e.g. 911) or seek urgent care. This tool does not monitor you in real time and cannot dispatch help.';

function esc(v) {
  if (v == null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _isDemoMode() {
  try {
    return !!(import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === '1');
  } catch (_) {
    return false;
  }
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
var _vaRecordingDeadline = null;
var _vaCountdownTimer = null;
var _vaRecordingTimer = null;
/** While true, show 3-2-1 in recording UI before MediaRecorder runs */
var _vaRecordingCountdownActive = false;
var _vaSelectedClinicianTask = 0;
var _vaKeysBound = false;
/** @type {Blob|null} last recorded clip before object URL */
var _vaLastRecordedBlob = null;
var _vaApiBootstrapDone = false;
var _vaApiBanner = '';
/** @type {string|null} object URL for clinician panel streamed clip */
var _vaClinicianStreamUrl = null;
/** @type {'both'|'capture'|'review'} */
var _vaPageLayout = 'both';
/** @type {Array<{id:string,patient_id?:string,overall_status?:string,review_completion_percent?:number}>} */
var _vaSessionListItems = [];
/** Evidence intelligence (indexed corpus) — last fetch for current session */
var _vaEvidenceLoading = false;
var _vaEvidenceError = '';
/** @type {object|null} */
var _vaEvidenceResult = null;
var _vaEvidenceFetchedForId = '';
var _vaMotionRunId = 0;
var _vaMotionLoading = false;

function _effectivePatientIdForEvidence(session) {
  const s = session || _ensureSession();
  const pid = s && s.patient_id;
  if (pid && String(pid) !== 'local') return String(pid);
  if (currentUser?.patient_id) return String(currentUser.patient_id);
  if (currentUser?.id) return String(currentUser.id);
  return 'unknown';
}

function _buildVideoAssessmentFeatureSummary(session) {
  const out = [];
  const imp = session.summary && session.summary.clinician_impression;
  if (imp && String(imp).trim()) {
    out.push({
      name: 'clinician_impression',
      value: String(imp).trim().slice(0, 600),
      modality: 'video_assessment',
    });
  }
  for (const t of session.tasks || []) {
    const tr = t.clinician_review;
    if (!tr) continue;
    const parts = [];
    if (tr.task_completed) parts.push(`task_completed:${tr.task_completed}`);
    if (tr.video_quality) parts.push(`video_quality:${tr.video_quality}`);
    if (tr.patient_compliance) parts.push(`compliance:${tr.patient_compliance}`);
    const am = t.ai_automated_metrics;
    if (am && !am.status && am.motion_activity_score_0_100 != null) {
      parts.push(`motion_activity:${am.motion_activity_score_0_100}`);
    }
    const ss = tr.structured_scores && typeof tr.structured_scores === 'object' ? tr.structured_scores : {};
    for (const [k, v] of Object.entries(ss)) {
      if (v != null && String(v).trim()) parts.push(`${k}:${String(v).trim()}`);
    }
    if (tr.comment && String(tr.comment).trim()) parts.push(`comment:${String(tr.comment).trim().slice(0, 200)}`);
    if (parts.length) {
      out.push({
        name: `task:${t.task_id}`,
        value: parts.join('; ').slice(0, 500),
        modality: 'video_assessment',
      });
    }
  }
  return out.slice(0, 32);
}

function _renderEvidenceBlock() {
  const show =
    (_isClinicianUser() || currentUser?.role === 'admin') && getToken() && _vaSession && !String(_vaSession.id || '').startsWith('vas_');
  if (!show) return '';

  if (_vaEvidenceLoading) {
    return `<div class="va-evidence-block" role="region" aria-label="Evidence"><p class="va-muted" style="font-size:12px">Searching literature index\u2026</p></div>`;
  }
  if (_vaEvidenceError) {
    return `<div class="va-evidence-block" role="region" aria-label="Evidence"><p class="va-muted" style="font-size:12px;color:var(--danger,#c44)">${esc(_vaEvidenceError)}</p><button type="button" class="btn btn-sm btn-secondary" id="va-evidence-retry">Retry</button></div>`;
  }
  if (!_vaEvidenceResult) {
    return `<div class="va-evidence-block" role="region" aria-label="Evidence">
      <p class="va-muted" style="font-size:12px;line-height:1.5;margin-bottom:10px">
        Pull related publications from the DeepSynaps evidence index (PubMed/OpenAlex pipeline). Uses your structured reviews and impression as retrieval context — complementary to clinical judgment.
      </p>
      <button type="button" class="btn btn-sm btn-secondary" id="va-load-evidence">Load related citations</button>
    </div>`;
  }

  const r = _vaEvidenceResult;
  const papers = Array.isArray(r.supporting_papers) ? r.supporting_papers : [];
  const citeLines = papers
    .slice(0, 8)
    .map((p) => {
      const title = esc(p.title || 'Untitled');
      const metaParts = [];
      if (p.journal) metaParts.push(esc(p.journal));
      if (p.year != null) metaParts.push(String(p.year));
      const metaTxt = metaParts.join(' · ');
      const url = p.url || (p.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(String(p.pmid))}/` : '');
      const link = url
        ? ` · <a href="${esc(url)}" target="_blank" rel="noopener noreferrer">View source</a>`
        : '';
      return `<li class="va-evidence-li"><div class="va-evidence-title">${title}</div><div class="va-evidence-meta">${metaTxt}${link}</div></li>`;
    })
    .join('');

  const summary = r.literature_summary ? `<p class="va-evidence-summary">${esc(r.literature_summary)}</p>` : '';
  const caution = r.recommended_caution
    ? `<p class="va-muted" style="font-size:11px;margin-top:8px">${esc(r.recommended_caution)}</p>`
    : '';

  return `<div class="va-evidence-block" role="region" aria-label="Evidence">
    ${summary}
    <ul class="va-evidence-list">${citeLines || '<li class="va-muted">No ranked papers returned — try again after adding review fields.</li>'}</ul>
    ${caution}
    <button type="button" class="btn btn-sm btn-secondary" id="va-evidence-refresh" style="margin-top:10px">Refresh citations</button>
  </div>`;
}

function _sessionNeedsConsent(session) {
  if (!session) return true;
  const c = session.patient_consent || {};
  return !c.recording_consent || !c.research_use_acknowledged;
}

function _renderConsentGate() {
  if (!_isPatientUser() || !getToken()) return '';
  const s = _ensureSession();
  if (!_sessionNeedsConsent(s)) return '';
  return `<div class="ds-card va-consent-card" role="region" aria-label="Consent">
    <div class="ds-card__header"><h3>Recording &amp; research acknowledgement</h3></div>
    <div class="ds-card__body">
      <p class="va-muted" style="margin-bottom:12px;line-height:1.55">
        Your clinician or study team remains responsible for care and protocol oversight. Video clips are sensitive health information —
        storage and use follow your institution’s policies and any study consent you signed separately.
      </p>
      <label class="va-checkbox"><input type="checkbox" id="va-consent-record"/> I consent to recording video/audio for this assessment session as explained by my care team.</label>
      <label class="va-checkbox"><input type="checkbox" id="va-consent-research"/> I understand recordings may be used for clinician review and, where my study or clinic authorizes it, for research quality improvement — not as an automated diagnosis.</label>
      <div style="margin-top:14px">
        <button type="button" class="btn btn-primary" id="va-consent-save">Continue</button>
      </div>
    </div>
  </div>`;
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
    if (_vaSession && _isDemoMode()) {
      sessionStorage.setItem('ds_video_assessment_session', JSON.stringify(_vaSession));
    }
  } catch (_) {}
}

function _loadPersistedSession() {
  try {
    const raw = sessionStorage.getItem('ds_video_assessment_session');
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return null;
}

function _applySummary() {
  if (!_vaSession) return;
  const sum = summarizeSession(_vaSession);
  _vaSession.summary = {
    ..._vaSession.summary,
    tasks_completed: sum.tasks_completed,
    tasks_skipped: sum.tasks_skipped,
    tasks_needing_repeat: sum.tasks_needing_repeat,
    review_completion_percent: sum.review_completion_percent,
  };
  _vaSession.safety_flags = sum.safety_task_ids || [];
}

function _isPatientUser() {
  return currentUser && (currentUser.role === 'patient' || currentUser.role === 'admin');
}

function _isClinicianUser() {
  return currentUser && ['clinician', 'admin', 'reviewer', 'supervisor'].includes(String(currentUser.role));
}

function _apiSessionKey() {
  return 'ds_video_assessment_api_id';
}

async function _patchSessionToApi(tasksPatch) {
  if (!_vaSession || !_vaSession.id || String(_vaSession.id).startsWith('vas_')) return;
  if (String(_vaSession.overall_status || '') === 'finalized') return;
  try {
    const body = { tasks: tasksPatch };
    const doc = await api.videoAssessmentPatchSession(_vaSession.id, body);
    _vaSession = mergeServerDocument(doc);
    _applySummary();
  } catch (e) {
    showToast('Could not save to server: ' + (e && e.message));
  }
}

/** After local blob changes, push task row to API (best-effort). */
function _queueSyncTask(task) {
  if (!task) return;
  const t = {
    task_id: task.task_id,
    recording_status: task.recording_status,
    skip_reason: task.skip_reason,
    unsafe_flag: task.unsafe_flag,
    recording_asset_id: task.recording_asset_id,
    recording_storage_ref: task.recording_storage_ref,
    clinician_review: task.clinician_review,
    ai_analysis_status: task.ai_analysis_status,
    ai_automated_metrics: task.ai_automated_metrics,
  };
  _patchSessionToApi([t]);
}

function _updateFutureAiAggregatePlaceholder() {
  const s = _ensureSession();
  const tasks = s.tasks || [];
  const ok = tasks.filter((x) => x.ai_automated_metrics && !x.ai_automated_metrics.status);
  const scores = ok
    .map((x) => x.ai_automated_metrics.motion_activity_score_0_100)
    .filter((n) => n != null && Number.isFinite(Number(n)));
  const meanAct =
    scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + Number(b), 0) / scores.length)
      : null;
  const prev = s.future_ai_metrics_placeholder || {};
  s.future_ai_metrics_placeholder = {
    pose_metrics: prev.pose_metrics ?? null,
    movement_counts: ok.length
      ? {
          tasks_with_motion_proxy: ok.length,
          engine: MOTION_ENGINE_ID,
        }
      : prev.movement_counts ?? null,
    speed_metrics:
      meanAct != null
        ? {
            motion_activity_score_mean_0_100: meanAct,
            sample_tasks: scores.length,
            engine: MOTION_ENGINE_ID,
            note: 'Heuristic mean of per-clip motion-activity scores (frame differencing).',
          }
        : prev.speed_metrics ?? null,
    amplitude_metrics: prev.amplitude_metrics ?? null,
    symmetry_metrics: prev.symmetry_metrics ?? null,
    longitudinal_comparison: prev.longitudinal_comparison ?? null,
  };
}

async function _patchFutureAiToApi() {
  if (!_vaSession || !_vaSession.id || String(_vaSession.id).startsWith('vas_')) return;
  if (String(_vaSession.overall_status || '') === 'finalized') return;
  try {
    const doc = await api.videoAssessmentPatchSession(_vaSession.id, {
      future_ai_metrics_placeholder: _vaSession.future_ai_metrics_placeholder,
    });
    _vaSession = mergeServerDocument(doc);
  } catch (e) {
    showToast('Could not save motion summary: ' + (e && e.message));
  }
}

async function _runMotionForTask(task, blob) {
  if (!task || !blob) return;
  const run = ++_vaMotionRunId;
  task.ai_analysis_status = 'running';
  _vaMotionLoading = true;
  _render();
  try {
    const metrics = await analyzeVideoBlobMotion(blob, { task_id: task.task_id });
    if (run !== _vaMotionRunId) return;
    task.ai_automated_metrics = metrics;
    task.ai_analysis_status = metrics.status === 'failed' ? 'failed' : 'complete';
    _updateFutureAiAggregatePlaceholder();
    if (_vaSession && _vaSession.id && !String(_vaSession.id).startsWith('vas_') && getToken()) {
      await _patchSessionToApi([
        {
          task_id: task.task_id,
          ai_analysis_status: task.ai_analysis_status,
          ai_automated_metrics: task.ai_automated_metrics,
        },
      ]);
      await _patchFutureAiToApi();
    } else {
      _persistSession();
    }
  } catch (e) {
    if (run !== _vaMotionRunId) return;
    task.ai_automated_metrics = {
      engine: MOTION_ENGINE_ID,
      status: 'failed',
      error_code: 'exception',
      error_message: (e && e.message) || 'Motion analysis error',
    };
    task.ai_analysis_status = 'failed';
    if (_vaSession && _vaSession.id && !String(_vaSession.id).startsWith('vas_') && getToken()) {
      await _patchSessionToApi([
        {
          task_id: task.task_id,
          ai_analysis_status: 'failed',
          ai_automated_metrics: task.ai_automated_metrics,
        },
      ]);
    }
  } finally {
    if (run === _vaMotionRunId) {
      _vaMotionLoading = false;
      _render();
    }
  }
}

async function _bootstrapApiSession() {
  if (_vaApiBootstrapDone) return;
  _vaApiBootstrapDone = true;
  if (_isDemoMode() && !getToken()) {
    _vaApiBanner = 'Demo: sign in as a patient to sync sessions to the API.';
    return;
  }
  if (!getToken()) {
    _vaApiBanner = 'Sign in to save this assessment to the server.';
    return;
  }
  if (_isPatientUser()) {
    let sid = null;
    try {
      sid = sessionStorage.getItem(_apiSessionKey());
    } catch (_) {}
    if (sid) {
      try {
        const doc = await api.videoAssessmentGetSession(sid);
        _vaSession = mergeServerDocument(doc);
        _applySummary();
        _vaApiBanner = _sessionNeedsConsent(_vaSession)
          ? 'Confirm recording & research acknowledgement below to continue.'
          : 'Resumed your session from this browser.';
        return;
      } catch (_) {
        try {
          sessionStorage.removeItem(_apiSessionKey());
        } catch (_e) {}
      }
    }
    _vaSession = createEmptySession();
    _applySummary();
    _vaApiBanner =
      'Confirm recording & research acknowledgement below. Your session is created on the server only after you continue.';
    return;
  }
  if (_isClinicianUser()) {
    let sid = null;
    try {
      sid = sessionStorage.getItem(_apiSessionKey());
    } catch (_) {}
    try {
      const list = await api.videoAssessmentListSessions({});
      _vaSessionListItems = list.items || [];
      let pick =
        sid && _vaSessionListItems.some((i) => i.id === sid)
          ? sid
          : _vaSessionListItems[0] && _vaSessionListItems[0].id;
      if (pick) {
        const doc = await api.videoAssessmentGetSession(pick);
        _vaSession = mergeServerDocument(doc);
        _applySummary();
        try {
          sessionStorage.setItem(_apiSessionKey(), pick);
        } catch (_) {}
        _vaApiBanner =
          'Loaded session ' +
          String(pick).slice(0, 8) +
          '… (' +
          _vaSessionListItems.length +
          ' session(s) in your clinic). Use the dropdown to switch.';
      } else {
        _vaApiBanner = 'No video assessment sessions found for your clinic yet.';
        if (!_vaSession) _vaSession = createEmptySession();
      }
    } catch (e) {
      _vaApiBanner = 'Could not list sessions: ' + (e && e.message);
      if (_vaSessionListItems.length === 0 && sid) {
        try {
          const doc = await api.videoAssessmentGetSession(sid);
          _vaSession = mergeServerDocument(doc);
          _applySummary();
        } catch (_e2) {
          if (!_vaSession) _vaSession = createEmptySession();
        }
      } else if (!_vaSession) _vaSession = createEmptySession();
    }
  } else {
    if (!_vaSession) _vaSession = createEmptySession();
  }
}

async function _refreshSessionListAndMaybeLoad(idToLoad) {
  if (!_isClinicianUser() || !getToken()) return;
  try {
    const list = await api.videoAssessmentListSessions({});
    _vaSessionListItems = list.items || [];
    const pick =
      idToLoad ||
      (_vaSession && _vaSession.id) ||
      (_vaSessionListItems[0] && _vaSessionListItems[0].id);
    if (pick) {
      const doc = await api.videoAssessmentGetSession(pick);
      _vaSession = mergeServerDocument(doc);
      try {
        sessionStorage.setItem(_apiSessionKey(), pick);
      } catch (_) {}
      _applySummary();
    }
    _render();
  } catch (e) {
    showToast('Could not refresh: ' + (e && e.message));
  }
}

function _ensureSession() {
  if (!_vaSession) {
    const persisted = _loadPersistedSession();
    _vaSession = persisted || createEmptySession({ patient_id: _isDemoMode() ? 'demo-patient' : 'local' });
    _applySummary();
  }
  return _vaSession;
}

function _mimeForRecorder() {
  if (typeof MediaRecorder !== 'undefined') {
    if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) return 'video/webm;codecs=vp9';
    if (MediaRecorder.isTypeSupported('video/webm')) return 'video/webm';
  }
  return 'video/webm';
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
    _vaLastRecordedBlob = blob;
    _cleanupPreviewUrl();
    _vaPreviewUrl = URL.createObjectURL(blob);
    _setTaskBlobUrl(task.task_id, _vaPreviewUrl);
    task.recording_asset_id = null;
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
  if (_vaPageLayout === 'capture') {
    return `<p class="va-layout-hint">Patient capture — <button type="button" class="btn btn-sm btn-secondary" id="va-goto-review">Open clinician review instead</button></p>`;
  }
  if (_vaPageLayout === 'review') {
    return `<p class="va-layout-hint">Clinician review — <button type="button" class="btn btn-sm btn-secondary" id="va-goto-capture">Open patient capture instead</button></p>`;
  }
  const patientActive = _vaUiMode === 'patient';
  return `<div class="va-mode-toggle" role="tablist" aria-label="Assessment mode">
    <button type="button" role="tab" class="btn ${patientActive ? 'btn-primary' : 'btn-secondary'}" aria-selected="${patientActive}" id="va-mode-patient">Patient Capture Mode</button>
    <button type="button" role="tab" class="btn ${!patientActive ? 'btn-primary' : 'btn-secondary'}" aria-selected="${!patientActive}" id="va-mode-clinician">Clinician Review Mode</button>
  </div>`;
}

function _renderClinicianSessionPicker() {
  if (!_isClinicianUser() || !getToken()) return '';
  const cur = _vaSession && _vaSession.id ? _vaSession.id : '';
  const opts = _vaSessionListItems
    .map((it) => {
      const label =
        String(it.id).slice(0, 8) +
        '… · ' +
        String(it.overall_status || '') +
        (it.review_completion_percent != null ? ' · ' + it.review_completion_percent + '% reviewed' : '');
      return `<option value="${esc(it.id)}" ${it.id === cur ? 'selected' : ''}>${esc(label)}</option>`;
    })
    .join('');
  return `<div class="va-session-picker">
    <label class="form-label" for="va-session-select">Session</label>
    <select id="va-session-select" class="form-control">${opts || '<option value="">No sessions</option>'}</select>
    <button type="button" class="btn btn-sm btn-secondary" id="va-session-refresh">Refresh list</button>
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
  return `<div class="ds-card"><div class="ds-card__header"><h3>Before you start</h3></div><div class="ds-card__body">
    <ul class="va-checklist">
      <li>Clear enough floor space to stand and take a few steps safely.</li>
      <li>Use a sturdy chair with arms if you need support.</li>
      <li>Turn on lights in front of you so your face and hands are visible.</li>
      <li>Wear comfortable clothes that show your arms and legs if possible.</li>
      <li>If you live alone and cannot stand safely, skip standing and walking tasks.</li>
    </ul>
    <label class="va-checkbox"><input type="checkbox" id="va-setup-safe" ${_vaSetupConfirmed ? 'checked' : ''}/> I confirm I am in a safe space for movement tasks today.</label>
    <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">
      <button type="button" class="btn btn-primary" id="va-setup-continue">Continue</button>
    </div>
  </div></div>`;
}

function _renderTaskIntro(task, def) {
  const sc = def.script.success_checklist.map((x) => `<li>${esc(x)}</li>`).join('');
  return `<div class="va-task-intro">
    ${_renderProgress()}
    <div class="ds-card"><div class="ds-card__header"><h3>${esc(def.script.title)}</h3></div><div class="ds-card__body">
      <p class="va-muted"><strong>What this checks:</strong> ${esc(def.script.what_this_checks)}</p>
      <p><strong>How to do it:</strong> ${esc(def.script.how_to_do)}</p>
      <p><strong>Camera:</strong> ${esc(def.script.camera_position)}</p>
      <p><strong>Safety:</strong> ${esc(def.script.safety)}</p>
      <div class="va-demo-placeholder" aria-hidden="true">
        <span>Demo clip placeholder</span>
        <small>Short demonstration video + audio instructions ship in a later sprint (PD-GUIDER–style calibration).</small>
      </div>
      <p class="va-voice-prompt"><strong>Voice guide:</strong> ${esc(def.script.voice_prompt)}</p>
      <p style="font-size:12px;color:var(--text-secondary);margin-top:10px">Success checklist before recording:</p>
      <ul class="va-checklist">${sc}</ul>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;align-items:center">
        <button type="button" class="btn btn-secondary" id="va-ready-record">I’m ready (acknowledge)</button>
        <button type="button" class="btn btn-primary" id="va-start-rec">Start recording</button>
        <button type="button" class="btn btn-secondary" id="va-skip-task">Skip task</button>
        <button type="button" class="btn btn-secondary" id="va-unsafe-task" title="Mark if this task is unsafe for you today">Unsafe for me today</button>
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
  const vid = _vaPreviewUrl
    ? `<video id="va-playback" controls playsinline src="${esc(_vaPreviewUrl)}" style="width:100%;max-height:280px;border-radius:8px;background:#000"></video>`
    : '<p class="va-muted">No preview available.</p>';
  return `<div class="va-post">
    ${_renderProgress()}
    <h4 style="margin:0 0 8px">Review clip</h4>
    ${vid}
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">
      <button type="button" class="btn btn-primary" id="va-use-clip">Use this recording</button>
      <button type="button" class="btn btn-secondary" id="va-rerecord">Record again</button>
      <button type="button" class="btn btn-secondary" id="va-skip-post">Skip task</button>
    </div>
  </div>`;
}

function _renderPatientColumn() {
  const session = _ensureSession();
  session.mode = 'patient_capture';

  if (_isPatientUser() && getToken() && _sessionNeedsConsent(session)) {
    return `<div class="va-col va-col-patient"><div class="va-muted" style="padding:16px">
      Complete the recording acknowledgement above to unlock the camera and tasks.
    </div></div>`;
  }

  let inner = '';
  if (!_vaSetupConfirmed && _vaPatientPhase === 'setup') {
    inner = _renderSetupChecklist();
  } else if (_vaTaskIndex >= session.tasks.length) {
    inner = `<div class="ds-card"><div class="ds-card__body"><h3 style="margin-top:0">All tasks addressed</h3>
      <p class="va-muted">You can switch to Clinician Review Mode to score recordings, or reset the session from the browser console (demo).</p></div></div>`;
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

function _renderClinicianForm(task, locked) {
  const def = _taskDef(task.task_id);
  const rev = _mergeReview(task.clinician_review, def);
  const dis = locked ? 'disabled' : '';
  const opts = (name, values) =>
    values.map((v) => `<option value="${esc(v)}" ${rev[name] === v ? 'selected' : ''}>${esc(v.replace(/_/g, ' '))}</option>`).join('');

  const baseFields = `
    <div class="form-group"><label class="form-label">Video quality</label>
      <select class="form-control" data-va-field="video_quality" ${dis}><option value="">Select…</option>${opts('video_quality', ['poor', 'fair', 'good'])}</select></div>
    <div class="form-group"><label class="form-label">Patient compliance</label>
      <select class="form-control" data-va-field="patient_compliance" ${dis}><option value="">Select…</option>${opts('patient_compliance', ['poor', 'fair', 'good'])}</select></div>
    <div class="form-group"><label class="form-label">Task completed (video)</label>
      <select class="form-control" data-va-field="task_completed" ${dis}><option value="">Select…</option>${opts('task_completed', ['yes', 'partial', 'no'])}</select></div>
    <div class="form-group"><label class="form-label">Repeat needed</label>
      <select class="form-control" data-va-field="repeat_needed" ${dis}><option value="">Select…</option>${opts('repeat_needed', ['yes', 'no'])}</select></div>`;

  let structured = '';
  if (def) {
    for (const [k, vals] of Object.entries(def.structured_clinician_fields)) {
      const cur = rev.structured_scores[k] || '';
      const optHtml = (Array.isArray(vals) ? vals : []).map((v) =>
        `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(String(v).replace(/_/g, ' '))}</option>`
      ).join('');
      structured += `<div class="form-group"><label class="form-label">${esc(k.replace(/_/g, ' '))}</label>
        <select class="form-control" data-va-score="${esc(k)}" ${dis}><option value="">Select…</option>${optHtml}</select></div>`;
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

  const localSrc = _vaBlobUrlByTask[task.task_id] || null;
  const needsServerStream = !!(task.recording_storage_ref && _vaSession && _vaSession.id);
  const videoBlock = localSrc
    ? `<video id="va-clin-review-video" controls playsinline src="${esc(localSrc)}" style="width:100%;border-radius:8px;background:#000"></video>`
    : needsServerStream
      ? `<div><video id="va-clin-review-video" controls playsinline style="width:100%;border-radius:8px;background:#000"></video><p class="va-muted" id="va-clin-video-status" style="font-size:12px;margin-top:6px">Loading recording…</p></div>`
      : `<div class="va-video-placeholder">No recording for this task yet.</div>`;

  const am = task.ai_automated_metrics;
  let motionBlock = '';
  if (am && !am.status) {
    motionBlock = `<div class="va-motion-panel">
      <div class="va-motion-title">Automated motion proxy <span class="va-muted" style="font-size:11px">(${esc(MOTION_ENGINE_ID)})</span></div>
      <div class="va-motion-grid">
        <div><span class="va-muted">Activity score (0–100)</span><strong>${esc(String(am.motion_activity_score_0_100 ?? '—'))}</strong></div>
        <div><span class="va-muted">Mean motion</span><strong>${esc(String(am.mean_motion_0_255 ?? '—'))}</strong></div>
        <div><span class="va-muted">Variability (SD)</span><strong>${esc(String(am.std_motion_0_255 ?? '—'))}</strong></div>
        <div><span class="va-muted">Peaks (rough)</span><strong>${esc(String(am.repetitive_motion_peak_count ?? '—'))}</strong></div>
      </div>
      <p class="va-muted" style="font-size:10px;margin:8px 0 0;line-height:1.45">${esc(am.disclaimer || '')}</p>
    </div>`;
  } else if (am && am.status === 'failed') {
    motionBlock = `<div class="va-motion-panel va-motion-panel--warn">
      <div class="va-motion-title">Motion analysis unavailable</div>
      <p class="va-muted" style="font-size:12px">${esc(am.error_message || 'Failed')}</p>
    </div>`;
  } else if (task.ai_analysis_status === 'running' || _vaMotionLoading) {
    motionBlock = `<div class="va-motion-panel"><p class="va-muted" style="font-size:12px">Running motion analysis\u2026</p></div>`;
  }

  const canReRunMotion =
    !locked &&
    needsServerStream &&
    getToken() &&
    _vaSession &&
    !String(_vaSession.id).startsWith('vas_') &&
    String(_vaSession.overall_status || '') !== 'finalized';
  const reRunBtn = canReRunMotion
    ? `<button type="button" class="btn btn-sm btn-secondary" id="va-rerun-motion">Re-run motion analysis</button>`
    : '';

  return `<div class="va-clinician-form">
    ${unsafeBadge}${skipBadge}
    <div style="margin-bottom:12px">${videoBlock}</div>
    ${motionBlock}
    ${reRunBtn ? `<div style="margin-bottom:12px">${reRunBtn}</div>` : ''}
    ${baseFields}
    ${structured}
    <div class="form-group"><label class="form-label">Free-text comment</label>
      <textarea class="form-control" rows="3" data-va-field="free_text_comment" ${dis}>${esc(rev.free_text_comment)}</textarea></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button type="button" class="btn btn-secondary" id="va-save-draft" ${dis}>Save draft</button>
      <button type="button" class="btn btn-primary" id="va-mark-reviewed" ${dis}>Mark reviewed</button>
    </div>
  </div>`;
}

function _renderClinicianColumn() {
  const session = _ensureSession();
  session.mode = 'clinician_review';
  const locked = String(session.overall_status || '') === 'finalized';
  const tasks = session.tasks;
  const idx = Math.min(Math.max(0, _vaSelectedClinicianTask), tasks.length - 1);
  const task = tasks[idx];
  const def = task ? _taskDef(task.task_id) : null;

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
    <div class="va-clin-layout">
      <aside class="va-sidebar" aria-label="Tasks">${sidebar}</aside>
      <div class="va-clin-main">
        <h4 style="margin:0 0 8px">${task ? esc(task.task_name) : ''}</h4>
        <p class="va-muted" style="font-size:12px">${def ? esc(def.clinical_purpose) : ''}</p>
        ${_renderClinicianForm(task, locked)}
        ${historyPlaceholder}
      </div>
    </div>
    <p class="va-muted" style="font-size:11px;margin-top:10px">Tip: use ↑ / ↓ to move between tasks when the sidebar is focused.</p>
  </div>`;
}

async function _fetchEvidenceForSession() {
  const session = _ensureSession();
  if (!session.id || String(session.id).startsWith('vas_')) {
    showToast('Save the session on the server before loading citations.');
    return;
  }
  if (!( _isClinicianUser() || currentUser?.role === 'admin')) return;
  if (!getToken()) return;
  _vaEvidenceLoading = true;
  _vaEvidenceError = '';
  _render();
  try {
    const body = {
      patient_id: _effectivePatientIdForEvidence(session),
      context_type: 'biomarker',
      target_name: 'remote_motor_exam',
      diagnosis: 'movement disorder',
      modality: 'telemedicine',
      phenotype_tags: [
        'telemedicine',
        'remote motor examination',
        'Parkinson disease',
        'video assessment',
        'bradykinesia',
        'gait',
      ],
      feature_summary: _buildVideoAssessmentFeatureSummary(session),
      max_results: 10,
    };
    _vaEvidenceResult = await api.evidenceByFinding(body);
    _vaEvidenceFetchedForId = String(session.id);
  } catch (e) {
    _vaEvidenceError = (e && e.message) || 'Evidence request failed';
    _vaEvidenceResult = null;
  } finally {
    _vaEvidenceLoading = false;
    _render();
  }
}

function _resetEvidenceState() {
  _vaEvidenceLoading = false;
  _vaEvidenceError = '';
  _vaEvidenceResult = null;
  _vaEvidenceFetchedForId = '';
}

function _renderSummaryPanel() {
  const session = _ensureSession();
  _applySummary();
  const s = session.summary;
  const flags = (session.safety_flags || []).length;
  const fin = String(session.overall_status || '') === 'finalized';
  const finalizeBtn =
    _isClinicianUser() && session.id && !String(session.id).startsWith('vas_')
      ? `<button type="button" class="btn btn-primary" id="va-finalize-session" ${fin ? 'disabled' : ''}>Finalize review</button>`
      : '';
  const exportBtn =
    (_isClinicianUser() || currentUser?.role === 'admin') &&
    session.id &&
    !String(session.id).startsWith('vas_') &&
    getToken()
      ? `<button type="button" class="btn btn-secondary" id="va-export-json">Download session JSON (research record)</button>`
      : '';
  const cons = session.patient_consent || {};
  const consentLine =
    cons.recording_consent && cons.research_use_acknowledged
      ? '<p class="va-muted" style="font-size:11px;margin-bottom:10px">Patient acknowledged recording and research use on file for this session.</p>'
      : '<p class="va-muted" style="font-size:11px;margin-bottom:10px;color:var(--amber)">Patient consent flags not complete in session record — confirm with your protocol.</p>';
  return `<div class="ds-card va-summary"><div class="ds-card__header"><h3>Summary</h3></div><div class="ds-card__body">
    ${consentLine}
    <div class="va-summary-grid">
      <div><span class="va-muted">Tasks recorded</span><strong>${s.tasks_completed}</strong></div>
      <div><span class="va-muted">Tasks skipped</span><strong>${s.tasks_skipped}</strong></div>
      <div><span class="va-muted">Safety flags</span><strong>${flags}</strong></div>
      <div><span class="va-muted">Review progress</span><strong>${s.review_completion_percent}%</strong></div>
    </div>
    <div class="form-group" style="margin-top:12px"><label class="form-label">Clinician impression (draft)</label>
      <textarea id="va-summary-impression" class="form-control" rows="2" placeholder="Brief overall impression" ${fin ? 'disabled' : ''}>${esc(session.summary.clinician_impression || '')}</textarea></div>
    <div class="form-group"><label class="form-label">Recommended follow-up</label>
      <textarea id="va-summary-followup" class="form-control" rows="2" placeholder="Optional" ${fin ? 'disabled' : ''}>${esc(session.summary.recommended_followup || '')}</textarea></div>
    ${fin ? '<p class="va-finalized-note">This session is finalized on the server — edits and uploads are locked.</p>' : ''}
    <div class="va-evidence-card ds-card" style="margin-top:14px;border:1px solid rgba(0,212,188,0.15)">
      <div class="ds-card__header"><h3 style="margin:0;font-size:14px">Related literature (evidence index)</h3></div>
      <div class="ds-card__body" style="padding-top:8px">
        <p class="va-muted" style="font-size:11px;margin-bottom:10px;line-height:1.45">Ranked from the ingested evidence database (not live internet search). Save task reviews first for richer retrieval context.</p>
        ${_renderEvidenceBlock()}
      </div>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">
      ${exportBtn}
      <button type="button" class="btn btn-primary" id="va-save-summary">Save draft summary</button>
      ${finalizeBtn}
    </div>
  </div></div>`;
}

function _render() {
  const el = document.getElementById('content');
  if (!el) return;

  _ensureSession();

  const showPatient = _vaPageLayout === 'capture' || (_vaPageLayout !== 'review' && _vaUiMode === 'patient');
  const showClinician = _vaPageLayout === 'review' || (_vaPageLayout !== 'capture' && _vaUiMode === 'clinician');

  const patientCol = showPatient
    ? _renderPatientColumn()
    : `<div class="va-col"><p class="va-muted">Patient capture is on the <a href="#" id="va-link-capture">capture page</a>.</p></div>`;

  const clinicianCol = showClinician
    ? _renderClinicianColumn()
    : `<div class="va-col"><p class="va-muted">Clinician review is on the <a href="#" id="va-link-review">review page</a>.</p></div>`;

  const banner =
    _vaApiBanner ? `<div class="va-api-banner" role="status">${esc(_vaApiBanner)}</div>` : '';

  el.innerHTML = `
<div class="ch-shell va-shell">
  ${banner}
  <div class="qeeg-hero" style="margin-bottom:20px">
    <div class="qeeg-hero__icon">🎥</div>
    <div>
      <div class="qeeg-hero__title">Video Assessments</div>
      <div class="qeeg-hero__sub">Guided movement and virtual care assessments for remote review</div>
      <p style="max-width:720px;margin-top:10px;font-size:13px;color:var(--text-secondary);line-height:1.5">
        Patients complete short camera-based tasks from home. Clinicians review recordings and structured comments—not autonomous scores.
        Skip any task that feels unsafe; skipped tasks are expected and not scored as “failed.”
      </p>
    </div>
  </div>

  <div class="va-emergency-banner" role="alert">${esc(EMERGENCY_BOX)}</div>

  ${_renderConsentGate()}

  ${_renderModeToggle()}
  ${_renderClinicianSessionPicker()}

  <div class="va-grid">
    ${patientCol}
    ${clinicianCol}
  </div>

  ${_renderSummaryPanel()}

  <div class="ds-card" style="margin-top:16px"><div class="ds-card__body" style="font-size:11px;color:var(--text-tertiary);line-height:1.5">
    Protocol: ${esc(VIDEO_ASSESSMENT_PROTOCOL.protocol_name)} v${esc(VIDEO_ASSESSMENT_PROTOCOL.protocol_version)} ·
    ${esc(DISCLAIMER)}
  </div></div>
</div>`;

  _wire();
  _attachClinicianVideoStream();
}

function _revokeClinicianStreamUrl() {
  if (_vaClinicianStreamUrl) {
    try {
      URL.revokeObjectURL(_vaClinicianStreamUrl);
    } catch (_) {}
    _vaClinicianStreamUrl = null;
  }
}

async function _attachClinicianVideoStream() {
  _revokeClinicianStreamUrl();
  const vid = document.getElementById('va-clin-review-video');
  const st = document.getElementById('va-clin-video-status');
  if (!vid || !st) return;
  const session = _vaSession;
  if (!session || !session.tasks) return;
  const task = session.tasks[_vaSelectedClinicianTask];
  if (!task || !task.recording_storage_ref) return;
  if (_vaBlobUrlByTask[task.task_id]) return;
  try {
    const { blob } = await api.videoAssessmentFetchTaskVideo(session.id, task.task_id);
    _vaClinicianStreamUrl = URL.createObjectURL(blob);
    vid.src = _vaClinicianStreamUrl;
    st.textContent = '';
    st.style.display = 'none';
  } catch (e) {
    st.textContent = 'Could not load recording: ' + (e && e.message);
  }
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
  document.getElementById('va-goto-review')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (window._nav) window._nav('video-assessments-review');
  });
  document.getElementById('va-goto-capture')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (window._nav) window._nav('video-assessments-capture');
  });
  document.getElementById('va-link-capture')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (window._nav) window._nav('video-assessments-capture');
  });
  document.getElementById('va-link-review')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (window._nav) window._nav('video-assessments-review');
  });

  document.getElementById('va-mode-patient')?.addEventListener('click', () => {
    _vaUiMode = 'patient';
    _render();
  });
  document.getElementById('va-mode-clinician')?.addEventListener('click', () => {
    _vaUiMode = 'clinician';
    _render();
  });

  document.getElementById('va-session-select')?.addEventListener('change', async (e) => {
    const id = e.target && e.target.value;
    if (!id) return;
    try {
      const doc = await api.videoAssessmentGetSession(id);
      _vaSession = mergeServerDocument(doc);
      _resetEvidenceState();
      try {
        sessionStorage.setItem(_apiSessionKey(), id);
      } catch (_) {}
      _applySummary();
      _vaSelectedClinicianTask = 0;
      showToast('Session loaded');
      _render();
    } catch (err) {
      showToast('Load failed: ' + (err && err.message));
    }
  });
  document.getElementById('va-session-refresh')?.addEventListener('click', () =>
    _refreshSessionListAndMaybeLoad(null)
  );

  document.getElementById('va-consent-save')?.addEventListener('click', async () => {
    const cr = document.getElementById('va-consent-record');
    const rs = document.getElementById('va-consent-research');
    if (!cr?.checked || !rs?.checked) {
      showToast('Please check both boxes to continue.');
      return;
    }
    if (!_isPatientUser() || !getToken()) return;
    const recordedAt = new Date().toISOString();
    const consentBody = {
      recording_consent: true,
      research_use_acknowledged: true,
      consent_version: 'video_assessment_mvp_v1',
      consent_recorded_at: recordedAt,
    };
    try {
      const sid = _vaSession && _vaSession.id && !String(_vaSession.id).startsWith('vas_') ? _vaSession.id : null;
      if (sid) {
        const doc = await api.videoAssessmentPatchSession(sid, { patient_consent: consentBody });
        _vaSession = mergeServerDocument(doc);
      } else {
        const created = await api.videoAssessmentCreateSession({
          consent: {
            recording_consent: true,
            research_use_acknowledged: true,
            consent_version: 'video_assessment_mvp_v1',
          },
        });
        _vaSession = mergeServerDocument(created);
        try {
          sessionStorage.setItem(_apiSessionKey(), _vaSession.id);
        } catch (_) {}
      }
      _applySummary();
      _vaApiBanner = 'Consent recorded. Session is saved on the server.';
      showToast('Consent saved');
      _render();
    } catch (e) {
      showToast('Could not save consent: ' + (e && e.message));
    }
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

  document.getElementById('va-skip-task')?.addEventListener('click', () => _skipCurrent('patient_pref'));
  document.getElementById('va-unsafe-task')?.addEventListener('click', () => _skipCurrent('unsafe'));

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
    let motionBlob = null;
    if (_vaLastRecordedBlob && _vaSession && _vaSession.id && !String(_vaSession.id).startsWith('vas_') && getToken()) {
      try {
        motionBlob = _vaLastRecordedBlob.slice(0, _vaLastRecordedBlob.size, _vaLastRecordedBlob.type || 'video/webm');
        const file = new File([_vaLastRecordedBlob], 'clip.webm', { type: 'video/webm' });
        const res = await api.videoAssessmentUploadTask(_vaSession.id, task.task_id, file);
        if (res && res.session) {
          _vaSession = mergeServerDocument(res.session);
          const mergedTask = (_vaSession.tasks || []).find((x) => x.task_id === task.task_id);
          if (mergedTask) Object.assign(task, mergedTask);
          _applySummary();
        } else {
          task.recording_status = 'accepted';
          task.unsafe_flag = false;
        }
        _vaLastRecordedBlob = null;
        showToast('Recording saved to server');
      } catch (e) {
        showToast('Upload failed: ' + (e && e.message));
        return;
      }
    } else {
      if (_vaLastRecordedBlob) {
        motionBlob = _vaLastRecordedBlob.slice(0, _vaLastRecordedBlob.size, _vaLastRecordedBlob.type || 'video/webm');
      }
      task.recording_status = 'accepted';
      task.unsafe_flag = false;
      _queueSyncTask(task);
    }
    _advanceTask();
    if (motionBlob) void _runMotionForTask(task, motionBlob);
  });

  document.getElementById('va-rerecord')?.addEventListener('click', () => {
    _vaPatientPhase = 'task_intro';
    _cleanupPreviewUrl();
    _render();
  });

  document.getElementById('va-skip-post')?.addEventListener('click', () => _skipCurrent('patient_pref'));

  document.querySelectorAll('[data-va-task-idx]').forEach((btn) => {
    btn.addEventListener('click', () => {
      _vaSelectedClinicianTask = parseInt(btn.getAttribute('data-va-task-idx'), 10);
      _render();
    });
  });

  document.getElementById('va-save-draft')?.addEventListener('click', async () => {
    const session = _ensureSession();
    const task = session.tasks[_vaSelectedClinicianTask];
    if (!task) return;
    task.clinician_review = {
      ..._collectReviewFromDom(task),
      reviewer_id: currentUser?.id || 'local',
      reviewed_at: null,
    };
    _persistSession();
    await _patchSessionToApi([{ task_id: task.task_id, clinician_review: task.clinician_review }]);
    showToast('Draft saved');
    _applySummary();
    _render();
  });

  document.getElementById('va-mark-reviewed')?.addEventListener('click', async () => {
    const session = _ensureSession();
    const task = session.tasks[_vaSelectedClinicianTask];
    if (!task) return;
    const body = _collectReviewFromDom(task);
    task.clinician_review = {
      ...body,
      reviewer_id: currentUser?.id || 'local',
      reviewed_at: new Date().toISOString(),
    };
    _persistSession();
    await _patchSessionToApi([{ task_id: task.task_id, clinician_review: task.clinician_review }]);
    showToast('Marked reviewed');
    _applySummary();
    _render();
  });

  document.getElementById('va-save-summary')?.addEventListener('click', async () => {
    const session = _ensureSession();
    session.summary = session.summary || {};
    session.summary.clinician_impression = document.getElementById('va-summary-impression')?.value || '';
    session.summary.recommended_followup = document.getElementById('va-summary-followup')?.value || '';
    _persistSession();
    if (!session.id || String(session.id).startsWith('vas_') || !getToken()) {
      showToast('Summary saved locally');
      _render();
      return;
    }
    try {
      const doc = await api.videoAssessmentPatchSession(session.id, {
        summary: {
          clinician_impression: session.summary.clinician_impression,
          recommended_followup: session.summary.recommended_followup,
        },
      });
      _vaSession = mergeServerDocument(doc);
      _applySummary();
      showToast('Summary saved');
    } catch (e) {
      showToast('Saved locally only: ' + (e && e.message));
    }
    _render();
  });

  document.getElementById('va-finalize-session')?.addEventListener('click', async () => {
    const session = _ensureSession();
    if (!session.id || String(session.id).startsWith('vas_')) return;
    try {
      await api.videoAssessmentFinalize(session.id, {
        clinician_impression: document.getElementById('va-summary-impression')?.value || '',
        recommended_followup: document.getElementById('va-summary-followup')?.value || '',
      });
      const doc = await api.videoAssessmentGetSession(session.id);
      _vaSession = mergeServerDocument(doc);
      showToast('Session finalized');
      _render();
    } catch (e) {
      showToast('Finalize failed: ' + (e && e.message));
    }
  });

  document.getElementById('va-export-json')?.addEventListener('click', async () => {
    const session = _ensureSession();
    if (!session.id || String(session.id).startsWith('vas_')) return;
    try {
      const { blob, filename } = await api.videoAssessmentExportJson(session.id);
      downloadBlob(blob, filename || `video_assessment_${session.id}.json`);
      showToast('Download started');
    } catch (e) {
      showToast('Export failed: ' + (e && e.message));
    }
  });

  document.getElementById('va-rerun-motion')?.addEventListener('click', async () => {
    const session = _ensureSession();
    const task = session.tasks && session.tasks[_vaSelectedClinicianTask];
    if (!task || !session.id || String(session.id).startsWith('vas_')) return;
    if (!task.recording_storage_ref) {
      showToast('No recording for this task.');
      return;
    }
    try {
      const { blob } = await api.videoAssessmentFetchTaskVideo(session.id, task.task_id);
      await _runMotionForTask(task, blob);
      showToast('Motion analysis complete');
    } catch (e) {
      showToast('Could not analyze: ' + (e && e.message));
    }
  });

  document.getElementById('va-load-evidence')?.addEventListener('click', () => {
    void _fetchEvidenceForSession();
  });
  document.getElementById('va-evidence-retry')?.addEventListener('click', () => {
    void _fetchEvidenceForSession();
  });
  document.getElementById('va-evidence-refresh')?.addEventListener('click', () => {
    void _fetchEvidenceForSession();
  });
}


function _skipCurrent(reason) {
  const task = _currentTask();
  if (!task) return;
  task.recording_status = reason === 'unsafe' ? 'unsafe_skipped' : 'skipped';
  task.skip_reason = reason;
  task.unsafe_flag = reason === 'unsafe';
  if (reason === 'unsafe') {
    _ensureSession().safety_flags = [...new Set([...(_ensureSession().safety_flags || []), task.task_id])];
  }
  _queueSyncTask(task);
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
    session.overall_status = 'completed';
    session.completed_at = new Date().toISOString();
    _vaPatientPhase = 'setup';
    showToast(fromSkip ? 'Last task handled—session complete.' : 'Session complete.');
  }
  _applySummary();
  _persistSession();
  _render();
}

/**
 * @param {(title: string, subtitle?: string) => void} setTopbar
 * @param {(id: string) => void} navigate
 * @param {{ vaMode?: 'both'|'capture'|'review' }} [opts]
 */
export async function pgVideoAssessments(setTopbar, navigate, opts = {}) {
  if (typeof setTopbar === 'function') setTopbar('Video Assessments', 'Virtual care');
  void navigate;

  _vaPageLayout = opts.vaMode || 'both';
  _vaSession = null;
  _vaApiBootstrapDone = false;
  _vaApiBanner = '';
  _resetEvidenceState();
  _revokeClinicianStreamUrl();
  await _bootstrapApiSession();
  if (!_vaSession) {
    const persisted = _loadPersistedSession();
    _vaSession = persisted || createEmptySession({ patient_id: _isDemoMode() ? 'demo-patient' : 'local' });
  }
  _applySummary();
  _updateFutureAiAggregatePlaceholder();

  if (_vaPageLayout === 'review') _vaUiMode = 'clinician';
  else if (_vaPageLayout === 'capture') _vaUiMode = 'patient';
  else _vaUiMode = 'patient';
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
}
