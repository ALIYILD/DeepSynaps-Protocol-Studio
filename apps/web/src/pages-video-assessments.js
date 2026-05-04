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

const SESSION_STORAGE_KEY = 'ds_video_assessment_session_v2';

const DISCLAIMER =
  'Video Assessments are for guided capture and clinician review only. They are not a substitute for an in-person examination, emergency care, or autonomous diagnosis.';

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

function _sessionPersistLabel() {
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
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(_vaSession));
    }
  } catch (_) {}
}

function _loadPersistedSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
    const legacy = sessionStorage.getItem('ds_video_assessment_session');
    if (legacy) return JSON.parse(legacy);
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

function _ensureSession() {
  if (!_vaSession) {
    const persisted = _loadPersistedSession();
    const pid =
      _vaSelectedPatientId ||
      _readStoredPatientId() ||
      (_demoTokenWorkspace() ? 'demo-workspace' : 'not-selected');
    _vaSession =
      persisted ||
      createEmptySession({
        patient_id: pid,
      });
    _applySummary();
  }
  return _vaSession;
}

function _syncSessionPatientId() {
  const pid = _vaSelectedPatientId || _readStoredPatientId() || (_demoTokenWorkspace() ? 'demo-workspace' : 'not-selected');
  if (_vaSession && _vaSession.patient_id !== pid) {
    _vaSession.patient_id = pid;
    _persistSession();
  }
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
  return `<div class="va-mode-toggle" role="tablist" aria-label="Assessment mode">
    <button type="button" role="tab" class="btn ${patientActive ? 'btn-primary' : 'btn-secondary'}" aria-selected="${patientActive}" id="va-mode-patient">Patient Capture Mode</button>
    <button type="button" role="tab" class="btn ${!patientActive ? 'btn-primary' : 'btn-secondary'}" aria-selected="${!patientActive}" id="va-mode-clinician">Clinician Review Mode</button>
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
      <div class="va-demo-placeholder" role="note">
        <span>Reference illustration not included</span>
        <small>Task scripts are text-only in this build. On-screen demonstration clips are not shown—follow the written steps and voice prompt.</small>
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
      <button type="button" class="btn btn-primary" id="va-use-clip">Use this recording</button>
      <button type="button" class="btn btn-secondary" id="va-rerecord">Record again</button>
      <button type="button" class="btn btn-secondary" id="va-skip-post">Skip task</button>
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
  strip.push(_persistAllowed() ? 'Local draft persistence on' : 'No reload persistence');
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
        <p id="va-patient-help" class="va-muted" style="font-size:11px;margin-top:6px">Linked IDs are for navigation and draft labelling only. Video stays in-browser until a server-backed ingest pipeline is enabled.</p>
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
  return `<div class="ds-card" style="margin-bottom:16px">
    <div class="ds-card__header"><h3 style="margin:0">Video data & analyzer availability</h3></div>
    <div class="ds-card__body" style="font-size:13px;line-height:1.55;color:var(--text-secondary)">
      <p style="margin-top:0"><strong>Browser clips this session:</strong> ${withClip} task(s) with a local preview blob.</p>
      <p><strong>Automated pose / affect / movement scoring:</strong> ${
        hasAiSlot
          ? '<span style="color:var(--amber)">Not connected</span> — this workspace records structured clinician observation and clips only. No model runs are claimed here.'
          : 'Unavailable.'
      }</p>
      <p style="margin-bottom:0;font-size:12px;color:var(--text-tertiary)">${esc(_sessionPersistLabel())}</p>
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

  const uploadCard = `<div class="ds-card" style="margin-bottom:12px">
    <div class="ds-card__header"><h3 style="margin:0">Upload a clip file</h3></div>
    <div class="ds-card__body">
      <p class="va-muted" style="font-size:12px;margin-top:0">Load a local video for the <strong>current task</strong> (preview only in this browser—not saved to the clinical record).</p>
      <p class="va-muted" style="font-size:11px">Typical containers: MP4, WebM, QuickTime/MOV (browser-dependent). Server-side ingest for clinicians is not wired from this screen.</p>
      <label class="btn btn-secondary btn-sm" style="cursor:pointer;display:inline-flex;align-items:center;gap:6px;margin-top:8px">
        Choose video file
        <input type="file" id="va-upload-file" accept="video/mp4,video/webm,video/quicktime,video/x-matroska,video/avi" style="position:absolute;width:0;height:0;opacity:0" aria-label="Choose video file for current task" />
      </label>
    </div>
  </div>`;

  let inner = '';
  if (!_vaSetupConfirmed && _vaPatientPhase === 'setup') {
    inner = _renderSetupChecklist();
  } else if (_vaTaskIndex >= session.tasks.length) {
    inner = `<div class="ds-card"><div class="ds-card__body"><h3 style="margin-top:0">All tasks addressed</h3>
      <p class="va-muted">Switch to Clinician Review Mode to score recordings. To start a new capture cycle, reload this page—draft state follows ${_persistAllowed() ? 'your browser session storage rules' : 'no persistence in this build'}.</p></div></div>`;
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
  const rev = _mergeReview(task.clinician_review, def);
  const opts = (name, values) =>
    values.map((v) => `<option value="${esc(v)}" ${rev[name] === v ? 'selected' : ''}>${esc(v.replace(/_/g, ' '))}</option>`).join('');

  const baseFields = `
    <div class="form-group"><label class="form-label">Video quality</label>
      <select class="form-control" data-va-field="video_quality"><option value="">Select…</option>${opts('video_quality', ['poor', 'fair', 'good'])}</select></div>
    <div class="form-group"><label class="form-label">Patient compliance</label>
      <select class="form-control" data-va-field="patient_compliance"><option value="">Select…</option>${opts('patient_compliance', ['poor', 'fair', 'good'])}</select></div>
    <div class="form-group"><label class="form-label">Task completed (video)</label>
      <select class="form-control" data-va-field="task_completed"><option value="">Select…</option>${opts('task_completed', ['yes', 'partial', 'no'])}</select></div>
    <div class="form-group"><label class="form-label">Repeat needed</label>
      <select class="form-control" data-va-field="repeat_needed"><option value="">Select…</option>${opts('repeat_needed', ['yes', 'no'])}</select></div>`;

  let structured = '';
  if (def) {
    for (const [k, vals] of Object.entries(def.structured_clinician_fields)) {
      const cur = rev.structured_scores[k] || '';
      const optHtml = (Array.isArray(vals) ? vals : []).map((v) =>
        `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(String(v).replace(/_/g, ' '))}</option>`
      ).join('');
      structured += `<div class="form-group"><label class="form-label">${esc(k.replace(/_/g, ' '))}</label>
        <select class="form-control" data-va-score="${esc(k)}"><option value="">Select…</option>${optHtml}</select></div>`;
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
  const videoBlock = blobSrc
    ? `${metaHtml}<video controls src="${esc(blobSrc)}" style="width:100%;border-radius:8px;background:#000"></video>`
    : `<div class="va-video-placeholder">No recording in this browser session yet. Prior server-stored clips are not loaded in this build—record or accept a clip in Patient Capture Mode first.</div>`;

  return `<div class="va-clinician-form">
    ${unsafeBadge}${skipBadge}
    <div style="margin-bottom:12px">${videoBlock}</div>
    ${baseFields}
    ${structured}
    <div class="form-group"><label class="form-label">Free-text comment</label>
      <textarea class="form-control" rows="3" data-va-field="free_text_comment">${esc(rev.free_text_comment)}</textarea></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button type="button" class="btn btn-secondary" id="va-save-draft">Save draft</button>
      <button type="button" class="btn btn-primary" id="va-mark-reviewed">Mark reviewed</button>
    </div>
  </div>`;
}

function _renderClinicianColumn() {
  const session = _ensureSession();
  session.mode = 'clinician_review';
  const role = currentUser?.role || '';
  if (role === 'patient') {
    return `<div class="va-col va-col-clinician">
      <div class="ds-card"><div class="ds-card__body">
        <p class="va-muted" style="margin:0;font-size:13px">Structured clinician scoring is limited to clinician or admin accounts. You can still complete capture tasks in Patient Capture Mode.</p>
      </div></div>
    </div>`;
  }
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
  return `<div class="ds-card va-summary"><div class="ds-card__header"><h3>Summary</h3></div><div class="ds-card__body">
    <div class="va-summary-grid">
      <div><span class="va-muted">Tasks recorded</span><strong>${s.tasks_completed}</strong></div>
      <div><span class="va-muted">Tasks skipped</span><strong>${s.tasks_skipped}</strong></div>
      <div><span class="va-muted">Safety flags</span><strong>${flags}</strong></div>
      <div><span class="va-muted">Review progress</span><strong>${s.review_completion_percent}%</strong></div>
    </div>
    <div class="form-group" style="margin-top:12px"><label class="form-label">Clinician impression (draft)</label>
      <textarea id="va-summary-impression" class="form-control" rows="2" placeholder="Brief overall impression">${esc(session.summary.clinician_impression || '')}</textarea></div>
    <div class="form-group"><label class="form-label">Recommended follow-up</label>
      <textarea id="va-summary-followup" class="form-control" rows="2" placeholder="Optional">${esc(session.summary.recommended_followup || '')}</textarea></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button type="button" class="btn btn-secondary" id="va-export-json">Download session draft (JSON)</button>
      <button type="button" class="btn btn-primary" id="va-save-summary">Save draft summary</button>
    </div>
    <p class="va-muted" style="font-size:11px;margin-top:10px">JSON export is a local draft for workflow handoff—not a signed report or EHR upload.</p>
  </div></div>`;
}

function _render() {
  const el = document.getElementById('content');
  if (!el) return;

  const session = _ensureSession();
  _syncSessionPatientId();

  const patientCol = _vaUiMode === 'patient' ? _renderPatientColumn() : `<div class="va-col"><p class="va-muted">Switch to Patient Capture Mode to use the guided flow.</p></div>`;

  const clinicianCol =
    _vaUiMode === 'clinician' ? _renderClinicianColumn() : `<div class="va-col"><p class="va-muted">Switch to Clinician Review Mode to score recordings.</p></div>`;

  el.innerHTML = `
<div class="ch-shell va-shell">
  <div class="qeeg-hero" style="margin-bottom:20px">
    <div class="qeeg-hero__icon">🎥</div>
    <div>
      <div class="qeeg-hero__title">Video Assessments</div>
      <div class="qeeg-hero__sub">Clinician-reviewed video capture & structured observation (decision-support)</div>
      <p style="max-width:820px;margin-top:10px;font-size:13px;color:var(--text-secondary);line-height:1.5">
        Guided camera tasks with structured clinician scoring—not autonomous diagnosis, emotion certainty, or surveillance.
        Recordings in this build stay in the browser unless you export a draft; server-side video ingest for clinicians is on the product roadmap.
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

  ${currentUser?.role === 'patient' ? '' : _renderSummaryPanel()}

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
    _ensureSession().patient_id = v || (_demoTokenWorkspace() ? 'demo-workspace' : 'not-selected');
    _persistSession();
    showToast(v ? 'Patient context updated for this session.' : 'No patient selected.');
    _render();
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
    _vaUiMode = 'clinician';
    _render();
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

  document.getElementById('va-use-clip')?.addEventListener('click', () => {
    const task = _currentTask();
    if (task) {
      task.recording_status = 'accepted';
      task.unsafe_flag = false;
    }
    _advanceTask();
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

  document.getElementById('va-save-draft')?.addEventListener('click', () => {
    const session = _ensureSession();
    const task = session.tasks[_vaSelectedClinicianTask];
    if (!task) return;
    task.clinician_review = {
      ..._collectReviewFromDom(task),
      reviewer_id: 'local',
      reviewed_at: null,
    };
    _persistSession();
    showToast('Draft saved locally');
    _applySummary();
    _render();
  });

  document.getElementById('va-mark-reviewed')?.addEventListener('click', () => {
    const session = _ensureSession();
    const task = session.tasks[_vaSelectedClinicianTask];
    if (!task) return;
    const body = _collectReviewFromDom(task);
    task.clinician_review = {
      ...body,
      reviewer_id: 'local',
      reviewed_at: new Date().toISOString(),
    };
    _persistSession();
    showToast('Marked reviewed');
    _applySummary();
    _render();
  });

  document.getElementById('va-save-summary')?.addEventListener('click', () => {
    const session = _ensureSession();
    session.summary.clinician_impression = document.getElementById('va-summary-impression')?.value || '';
    session.summary.recommended_followup = document.getElementById('va-summary-followup')?.value || '';
    _persistSession();
    showToast('Summary saved locally');
    _render();
  });

  document.getElementById('va-export-json')?.addEventListener('click', () => {
    const session = _ensureSession();
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
 */
export async function pgVideoAssessments(setTopbar, navigate) {
  if (typeof setTopbar === 'function') setTopbar('Video Assessments', 'Virtual care');
  _vaNavigate = typeof navigate === 'function' ? navigate : () => {};

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
  const persisted = _loadPersistedSession();
  if (persisted) {
    _vaSession = persisted;
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
}
