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
    _cleanupPreviewUrl();
    _vaPreviewUrl = URL.createObjectURL(blob);
    _setTaskBlobUrl(task.task_id, _vaPreviewUrl);
    task.recording_asset_id = 'blob:' + task.task_id + ':' + Date.now();
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
  const videoBlock = blobSrc
    ? `<video controls src="${esc(blobSrc)}" style="width:100%;border-radius:8px;background:#000"></video>`
    : `<div class="va-video-placeholder">No recording in this browser session yet. After upload pipeline ships, prior captures load here.</div>`;

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
      <button type="button" class="btn btn-secondary" id="va-export-placeholder">Export (placeholder)</button>
      <button type="button" class="btn btn-primary" id="va-save-summary">Save draft summary</button>
    </div>
  </div></div>`;
}

function _render() {
  const el = document.getElementById('content');
  if (!el) return;

  _ensureSession();

  const patientCol = _vaUiMode === 'patient' ? _renderPatientColumn() : `<div class="va-col"><p class="va-muted">Switch to Patient Capture Mode to use the guided flow.</p></div>`;

  const clinicianCol =
    _vaUiMode === 'clinician' ? _renderClinicianColumn() : `<div class="va-col"><p class="va-muted">Switch to Clinician Review Mode to score recordings.</p></div>`;

  el.innerHTML = `
<div class="ch-shell va-shell">
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

  ${_renderModeToggle()}

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

  document.getElementById('va-export-placeholder')?.addEventListener('click', () => {
    showToast('Export will connect to API in a later sprint.');
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
  void navigate;

  _vaSession = null;
  _ensureSession();
  if (_isDemoMode() && !_loadPersistedSession()) {
    _vaSession = createEmptySession({ patient_id: 'demo-patient' });
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
