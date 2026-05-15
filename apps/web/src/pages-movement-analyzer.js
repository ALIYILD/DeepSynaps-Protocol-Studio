/**
 * Movement Analyzer — clinician-reviewed motor/movement decision support.
 * Does not provide autonomous diagnosis, fall-risk final determination, or protocol selection.
 */
import { api } from './api.js';
import { isDemoSession } from './demo-session.js';
import { ANALYZER_DEMO_FIXTURES, DEMO_FIXTURE_BANNER_HTML } from './demo-fixtures-analyzers.js';
import { drHero } from './helpers.js';
import { loadPatientFlagSummary } from './dr-friendly-flags.js';
import { mountAnalyzerAIReportStrip } from './analyzer-ai-report-ui.js';

const MOVEMENT_CLINICAL_QUESTION = "Are this patient's motor signs (tremor, bradykinesia, gait, posture) changing in clinically meaningful ways?";
const MOVEMENT_HOW_TO_READ = "Movement cues fuse passive sensors and chart context where available. Outputs are decision-support cues — not autonomous neurological diagnosis, fall-risk final determination, treatment eligibility, or medication recommendations.";

const CLINICAL_MOVEMENT_ANALYZER_ROLES = new Set(['clinician', 'admin', 'clinic-admin', 'supervisor', 'reviewer', 'technician', 'resident']);

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function canUseMovementAnalyzerWorkspace(role, opts = {}) {
  const normalized = String(role || '').trim().toLowerCase();
  if (!normalized) return !!opts.allowUnknown;
  return CLINICAL_MOVEMENT_ANALYZER_ROLES.has(normalized);
}

export function applyMovementAnalyzerPatientContext(pageId, patientId, win = globalThis?.window) {
  const pid = String(patientId || '').trim();
  if (!pid || !win) return;
  try { win._profilePatientId = pid; } catch {}
  try { win._selectedPatientId = pid; } catch {}
  if (pageId === 'patient-analytics') {
    try { win._paPatientId = pid; } catch {}
  }
  if (pageId === 'deeptwin') {
    try { win._deeptwinPatientId = pid; } catch {}
  }
}

function _renderMovementAnalyzerRestrictedCard() {
  return `<div role="region" aria-label="Movement analyzer access restricted" style="max-width:560px;margin:48px auto;padding:24px;border:1px solid var(--border);border-radius:14px;background:var(--bg-card);text-align:center">
    <div style="font-size:15px;font-weight:600;margin-bottom:8px">Clinician workspace</div>
    <div style="font-size:12px;color:var(--text-secondary);line-height:1.6">
      Movement review is restricted to clinician-facing accounts because it surfaces patient-linked sensor cues, exports, and audit actions that require governed review.
    </div>
  </div>`;
}

/** Map backend multimodal_links analyzer_id to app nav page id */
export function analyzerIdToNavPage(analyzerId) {
  const id = String(analyzerId || '').toLowerCase();
  const map = {
    deeptwin: 'deeptwin',
    'video-assessments': 'video-assessments',
    wearables: 'wearables',
    'live-session': 'live-session',
    'voice-analyzer': 'voice-analyzer',
    'clinician-wellness': 'clinician-wellness',
    'medication-analyzer': 'medication-analyzer',
    'treatment-sessions-analyzer': 'treatment-sessions-analyzer',
    'risk-analyzer': 'risk-analyzer',
    'assessments-v2': 'assessments-v2',
    'mri-analysis': 'mri-analysis',
    'qeeg-launcher': 'qeeg-launcher',
  };
  if (map[id]) return map[id];
  return id || null;
}

/** Prefer GET /audit items; fall back to audit_tail embedded in workspace payload */
export function mergeMovementAuditItems(profile, auditResponse) {
  const fromAudit = auditResponse && Array.isArray(auditResponse.items) ? auditResponse.items : [];
  const fromProfile = profile && Array.isArray(profile.audit_tail) ? profile.audit_tail : [];
  if (fromAudit.length) return fromAudit;
  return fromProfile;
}

const MODALITY_ORDER = ['bradykinesia', 'tremor', 'gait', 'posture', 'monitoring'];

const MODALITY_LABELS = {
  bradykinesia: 'Bradykinesia cue',
  tremor:       'Tremor cue',
  gait:         'Gait / activity cue',
  posture:      'Posture / balance cue',
  monitoring:   'Movement variability cue',
};

const MODALITY_TIPS = {
  bradykinesia: 'Model-assisted summary from available tasks — not a diagnosis.',
  tremor:       'Movement-analysis cue — requires clinician review; not a tremor diagnosis.',
  gait:         'Steps / proxy signals only unless instrumented gait data exists.',
  posture:      'Video-derived proxy when present — not a balance or fall-risk determination.',
  monitoring:   'Passive variability marker — interpret with exam and context.',
};

/** Evidence-graded movement biomarkers from systematic literature review. */
const MOVEMENT_BIOMARKER_EVIDENCE = {
  bradykinesia: {
    finger_tapping_speed: { grade: 'A', note: 'Meta-analytic: speed decay most reliable PD feature. AUC 0.85-0.94. Requires clinical confirmation.' },
    pronation_supination_rom: { grade: 'B', note: 'ROM and velocity correlate with UPDRS-III. ICC 0.78-0.89 vs clinical rating.' },
    overall: { grade: 'A', safeWording: 'Movement speed features may support clinician review of bradykinesia. Not a standalone diagnosis.' },
  },
  tremor: {
    rest_tremor_frequency: { grade: 'B', note: '4-6 Hz rest tremor frequency distinguishes PD from essential tremor (8-12 Hz). Contactless measurement ICC 0.82-0.91.' },
    postural_tremor_amplitude: { grade: 'C', note: 'Amplitude correlates with clinical severity. Camera artifact can mimic tremor—requires clinician review.' },
    overall: { grade: 'B', safeWording: 'Tremor frequency/amplitude features are model-assisted observation cues. Camera artifacts may mimic tremor.' },
  },
  gait: {
    stride_length: { grade: 'A', note: 'Strongest single PD gait predictor. Meta-analytic SMD = -1.12 vs controls.' },
    gait_variability: { grade: 'A', note: 'Coefficient of variation of step time: AUC 0.91-0.99 for PD diagnosis.' },
    dual_task_gait_speed: { grade: 'A', note: 'Dual-task cost predicts cognitive decline. AUC 0.923 for NC vs dementia.' },
    overall: { grade: 'A', safeWording: 'Gait features are the strongest validated video-based movement biomarkers. Still require clinical confirmation.' },
  },
  posture: {
    postural_sway_area: { grade: 'B', note: 'COPC sway area correlates with Berg Balance Scale (r=-0.71). Single-leg stance predicts falls over 6 months.' },
    overall: { grade: 'B', safeWording: 'Postural sway features are proxy markers. Not a fall-risk determination.' },
  },
  monitoring: {
    movement_variability: { grade: 'C', note: 'Passive monitoring of movement variability shows promise but limited clinical validation.' },
    overall: { grade: 'C', safeWording: 'Movement variability is a research-only signal with limited clinical validation. Interpret with caution.' },
  },
};

// ── MediaPipe BlazePose 33 Keypoint Skeleton ────────────────────────────
const SKELETON_CONNECTIONS = [
  // Face
  ['nose', 'left_eye_inner'], ['nose', 'right_eye_inner'],
  ['left_eye_inner', 'left_eye'], ['left_eye', 'left_eye_outer'],
  ['right_eye_inner', 'right_eye'], ['right_eye', 'right_eye_outer'],
  ['left_eye_outer', 'left_ear'], ['right_eye_outer', 'right_ear'],
  ['nose', 'mouth_left'], ['nose', 'mouth_right'],
  // Torso
  ['mouth_left', 'mouth_right'],
  ['left_shoulder', 'right_shoulder'], ['left_shoulder', 'left_hip'],
  ['right_shoulder', 'right_hip'], ['left_hip', 'right_hip'],
  // Left arm
  ['left_shoulder', 'left_elbow'], ['left_elbow', 'left_wrist'],
  ['left_wrist', 'left_pinky'], ['left_wrist', 'left_index'],
  ['left_wrist', 'left_thumb'], ['left_pinky', 'left_index'],
  // Right arm
  ['right_shoulder', 'right_elbow'], ['right_elbow', 'right_wrist'],
  ['right_wrist', 'right_pinky'], ['right_wrist', 'right_index'],
  ['right_wrist', 'right_thumb'], ['right_pinky', 'right_index'],
  // Left leg
  ['left_hip', 'left_knee'], ['left_knee', 'left_ankle'],
  ['left_ankle', 'left_heel'], ['left_heel', 'left_foot_index'],
  ['left_ankle', 'left_foot_index'],
  // Right leg
  ['right_hip', 'right_knee'], ['right_knee', 'right_ankle'],
  ['right_ankle', 'right_heel'], ['right_heel', 'right_foot_index'],
  ['right_ankle', 'right_foot_index'],
];

/** Human-readable keypoint names for tooltips */
const KEYPOINT_LABELS = {
  nose: 'Nose',
  left_eye_inner: 'Left Eye (Inner)',
  left_eye: 'Left Eye',
  left_eye_outer: 'Left Eye (Outer)',
  right_eye_inner: 'Right Eye (Inner)',
  right_eye: 'Right Eye',
  right_eye_outer: 'Right Eye (Outer)',
  left_ear: 'Left Ear',
  right_ear: 'Right Ear',
  mouth_left: 'Mouth (Left)',
  mouth_right: 'Mouth (Right)',
  left_shoulder: 'Left Shoulder',
  right_shoulder: 'Right Shoulder',
  left_elbow: 'Left Elbow',
  right_elbow: 'Right Elbow',
  left_wrist: 'Left Wrist',
  right_wrist: 'Right Wrist',
  left_pinky: 'Left Pinky',
  right_pinky: 'Right Pinky',
  left_index: 'Left Index',
  right_index: 'Right Index',
  left_thumb: 'Left Thumb',
  right_thumb: 'Right Thumb',
  left_hip: 'Left Hip',
  right_hip: 'Right Hip',
  left_knee: 'Left Knee',
  right_knee: 'Right Knee',
  left_ankle: 'Left Ankle',
  right_ankle: 'Right Ankle',
  left_heel: 'Left Heel',
  right_heel: 'Right Heel',
  left_foot_index: 'Left Foot Index',
  right_foot_index: 'Right Foot Index',
};

/** Ordered keypoint IDs for heatmap Y axis */
const KEYPOINT_ORDER = Object.keys(KEYPOINT_LABELS);

/** Critical safety disclaimer for all movement analysis outputs. */
const MOVEMENT_CRITICAL_SAFETY =
  'IMPORTANT LIMITATIONS: (1) No video-based movement biomarker is FDA-approved for standalone diagnosis as of 2026. ' +
  '(2) Camera artifacts, clothing, lighting, and body position can produce false movement signals. ' +
  '(3) All outputs are model-assisted observation cues requiring clinician confirmation. ' +
  '(4) Pose estimation accuracy varies by skin tone, age, and body type—interpret with cultural and demographic awareness. ' +
  '(5) These features support but do not replace in-person neurological examination.';

function _renderEvidenceBadge(grade) {
  const colors = {
    A: { bg: 'rgba(34,197,94,0.12)', text: '#16a34a', label: 'A — Meta-analytic' },
    B: { bg: 'rgba(59,130,246,0.12)', text: '#2563eb', label: 'B — Controlled trial' },
    C: { bg: 'rgba(245,158,11,0.12)', text: '#d97706', label: 'C — Observational' },
    D: { bg: 'rgba(249,115,22,0.12)', text: '#f97316', label: 'D — Pilot' },
  };
  const g = String(grade || 'D').toUpperCase();
  const c = colors[g] || colors.D;
  return `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:4px;background:${c.bg};color:${c.text};font-size:11px;font-weight:600">${esc(c.label)}</span>`;
}

function _renderSafeWording(modKey) {
  const ev = MOVEMENT_BIOMARKER_EVIDENCE[modKey];
  if (!ev?.overall?.safeWording) return '';
  return `<div style="margin-top:8px;padding:8px 10px;border-radius:6px;background:rgba(155,127,255,0.06);border:1px solid rgba(155,127,255,0.18);font-size:11px;line-height:1.5;color:var(--text-secondary)">
    <strong style="color:var(--text-primary)">Evidence context:</strong> ${esc(ev.overall.safeWording)}
  </div>`;
}

// ── Skeleton Rendering ──────────────────────────────────────────────────
function _confidenceColor(conf) {
  if (conf > 0.9) return 'rgba(34,197,94,0.8)';
  if (conf > 0.7) return 'rgba(59,130,246,0.8)';
  if (conf > 0.5) return 'rgba(245,158,11,0.8)';
  return 'rgba(239,68,68,0.8)';
}

function _renderSkeletonOverlay(canvas, poseSequence, frameIdx) {
  const ctx = canvas.getContext('2d');
  const frame = poseSequence?.frames?.[frameIdx];
  if (!frame) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  SKELETON_CONNECTIONS.forEach(([a, b]) => {
    const kpA = frame.keypoints.find(k => k.id === a);
    const kpB = frame.keypoints.find(k => k.id === b);
    if (kpA && kpB && kpA.confidence > 0.3 && kpB.confidence > 0.3) {
      ctx.beginPath();
      ctx.moveTo(kpA.x * canvas.width, kpA.y * canvas.height);
      ctx.lineTo(kpB.x * canvas.width, kpB.y * canvas.height);
      ctx.strokeStyle = _confidenceColor(Math.min(kpA.confidence, kpB.confidence));
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  });
  frame.keypoints.forEach(kp => {
    if (kp.confidence > 0.3) {
      ctx.beginPath();
      ctx.arc(kp.x * canvas.width, kp.y * canvas.height, 3, 0, 2 * Math.PI);
      ctx.fillStyle = _confidenceColor(kp.confidence);
      ctx.fill();
    }
  });
}

function _renderInterpolatedSkeleton(canvas, poseSequence, timeSeconds) {
  const ctx = canvas.getContext('2d');
  if (!poseSequence?.frames?.length) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }
  const fps = poseSequence.fps || 30;
  const frameFloat = timeSeconds * fps;
  const frameIdx0 = Math.max(0, Math.min(Math.floor(frameFloat), poseSequence.frames.length - 1));
  const frameIdx1 = Math.min(frameIdx0 + 1, poseSequence.frames.length - 1);
  const t = frameFloat - frameIdx0;
  const f0 = poseSequence.frames[frameIdx0];
  const f1 = poseSequence.frames[frameIdx1];
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  SKELETON_CONNECTIONS.forEach(([a, b]) => {
    const kpA0 = f0.keypoints.find(k => k.id === a);
    const kpB0 = f0.keypoints.find(k => k.id === b);
    const kpA1 = f1.keypoints.find(k => k.id === a);
    const kpB1 = f1.keypoints.find(k => k.id === b);
    if (!kpA0 || !kpB0 || !kpA1 || !kpB1) return;
    const confA = Math.min(kpA0.confidence, kpA1.confidence);
    const confB = Math.min(kpB0.confidence, kpB1.confidence);
    if (confA <= 0.3 || confB <= 0.3) return;
    const ax = (kpA0.x + (kpA1.x - kpA0.x) * t) * canvas.width;
    const ay = (kpA0.y + (kpA1.y - kpA0.y) * t) * canvas.height;
    const bx = (kpB0.x + (kpB1.x - kpB0.x) * t) * canvas.width;
    const by = (kpB0.y + (kpB1.y - kpB0.y) * t) * canvas.height;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.strokeStyle = _confidenceColor(Math.min(confA, confB));
    ctx.lineWidth = 2;
    ctx.stroke();
  });
  f0.keypoints.forEach((kp0) => {
    const kp1 = f1.keypoints.find(k => k.id === kp0.id);
    if (!kp1) return;
    const conf = Math.min(kp0.confidence, kp1.confidence);
    if (conf <= 0.3) return;
    const x = (kp0.x + (kp1.x - kp0.x) * t) * canvas.width;
    const y = (kp0.y + (kp1.y - kp0.y) * t) * canvas.height;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, 2 * Math.PI);
    ctx.fillStyle = _confidenceColor(conf);
    ctx.fill();
  });
}

/** Render a confidence heatmap: X=time(frames), Y=keypoint, color=confidence */
function _renderConfidenceHeatmap(canvas, poseSequence) {
  const ctx = canvas.getContext('2d');
  if (!poseSequence?.frames?.length) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }
  const frames = poseSequence.frames;
  const cellW = canvas.width / frames.length;
  const cellH = canvas.height / KEYPOINT_ORDER.length;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  frames.forEach((frame, fi) => {
    KEYPOINT_ORDER.forEach((kpId, ki) => {
      const kp = frame.keypoints.find(k => k.id === kpId);
      const conf = kp?.confidence ?? 0;
      ctx.fillStyle = _confidenceColor(conf);
      ctx.fillRect(fi * cellW, ki * cellH, Math.max(cellW, 1), Math.max(cellH, 1));
    });
  });
  ctx.fillStyle = 'var(--text-secondary)';
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'right';
  KEYPOINT_ORDER.forEach((kpId, ki) => {
    const label = KEYPOINT_LABELS[kpId] || kpId;
    ctx.fillText(label, canvas.width - 4, ki * cellH + cellH / 2 + 3);
  });
}

/** Create or get the skeleton canvas overlay for a given video element */
function _ensureSkeletonCanvas(videoEl) {
  if (!videoEl) return null;
  const container = videoEl.parentElement;
  if (!container) return null;
  let canvas = container.querySelector('canvas[data-skeleton-overlay]');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.dataset.skeletonOverlay = 'true';
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '2';
    container.style.position = 'relative';
    container.appendChild(canvas);
  }
  return canvas;
}

function _removeSkeletonCanvas(videoEl) {
  if (!videoEl) return;
  const container = videoEl.parentElement;
  if (!container) return;
  const canvas = container.querySelector('canvas[data-skeleton-overlay]');
  if (canvas) canvas.remove();
}

let _mvSkeletonOverlayEnabled = false;
let _mvPoseCache = {};

async function _fetchPoseSequence(recordingId) {
  if (!recordingId) return null;
  if (_mvPoseCache[recordingId]) return _mvPoseCache[recordingId];
  try {
    const res = await api.getPoseSequence?.(recordingId);
    if (res) { _mvPoseCache[recordingId] = res; return res; }
  } catch (_) {}
  return null;
}

let _mvSkeletonRaf = null;

function _startSkeletonAnimation(videoEl, poseSequence) {
  _stopSkeletonAnimation();
  const canvas = _ensureSkeletonCanvas(videoEl);
  if (!canvas) return;
  function tick() {
    if (!videoEl || videoEl.paused || videoEl.ended) {
      _mvSkeletonRaf = requestAnimationFrame(tick);
      return;
    }
    const w = videoEl.videoWidth || videoEl.clientWidth;
    const h = videoEl.videoHeight || videoEl.clientHeight;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    _renderInterpolatedSkeleton(canvas, poseSequence, videoEl.currentTime);
    _mvSkeletonRaf = requestAnimationFrame(tick);
  }
  tick();
}

function _stopSkeletonAnimation() {
  if (_mvSkeletonRaf) { cancelAnimationFrame(_mvSkeletonRaf); _mvSkeletonRaf = null; }
}

let _mvKpTooltip = null;

function _ensureKpTooltip() {
  if (_mvKpTooltip) return _mvKpTooltip;
  _mvKpTooltip = document.createElement('div');
  _mvKpTooltip.dataset.skeletonTooltip = 'true';
  _mvKpTooltip.style.cssText = 'position:absolute;z-index:9999;padding:6px 10px;border-radius:6px;background:rgba(0,0,0,0.85);color:#fff;font-size:11px;line-height:1.45;pointer-events:none;display:none;white-space:nowrap;border:1px solid rgba(255,255,255,0.1)';
  document.body.appendChild(_mvKpTooltip);
  return _mvKpTooltip;
}

function _removeKpTooltip() {
  if (_mvKpTooltip) { _mvKpTooltip.remove(); _mvKpTooltip = null; }
}

function _handleSkeletonMouseMove(e, canvas, poseSequence, videoEl) {
  const tooltip = _ensureKpTooltip();
  if (!poseSequence?.frames?.length || !videoEl) { tooltip.style.display = 'none'; return; }
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const fps = poseSequence.fps || 30;
  const frameFloat = videoEl.currentTime * fps;
  const frameIdx = Math.max(0, Math.min(Math.round(frameFloat), poseSequence.frames.length - 1));
  const frame = poseSequence.frames[frameIdx];
  if (!frame) { tooltip.style.display = 'none'; return; }
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  let closest = null;
  let closestDist = Infinity;
  frame.keypoints.forEach(kp => {
    if (kp.confidence <= 0.3) return;
    const kx = (kp.x * canvas.width) / scaleX;
    const ky = (kp.y * canvas.height) / scaleY;
    const d = Math.hypot(mx - kx, my - ky);
    if (d < 12 && d < closestDist) { closestDist = d; closest = kp; }
  });
  if (closest) {
    tooltip.innerHTML = '<strong>' + (KEYPOINT_LABELS[closest.id] || closest.id) + '</strong><br/>' +
      'Confidence: ' + Math.round((closest.confidence ?? 0) * 100) + '%<br/>' +
      'X: ' + (closest.x ?? 0).toFixed(3) + ' Y: ' + (closest.y ?? 0).toFixed(3) +
      (closest.z != null ? ' Z: ' + closest.z.toFixed(3) : '');
    tooltip.style.display = 'block';
    tooltip.style.left = (e.clientX + 14) + 'px';
    tooltip.style.top = (e.clientY + 14) + 'px';
  } else {
    tooltip.style.display = 'none';
  }
}

function _wireSkeletonOverlay(videoEl, recordingId) {
  if (!videoEl) return;
  let poseSequence = null;
  let wired = false;
  const enableOverlay = async () => {
    if (_mvSkeletonOverlayEnabled && recordingId) {
      poseSequence = await _fetchPoseSequence(recordingId);
      if (poseSequence && _mvSkeletonOverlayEnabled) {
        _startSkeletonAnimation(videoEl, poseSequence);
        const canvas = _ensureSkeletonCanvas(videoEl);
        if (canvas && !wired) {
          wired = true;
          canvas.addEventListener('mousemove', (e) => _handleSkeletonMouseMove(e, canvas, poseSequence, videoEl));
          canvas.addEventListener('mouseleave', () => { if (_mvKpTooltip) _mvKpTooltip.style.display = 'none'; });
        }
      }
    } else {
      _stopSkeletonAnimation();
      _removeSkeletonCanvas(videoEl);
      _removeKpTooltip();
      wired = false;
    }
  };
  enableOverlay();
  return { enableOverlay };
}

/** Inline video player with skeleton overlay canvas */
function _renderSkeletonVideoPlayer(profile) {
  const sv = profile?.source_video || {};
  const rid = sv.recording_id || '';
  if (!rid) return '';
  const videoUrl = sv.video_url || '';
  if (!videoUrl) {
    return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:14px">
      <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Pose visualization</div>
      <div style="font-size:12px;color:var(--text-secondary)">Video URL not available inline — use <strong>Open in Video</strong> to view with skeleton overlay.</div>
    </div>`;
  }
  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:14px" data-skeleton-player-wrap>
    <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Video playback with pose overlay</div>
    <div class="mv-video-canvas-wrap" style="position:relative;width:100%;max-width:640px;border-radius:8px;overflow:hidden;background:#000">
      <video id="mv-skeleton-video" controls playsinline data-recording-id="${esc(rid)}" style="width:100%;display:block" src="${esc(videoUrl)}"></video>
    </div>
    <div style="display:flex;gap:12px;align-items:center;margin-top:8px;font-size:11px;color:var(--text-tertiary)">
      <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:rgba(34,197,94,0.8);margin-right:4px"></span>>90%</span>
      <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:rgba(59,130,246,0.8);margin-right:4px"></span>>70%</span>
      <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:rgba(245,158,11,0.8);margin-right:4px"></span>>50%</span>
      <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:rgba(239,68,68,0.8);margin-right:4px"></span><50%</span>
    </div>
  </div>`;
}

function _renderConfidenceIndicator(confidence, modKey) {
  const confNum = typeof confidence === 'number' ? confidence : null;
  const confPct = confNum != null ? `${Math.round(confNum * 100)}%` : '—';
  let warning = '';
  if (confNum != null && confNum < 0.7) {
    warning = `<div style="margin-top:4px;font-size:11px;color:var(--amber)">⚠ Low confidence — interpret with extra caution. Camera quality or body position may affect accuracy.</div>`;
  } else if (confNum != null && confNum < 0.85) {
    warning = `<div style="margin-top:4px;font-size:11px;color:var(--text-tertiary)">Camera quality or body position may affect accuracy.</div>`;
  }
  const ev = MOVEMENT_BIOMARKER_EVIDENCE[modKey];
  const researchNote = ev?.overall?.grade === 'C'
    ? `<div style="margin-top:4px;font-size:11px;color:var(--amber)">🔬 Research-only signal — limited clinical validation.</div>`
    : ev?.overall?.grade === 'A' && modKey === 'gait'
      ? `<div style="margin-top:4px;font-size:11px;color:var(--green)">✓ Strongest validated video-based biomarker class — still requires clinical confirmation.</div>`
      : '';
  return `<div style="font-size:11px;color:var(--text-tertiary)">Confidence: ${esc(confPct)}${researchNote ? ' · ' + researchNote : ''}</div>${warning}`;
}

function _severity(level) {
  return String(level || '').toLowerCase();
}

function _pillFor(level) {
  const lvl = _severity(level);
  if (lvl === 'red') {
    return '<span class="pill" style="background:rgba(255,107,107,0.12);color:var(--red);border:1px solid rgba(255,107,107,0.25)">Movement cue — review</span>';
  }
  if (lvl === 'amber') {
    return '<span class="pill pill-pending">Elevated cue — review</span>';
  }
  if (lvl === 'green') {
    return '<span class="pill pill-active">Lower concern (model)</span>';
  }
  return '<span class="pill pill-inactive">Unknown / sparse data</span>';
}

function _miniDot(level) {
  const lvl = _severity(level);
  const bg = lvl === 'red' ? 'var(--red)'
    : lvl === 'amber' ? 'var(--amber)'
    : lvl === 'green' ? 'var(--green)'
    : 'var(--text-tertiary)';
  const title = lvl === 'red' ? 'Movement cue — review' : lvl === 'amber' ? 'Elevated cue — review' : lvl === 'green' ? 'Lower concern (model)' : 'Unknown';
  return `<span title="${title}" aria-label="${title}" style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${bg};opacity:${lvl ? 1 : 0.35}"></span>`;
}

function _trendArrow(prevScore, currScore) {
  if (prevScore == null || currScore == null) return '<span style="color:var(--text-tertiary)" title="No prior capture">·</span>';
  const delta = currScore - prevScore;
  if (Math.abs(delta) < 2) return '<span title="Stable (model)" style="color:var(--text-tertiary)">→</span>';
  if (delta > 0) return '<span title="Model signal increased — not worsening diagnosis" style="color:var(--red)">↑</span>';
  return '<span title="Model signal decreased" style="color:var(--green)">↓</span>';
}

function _skeletonChips(n = 5) {
  const chip = '<span style="display:inline-block;width:120px;height:24px;border-radius:12px;background:linear-gradient(90deg,rgba(255,255,255,.04),rgba(255,255,255,.08),rgba(255,255,255,.04));background-size:200% 100%;animation:dh2AttnPulse 1.6s ease-in-out infinite"></span>';
  return `<div style="display:flex;gap:8px;flex-wrap:wrap">${Array.from({ length: n }, () => chip).join('')}</div>`;
}

function _errorCard(message, retryLabel = 'Try again') {
  const safe = esc(message || 'We couldn’t load the movement workspace right now.');
  return `<div role="alert" style="max-width:560px;margin:24px auto;padding:18px 20px;border:1px solid rgba(255,107,107,0.35);background:rgba(255,107,107,0.06);border-radius:12px">
    <div style="font-weight:600;margin-bottom:6px;color:var(--text-primary)">We couldn’t load the movement workspace right now.</div>
    <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;margin-bottom:12px">${safe}</div>
    <button type="button" class="btn btn-ghost btn-sm" data-action="retry" style="min-height:44px">${esc(retryLabel)}</button>
  </div>`;
}

function _prependInlineError(host, message, onRetry, retryLabel = 'Try again') {
  if (!host) return;
  host.querySelector('[data-inline-error="movement"]')?.remove();
  host.insertAdjacentHTML(
    'afterbegin',
    `<div data-inline-error="movement">${_errorCard(message, retryLabel)}</div>`,
  );
  const retryBtn = host.querySelector('[data-inline-error="movement"] [data-action="retry"]');
  retryBtn?.addEventListener('click', () => {
    host.querySelector('[data-inline-error="movement"]')?.remove();
    try { onRetry?.(); } catch {}
  });
}

function _emptyClinicCard() {
  return `<div style="max-width:640px;margin:48px auto;padding:24px;border:1px solid var(--border);border-radius:14px;background:var(--bg-card);text-align:center">
    <div style="font-size:15px;font-weight:600;margin-bottom:8px">No movement workspace rows loaded</div>
    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:14px;line-height:1.5">
      Sparse or absent digital movement signals do <strong>not</strong> rule out clinical movement concerns.
      Select a patient, connect Video / wearables / shared wellness data, or capture tasks per clinic workflow.
    </div>
  </div>`;
}

function _priorScoresFor(prior, modality) {
  if (!Array.isArray(prior)) return [];
  return prior
    .filter((p) => p && p.modality === modality && typeof p.score === 'number')
    .slice()
    .sort((a, b) => String(a.captured_at || '').localeCompare(String(b.captured_at || '')));
}

function _sparkline(points) {
  if (!Array.isArray(points) || points.length < 2) {
    return `<svg viewBox="0 0 120 32" width="120" height="32" style="display:block" aria-hidden="true"></svg>`;
  }
  const w = 120;
  const h = 32;
  const pad = 2;
  const min = 0;
  const max = 100;
  const step = (w - pad * 2) / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = pad + i * step;
    const y = h - pad - ((p.score - min) / (max - min)) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const last = points[points.length - 1];
  const lx = pad + (points.length - 1) * step;
  const ly = h - pad - ((last.score - min) / (max - min)) * (h - pad * 2);
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="display:block;color:var(--text-secondary)" role="img" aria-label="Model score trend across ${points.length} captures">
    <polyline fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" points="${coords}"/>
    <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="1.8" fill="currentColor"/>
  </svg>`;
}

function _modalitySeverityFromSummary(p, mod) {
  const m = p?.modalities?.[mod];
  if (!m) return null;
  return { severity: m.severity || null, score: typeof m.score === 'number' ? m.score : null };
}

function _patientTrendArrow(p) {
  let worst = '·';
  for (const mod of MODALITY_ORDER) {
    const cur = _modalitySeverityFromSummary(p, mod);
    if (!cur || cur.score == null) continue;
    const arrow = _trendArrow(cur.priorScore, cur.score);
    if (arrow.includes('↑')) return arrow;
    if (arrow.includes('↓') && worst === '·') worst = arrow;
  }
  return worst;
}

function _movementCueBanner(severity) {
  const lvl = _severity(severity);
  if (lvl !== 'red' && lvl !== 'amber') return '';
  return `<div role="note" style="font-size:11px;line-height:1.45;padding:8px 10px;border-radius:8px;margin-bottom:8px;background:rgba(155,127,255,0.08);border:1px solid rgba(155,127,255,0.22);color:var(--text-secondary)">
    <strong style="color:var(--text-primary)">Movement-analysis cue — requires clinician review.</strong> Not a diagnosis, fall-risk determination, or treatment eligibility decision.
  </div>`;
}

function _renderClinicTable(rows, sortKey, sortDir) {
  if (!Array.isArray(rows) || !rows.length) return _emptyClinicCard();
  const dir = sortDir === 'asc' ? 1 : -1;
  const rank = (l) => ({ red: 3, amber: 2, green: 1 }[_severity(l)] || 0);
  const worstSeverity = (p) => MODALITY_ORDER.reduce((acc, m) => Math.max(acc, rank(p?.modalities?.[m]?.severity)), 0);

  const sorted = rows.slice();
  sorted.sort((a, b) => {
    if (sortKey === 'name') return String(a.patient_name || '').localeCompare(String(b.patient_name || '')) * dir;
    if (sortKey === 'captured_at') return String(a.captured_at || '').localeCompare(String(b.captured_at || '')) * dir;
    if (sortKey === 'worst') return (worstSeverity(b) - worstSeverity(a)) * (dir === 1 ? 1 : -1);
    if (MODALITY_ORDER.includes(sortKey)) {
      return (rank(b?.modalities?.[sortKey]?.severity) - rank(a?.modalities?.[sortKey]?.severity)) * (dir === 1 ? 1 : -1);
    }
    return 0;
  });

  const sortInd = (k) => k === sortKey ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';
  const th = (key, label, align = 'left') =>
    `<th scope="col" data-sort-key="${esc(key)}" title="Sort by ${esc(label)}" style="padding:8px 8px;text-align:${align};font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border);cursor:pointer;user-select:none">${esc(label)}${sortInd(key)}</th>`;

  const head = `<tr>
    ${th('name', 'Patient')}
    ${th('captured_at', 'Last capture')}
    ${MODALITY_ORDER.map((m) => th(m, `${MODALITY_LABELS[m].replace(' cue', '')} [${MOVEMENT_BIOMARKER_EVIDENCE[m]?.overall?.grade || 'D'}]`, 'center')).join('')}
    <th scope="col" style="padding:8px 8px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)">Trend</th>
    <th scope="col" style="padding:8px 8px;text-align:right;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)"></th>
  </tr>`;

  const body = sorted.map((p) => {
    const when = p.captured_at ? new Date(p.captured_at).toLocaleDateString() : '—';
    const cells = MODALITY_ORDER.map((m) => {
      const sev = p?.modalities?.[m]?.severity;
      return `<td style="padding:10px 8px;text-align:center;border-bottom:1px solid var(--border)">${_miniDot(sev)}</td>`;
    }).join('');
    const trend = _patientTrendArrow(p);
    return `<tr data-patient-id="${esc(p.patient_id)}" tabindex="0" role="button" aria-label="Open movement workspace for ${esc(p.patient_name || 'patient')}" style="cursor:pointer;min-height:44px"
      onmouseover="this.style.background='rgba(255,255,255,.03)'"
      onmouseout="this.style.background='transparent'">
      <td style="padding:10px;border-bottom:1px solid var(--border);font-weight:500">${esc(p.patient_name || 'Unknown')}</td>
      <td style="padding:10px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-secondary)">${esc(when)}</td>
      ${cells}
      <td style="padding:10px 8px;text-align:center;border-bottom:1px solid var(--border);font-size:14px">${trend}</td>
      <td style="padding:10px;text-align:right;border-bottom:1px solid var(--border)">
        <button type="button" class="btn btn-ghost btn-sm" data-action="open-patient" data-patient-id="${esc(p.patient_id)}" style="min-height:44px">Open</button>
      </td>
    </tr>`;
  }).join('');

  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;overflow:auto">
    <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:820px">
      <thead>${head}</thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function _topFactors(modality) {
  const cf = Array.isArray(modality?.contributing_factors) ? modality.contributing_factors : [];
  return cf.slice(0, 3);
}

function _renderModalityCard(modKey, modality, prior) {
  const score = (typeof modality?.score === 'number') ? modality.score : null;
  const sev = modality?.severity;
  const conf = (typeof modality?.confidence === 'number') ? modality.confidence : null;
  const factors = _topFactors(modality);
  const factorsHtml = factors.length
    ? factors.map((f) => `<li style="margin-bottom:4px">${esc(f)}</li>`).join('')
    : '<li style="color:var(--text-tertiary)">No source-backed factors listed — data may be sparse.</li>';
  const series = _priorScoresFor(prior, modKey);
  const trend = series.length >= 2
    ? _trendArrow(series[series.length - 2].score, series[series.length - 1].score)
    : '<span style="color:var(--text-tertiary)" title="No prior capture">·</span>';
  const cueBanner = _movementCueBanner(sev);
  const ev = MOVEMENT_BIOMARKER_EVIDENCE[modKey];
  const grade = ev?.overall?.grade || 'D';
  const evidenceBadge = _renderEvidenceBadge(grade);
  const safeWording = _renderSafeWording(modKey);
  const confidenceBlock = _renderConfidenceIndicator(conf, modKey);
  const confDisplay = conf != null ? `${Math.round(conf * 100)}%` : '—';

  return `<div data-modality="${esc(modKey)}" style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px;min-height:240px">
    ${cueBanner}
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
      <div>
        <h3 style="margin:0;font-weight:600;font-size:13px;display:flex;align-items:center;gap:8px">${esc(MODALITY_LABELS[modKey] || modKey)} ${evidenceBadge}</h3>
        <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">${esc(MODALITY_TIPS[modKey] || '')}</div>
      </div>
      <div>${_pillFor(sev)}</div>
    </div>
    ${safeWording}
    <div style="display:flex;align-items:baseline;gap:10px">
      <div style="font-size:22px;font-weight:600;font-variant-numeric:tabular-nums" aria-label="Model composite score">${score == null ? '—' : esc(String(score))}</div>
      <div style="font-size:11px;color:var(--text-tertiary)">composite (0–100) · uncertainty ${esc(confDisplay)} · ${trend}</div>
    </div>
    ${confidenceBlock}
    <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;margin-top:4px">Source factors / labels</div>
    <ul style="margin:0;padding-left:16px;font-size:12px;line-height:1.5;color:var(--text-secondary)">${factorsHtml}</ul>
    <div style="margin-top:auto">${_sparkline(series)}</div>
  </div>`;
}

function _renderSourceVideoPanel(profile, navigate) {
  const sv = profile?.source_video || {};
  const rid = sv.recording_id || '';
  const dur = (typeof sv.duration_seconds === 'number') ? `${Math.floor(sv.duration_seconds / 60)}m ${sv.duration_seconds % 60}s` : '—';
  const when = sv.captured_at ? new Date(sv.captured_at).toLocaleString() : '—';
  const metaNote = !rid && sv.captured_at
    ? '<div style="font-size:11px;color:var(--amber);margin-top:6px">Video analysis metadata present; recording ID not linked — open Video Analyzer from the patient or timeline.</div>'
    : '';
  const linkHtml = rid
    ? `<button type="button" class="btn btn-ghost btn-sm" data-action="open-recording" data-recording-id="${esc(rid)}" style="min-height:44px;display:inline-flex;align-items:center;gap:6px" title="Open in Video Assessments">Open in Video</button>`
    : `<span class="btn btn-ghost btn-sm" title="No recording id on file — use Video Analyzer to locate captures" aria-disabled="true" style="min-height:44px;opacity:.6;cursor:not-allowed">Open in Video</span>`;
  const hasPose = rid && profile?.pose_sequence;
  const heatmapHtml = hasPose
    ? `<div style="margin-top:10px">
        <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Confidence heatmap (keypoint × time)</div>
        <canvas id="mv-pose-heatmap" width="600" height="240" style="width:100%;max-width:600px;height:240px;border-radius:8px;background:#0b0b0b;border:1px solid var(--border)"></canvas>
        <div style="display:flex;gap:12px;align-items:center;margin-top:6px;font-size:10px;color:var(--text-tertiary)">
          <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:rgba(34,197,94,0.8);margin-right:4px"></span>>90%</span>
          <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:rgba(59,130,246,0.8);margin-right:4px"></span>>70%</span>
          <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:rgba(245,158,11,0.8);margin-right:4px"></span>>50%</span>
          <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:rgba(239,68,68,0.8);margin-right:4px"></span><50%</span>
        </div>
      </div>`
    : '';
  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
    <div style="flex:1;min-width:260px">
      <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Video / posture source</div>
      <div style="font-size:13px;font-weight:600">${rid ? esc(rid) : '— (metadata only)'}</div>
      <div style="font-size:11px;color:var(--text-secondary);margin-top:2px">${esc(when)} · duration ${esc(dur)}</div>
      ${metaNote}
      ${heatmapHtml}
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">${linkHtml}
      <button type="button" class="btn btn-ghost btn-sm" data-action="go-video-assessments" style="min-height:44px" title="Upload or record tasks in Video Assessments">Video Assessments</button>
    </div>
  </div>`;
}

function _renderWorkflowNav(patientId, usingFixtures) {
  const pid = patientId || '';
  const dis = !pid ? 'disabled' : '';
  const titleWear = usingFixtures ? 'Demo — use live API for device sync' : 'Biometrics / wearables summaries';
  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px">
    <h3 style="margin:0 0 8px;font-size:13px;font-weight:600">Capture &amp; import</h3>
    <p style="margin:0 0 10px;font-size:11px;color:var(--text-secondary)">Uploads and device sync use existing clinic modules — this page aggregates signals for review only.</p>
    <div style="display:flex;flex-wrap:wrap;gap:8px">
      <button type="button" class="btn btn-ghost btn-sm" data-action="go-video-assessments" style="min-height:44px">Upload / record video</button>
      <button type="button" class="btn btn-ghost btn-sm" data-action="go-wearables" ${dis} style="min-height:44px;${!pid ? 'opacity:.55' : ''}" title="${esc(titleWear)}">Wearables / IMU</button>
      <button type="button" class="btn btn-ghost btn-sm" data-action="go-documents" ${dis} style="min-height:44px;${!pid ? 'opacity:.55' : ''}" title="Patient documents">Documents</button>
    </div>
  </div>`;
}

function _renderDataAvailability(profile) {
  const sources = Array.isArray(profile?.signal_sources) ? profile.signal_sources : [];
  const comp = profile?.completeness?.overall;
  const gen = profile?.generated_at ? new Date(profile.generated_at).toLocaleString() : '—';
  if (!sources.length) {
    return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px">
      <h3 style="margin:0 0 8px;font-size:13px;font-weight:600">Data availability</h3>
      <p style="margin:0;font-size:12px;color:var(--text-secondary)">No signal-source rows in this payload. Workspace generated: ${esc(gen)}${comp != null ? ` · completeness ${Math.round(Number(comp) * 100)}%` : ''}.</p>
    </div>`;
  }
  const rows = sources.map((s) => {
    const qc = Array.isArray(s.qc_flags) && s.qc_flags.length ? esc(s.qc_flags.join(', ')) : '—';
    const conf = typeof s.confidence === 'number' ? `${Math.round(s.confidence * 100)}%` : '—';
    const last = s.last_received_at ? new Date(s.last_received_at).toLocaleString() : '—';
    return `<tr>
      <td style="padding:8px;border-bottom:1px solid var(--border);font-size:12px">${esc(s.source_id || '—')}</td>
      <td style="padding:8px;border-bottom:1px solid var(--border);font-size:12px">${esc(s.source_modality || '—')}</td>
      <td style="padding:8px;border-bottom:1px solid var(--border);font-size:12px">${last}</td>
      <td style="padding:8px;border-bottom:1px solid var(--border);font-size:12px">${conf}</td>
      <td style="padding:8px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-secondary)">${qc}</td>
    </tr>`;
  }).join('');
  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px;overflow:auto">
    <h3 style="margin:0 0 10px;font-size:13px;font-weight:600">Data availability matrix</h3>
    <p style="margin:0 0 10px;font-size:11px;color:var(--text-secondary)">Generated ${esc(gen)}${comp != null ? ` · workspace completeness ~${Math.round(Number(comp) * 100)}%` : ''}. Missing streams reduce confidence — they do not imply “all clear.”</p>
    <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:640px">
      <thead><tr>
        <th scope="col" style="text-align:left;padding:8px;border-bottom:1px solid var(--border);font-size:10px;color:var(--text-tertiary)">Source</th>
        <th scope="col" style="text-align:left;padding:8px;border-bottom:1px solid var(--border);font-size:10px;color:var(--text-tertiary)">Modality</th>
        <th scope="col" style="text-align:left;padding:8px;border-bottom:1px solid var(--border);font-size:10px;color:var(--text-tertiary)">Last received</th>
        <th scope="col" style="text-align:left;padding:8px;border-bottom:1px solid var(--border);font-size:10px;color:var(--text-tertiary)">Confidence</th>
        <th scope="col" style="text-align:left;padding:8px;border-bottom:1px solid var(--border);font-size:10px;color:var(--text-tertiary)">QC / gaps</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function _renderFlags(profile) {
  const flags = Array.isArray(profile?.flags) ? profile.flags : [];
  if (!flags.length) {
    return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px">
      <h3 style="margin:0 0 8px;font-size:13px;font-weight:600">Movement cues / flags</h3>
      <p style="margin:0;font-size:12px;color:var(--text-secondary)">No rule-based flags in this snapshot — absence does not exclude clinical concern.</p>
    </div>`;
  }
  const items = flags.map((f) => `<li style="margin-bottom:10px;font-size:12px;line-height:1.5;color:var(--text-secondary)">
    <strong style="color:var(--text-primary)">${esc(f.title || f.flag_id || 'Flag')}</strong>
    ${f.detail ? `<div>${esc(f.detail)}</div>` : ''}
    <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">Movement-analysis cue — requires clinician review · confidence ${typeof f.confidence === 'number' ? `${Math.round(f.confidence * 100)}%` : '—'}</div>
  </li>`).join('');
  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px">
    <h3 style="margin:0 0 10px;font-size:13px;font-weight:600">Movement cues / flags</h3>
    <ul style="margin:0;padding-left:18px">${items}</ul>
  </div>`;
}

function _renderGovernance(profile) {
  const disc = profile?.clinical_disclaimer || 'Decision-support only; clinician interpretation required.';
  const interp = profile?.clinical_interpretation;
  const hypo = Array.isArray(interp?.hypotheses) ? interp.hypotheses : [];
  const hypoHtml = hypo.length
    ? hypo.map((h) => `<li style="margin-bottom:8px;font-size:12px;color:var(--text-secondary)">${esc(h.statement || '')}${h.caveat ? `<div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">${esc(h.caveat)}</div>` : ''}</li>`).join('')
    : '<li style="font-size:12px;color:var(--text-secondary)">Movement-analysis rules require clinic governance review where institutional policy applies.</li>';
  const evidence = Array.isArray(profile?.evidence_links) ? profile.evidence_links : [];
  const evHtml = evidence.length
    ? evidence.slice(0, 6).map((e) => `<li style="font-size:11px;color:var(--text-secondary);margin-bottom:6px"><strong>${esc(e.title || e.id)}</strong> (${esc(e.source_type || 'rule')}) — ${esc(e.snippet || '')}</li>`).join('')
    : '<li style="font-size:12px;color:var(--text-secondary)">No linked evidence snippets in payload — cite clinic policy and primary literature at the point of care.</li>';

  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px">
    <h3 style="margin:0 0 8px;font-size:13px;font-weight:600">Evidence / governance</h3>
    <p style="margin:0 0 10px;font-size:12px;color:var(--text-secondary)">${esc(disc)}</p>
    <div style="font-size:11px;font-weight:600;color:var(--text-tertiary);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">Interpretation hypotheses</div>
    <ul style="margin:0 0 12px;padding-left:18px">${hypoHtml}</ul>
    <div style="font-size:11px;font-weight:600;color:var(--text-tertiary);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">Evidence links (workspace)</div>
    <ul style="margin:0;padding-left:18px">${evHtml}</ul>
  </div>`;
}

function _renderLinkedModules(profile, patientId) {
  const links = Array.isArray(profile?.multimodal_links) ? profile.multimodal_links : [];
  const extra = [
    { nav: 'patient-profile', label: 'Patient profile', title: 'Open patient chart' },
    { nav: 'protocol-studio', label: 'Protocol Studio', title: 'Draft protocol context only — not auto-approved from movement' },
    { nav: 'brainmap-v2', label: 'Brain Map Planner', title: 'Planning context' },
    { nav: 'biomarkers', label: 'Biomarkers', title: 'Labs / biomarkers' },
    { nav: 'documents-v2', label: 'Documents', title: 'Clinical documents' },
    { nav: 'schedule-v2', label: 'Schedule', title: 'Calendar' },
    { nav: 'clinician-inbox', label: 'Inbox', title: 'Workflow inbox' },
    { nav: 'monitor', label: 'Devices / monitor', title: 'Wearables & devices hub' },
    { nav: 'session-execution', label: 'Live session', title: 'Session execution' },
  ];
  const fromPayload = links.map((l) => {
    const page = analyzerIdToNavPage(l.analyzer_id);
    if (!page) return '';
    return `<button type="button" class="btn btn-ghost btn-sm" data-action="nav-module" data-nav-page="${esc(page)}" style="min-height:40px" title="${esc(l.relation || 'Linked analyzer')}">${esc(l.label || page)}</button>`;
  }).join('');
  const hardcoded = extra.map((x) =>
    `<button type="button" class="btn btn-ghost btn-sm" data-action="nav-module" data-nav-page="${esc(x.nav)}" style="min-height:40px" title="${esc(x.title)}">${esc(x.label)}</button>`
  ).join('');
  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px">
    <h3 style="margin:0 0 8px;font-size:13px;font-weight:600">Linked modules</h3>
    <p style="margin:0 0 10px;font-size:11px;color:var(--text-secondary)">Navigation opens the selected workspace for <strong>review context</strong> — not automated protocol matching, eligibility, or treatment selection.</p>
    <div style="display:flex;flex-wrap:wrap;gap:8px">${fromPayload}${hardcoded}</div>
  </div>`;
}

function _renderAiSummary(profile) {
  const snap = profile?.snapshot || {};
  const summary = snap.phenotype_summary || profile?.clinical_interpretation?.summary || '';
  const oc = snap.overall_concern;
  const oconf = snap.overall_confidence;
  if (!summary && oc == null) {
    return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px">
      <h3 style="margin:0 0 8px;font-size:13px;font-weight:600">AI-assisted / multimodal summary</h3>
      <p style="margin:0;font-size:12px;color:var(--text-secondary)">No summary block returned — sources may be sparse.</p>
    </div>`;
  }
  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px">
    <h3 style="margin:0 0 8px;font-size:13px;font-weight:600">AI-assisted / multimodal summary</h3>
    <p style="margin:0 0 8px;font-size:12px;color:var(--text-secondary);line-height:1.5">${esc(summary || '')}</p>
    <div style="font-size:11px;color:var(--text-tertiary)">Overall trajectory context: ${esc(oc || '—')} · confidence ${oconf != null ? esc(String(oconf)) : '—'} · requires clinician review</div>
  </div>`;
}

function _renderRecommendations(profile) {
  const recs = Array.isArray(profile?.recommendations) ? profile.recommendations : [];
  if (!recs.length) return '';
  const items = recs.map((r) => `<li style="font-size:12px;color:var(--text-secondary);margin-bottom:8px">
    <strong style="color:var(--text-primary)">${esc(r.kind || 'review')}</strong> — ${esc(r.rationale || '')}
    <span style="font-size:11px;color:var(--text-tertiary)"> (priority ${esc(r.priority || '—')} · not a treatment directive)</span>
  </li>`).join('');
  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px">
    <h3 style="margin:0 0 8px;font-size:13px;font-weight:600">Suggested review actions (workspace)</h3>
    <ul style="margin:0;padding-left:18px">${items}</ul>
    <p style="margin:8px 0 0;font-size:11px;color:var(--text-tertiary)">These are documentation prompts for clinician follow-up — not protocol approval or medication changes.</p>
  </div>`;
}

function _renderAnnotationForm(demoLocalOnly) {
  const hint = demoLocalOnly
    ? '<p style="margin:0 0 8px;font-size:11px;color:var(--amber)">Demo session: annotations are stored in-browser for this sample only — not persisted to the clinic record.</p>'
    : '';
  return `<form data-annotation-form style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px">
    <div style="font-weight:600;font-size:13px">Clinician note (audit trail)</div>
    ${hint}
    <textarea name="note" class="form-control" rows="3" placeholder="Clinical observation (required to save). Describe exam findings, medication context, or review rationale — not an autonomous diagnosis." style="min-height:72px;width:100%" aria-label="Clinician annotation note"></textarea>
    <div style="display:flex;gap:8px;align-items:center;justify-content:flex-end">
      <span data-form-error style="color:var(--red);font-size:11px;margin-right:auto"></span>
      <button type="submit" class="btn btn-primary btn-sm" style="min-height:44px">Save note to audit trail</button>
    </div>
  </form>`;
}

function _renderAuditPanel(audit, demoLabel) {
  const items = Array.isArray(audit?.items) ? audit.items : [];
  const banner = demoLabel
    ? `<div style="font-size:11px;color:var(--amber);margin-bottom:8px">${esc(demoLabel)}</div>`
    : '';
  if (!items.length) {
    return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px">
      <div style="font-weight:600;font-size:13px;margin-bottom:8px">Audit trail</div>
      ${banner}
      <div style="font-size:12px;color:var(--text-tertiary)">No recomputes or annotations recorded yet — absence does not imply review occurred.</div>
    </div>`;
  }
  const sorted = items.slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  const rows = sorted.map((it) => {
    const when = it.created_at ? new Date(it.created_at).toLocaleString() : '—';
    const kind = String(it.kind || 'event').toLowerCase();
    let tag = '<span class="pill pill-active" style="font-size:10px;padding:2px 8px">Event</span>';
    if (kind === 'recompute') {
      tag = '<span class="pill pill-inactive" style="font-size:10px;padding:2px 8px">Recompute</span>';
    } else if (kind === 'annotation' || kind === 'annotate') {
      tag = '<span class="pill pill-active" style="font-size:10px;padding:2px 8px">Note</span>';
    } else if (kind === 'review_ack') {
      tag = '<span class="pill" style="font-size:10px;padding:2px 8px;background:rgba(155,127,255,0.12);border:1px solid rgba(155,127,255,0.25)">Review ack</span>';
    } else if (kind === 'export_download') {
      tag = '<span class="pill pill-inactive" style="font-size:10px;padding:2px 8px">Export</span>';
    }
    const actor = it.actor && String(it.actor).length < 40 ? it.actor : (it.actor_id || '—');
    return `<li style="padding:8px 10px;border-bottom:1px solid var(--border);font-size:12px;display:flex;flex-direction:column;gap:2px">
      <div style="display:flex;gap:8px;align-items:center;justify-content:space-between">
        <div style="display:flex;gap:8px;align-items:center">${tag}<span style="color:var(--text-tertiary);font-size:11px">${esc(actor)}</span></div>
        <span style="color:var(--text-tertiary);white-space:nowrap;font-size:11px">${esc(when)}</span>
      </div>
      <div style="color:var(--text-secondary);line-height:1.5">${esc(it.message || '')}</div>
    </li>`;
  }).join('');
  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px">
    <div style="font-weight:600;font-size:13px;margin-bottom:8px">Audit trail</div>
    ${banner}
    <ul style="list-style:none;margin:0;padding:0">${rows}</ul>
  </div>`;
}

function _renderPatientDetail(profile, audit, navigate, opts) {
  const optsSafe = opts || {};
  const captured = profile?.captured_at ? new Date(profile.captured_at).toLocaleString() : 'Not yet captured.';
  const staleNote = profile?.generated_at
    ? `<span style="font-size:11px;color:var(--text-tertiary)">Workspace generated: ${esc(new Date(profile.generated_at).toLocaleString())}</span>`
    : '';
  const cards = MODALITY_ORDER.map((m) => _renderModalityCard(m, profile?.modalities?.[m], profile?.prior_scores)).join('');
  const recomputeBtn = optsSafe.usingFixtures
    ? `<button type="button" class="btn btn-ghost btn-sm" data-action="recompute" disabled title="Demo sample — recomputation is not persisted" style="min-height:44px;opacity:.7">Recompute (disabled in demo)</button>`
    : `<button type="button" class="btn btn-ghost btn-sm" data-action="recompute" style="min-height:44px">Recompute workspace</button>`;
  const exportBtn = optsSafe.usingFixtures
    ? `<button type="button" class="btn btn-ghost btn-sm" data-action="export-json" disabled title="Export requires a live API session" style="min-height:44px;opacity:.65">Export JSON</button>`
    : `<button type="button" class="btn btn-ghost btn-sm" data-action="export-json" style="min-height:44px" title="Download workspace JSON (audit logged)">Export JSON</button>`;

  return `<section aria-label="Patient movement workspace">
    <div style="padding:10px 12px;border-radius:10px;border:1px solid rgba(239,68,68,0.35);background:rgba(239,68,68,0.06);margin-bottom:14px;font-size:11px;line-height:1.6;color:var(--text-secondary)">
      <strong style="color:var(--red)">⚠ ${esc(MOVEMENT_CRITICAL_SAFETY)}</strong>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin:12px 0 14px;flex-wrap:wrap">
      <div>
        <div style="font-size:12px;color:var(--text-tertiary)">Last capture reference: ${esc(captured)}</div>
        ${staleNote ? `<div style="margin-top:4px">${staleNote}</div>` : ''}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${recomputeBtn}
        ${exportBtn}
        <button type="button" class="btn btn-ghost btn-sm" data-action="refresh-patient" style="min-height:44px">Refresh</button>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;margin-bottom:14px">${cards}</div>
    <div style="display:grid;grid-template-columns:1fr;gap:14px">
      ${_renderWorkflowNav(optsSafe.patientId, !!optsSafe.usingFixtures)}
      ${_renderAiSummary(profile)}
      ${_renderDataAvailability(profile)}
      ${_renderFlags(profile)}
      ${_renderSkeletonVideoPlayer(profile)}
      ${_renderSourceVideoPanel(profile, navigate)}
      ${_renderRecommendations(profile)}
      ${_renderGovernance(profile)}
      ${_renderLinkedModules(profile, optsSafe.patientId)}
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px">
        <h3 style="margin:0 0 8px;font-size:13px;font-weight:600">Clinician review acknowledgment</h3>
        <p style="margin:0 0 10px;font-size:11px;color:var(--text-secondary)">Records that you reviewed this workspace (audit only — not a legal sign-off). Requires a short note.</p>
        <form data-review-ack-form style="display:flex;flex-direction:column;gap:10px">
          <textarea name="review_note" class="form-control" rows="2" placeholder="e.g. Reviewed cues with patient; correlate with exam." style="min-height:56px;width:100%" aria-label="Review acknowledgment note"></textarea>
          <div style="display:flex;gap:8px;align-items:center;justify-content:flex-end;flex-wrap:wrap">
            <span data-review-form-error style="color:var(--red);font-size:11px;margin-right:auto"></span>
            <button type="submit" class="btn btn-secondary btn-sm" data-action="review-submit" style="min-height:44px">Mark workspace reviewed</button>
          </div>
        </form>
      </div>
      ${_renderAnnotationForm(!!optsSafe.demoAnnotationLocal)}
      ${_renderAuditPanel(audit, optsSafe.auditDemoLabel)}
    </div>
  </section>`;
}

function _patientDisplayName(p) {
  if (!p) return '';
  const fn = (p.first_name || '').trim();
  const ln = (p.last_name || '').trim();
  const joined = `${fn} ${ln}`.trim();
  return joined || p.patient_name || p.name || '';
}

function _enrichPatientName(p) {
  const personas = ANALYZER_DEMO_FIXTURES?.patients || [];
  if (p.patient_name) return p;
  const match = personas.find((x) => x.id === p.patient_id);
  return { ...p, patient_name: match ? match.name : p.patient_id };
}

async function _loadClinicSummaryFromApi() {
  let list = [];
  try {
    const res = await api.listPatients({ limit: 200, sort: 'last_activity' });
    list = res?.items || (Array.isArray(res) ? res : []) || [];
  } catch {
    list = [];
  }
  const ids = list.map((p) => p.id).filter(Boolean);
  const results = await Promise.all(
    ids.map((pid) => api.getMovementProfile(pid).then((r) => r).catch(() => null))
  );
  const byId = new Map();
  list.forEach((rec, i) => {
    const prof = results[i];
    if (!prof || !prof.patient_id) return;
    const name = _patientDisplayName(rec) || prof.patient_name || rec.id;
    const row = { ...prof, patient_id: rec.id, patient_name: name };
    byId.set(rec.id, _enrichPatientName(row));
  });
  return { patients: Array.from(byId.values()), roster: list };
}

// ── AI Safety: Bias Disclosure ────────────────────────────────────────────
function _renderBiasDisclosureMv(biasVisible) {
  if (!biasVisible) {
    return `<button type="button" class="btn btn-ghost btn-sm" id="mv-show-bias" style="min-height:44px" title="Show AI bias and limitations disclosure">&#9888; Bias & Limitations</button>`;
  }
  return `<div style="background:rgba(246,178,60,0.06);border:1px solid rgba(246,178,60,0.3);border-radius:12px;padding:14px;margin-bottom:14px;position:relative">
    <button type="button" id="mv-hide-bias" style="position:absolute;top:10px;right:10px;background:none;border:none;cursor:pointer;font-size:16px;color:var(--text-secondary)" title="Close">&#10005;</button>
    <h3 style="margin:0 0 10px;font-size:13px;font-weight:600;color:var(--amber)">&#9888; AI Bias & Limitations Disclosure</h3>
    <p style="margin:0 0 8px;font-size:11px;color:var(--text-secondary);line-height:1.5">Movement analysis systems have known limitations. All outputs require clinician confirmation.</p>
    <ul style="margin:0 0 10px;padding-left:18px;font-size:12px;color:var(--text-secondary);line-height:1.7">
      <li><strong>Skin tone, age, body type:</strong> Pose estimation accuracy varies by skin tone, age, and body type.</li>
      <li><strong>Camera angle and distance:</strong> Camera angle and distance affect measurement accuracy.</li>
      <li><strong>Lighting conditions:</strong> Lighting conditions can introduce artifacts.</li>
      <li><strong>Clothing types:</strong> Different clothing types may obscure body landmarks.</li>
    </ul>
    <p style="margin:0;font-size:11px;color:var(--text-tertiary)">References: peer-reviewed pose-estimation fairness literature. Clinician review required.</p>
  </div>`;
}

// ── Evidence Panel ────────────────────────────────────────────────────────
function _renderEvidencePanelMv(evidenceVisible, profile) {
  if (!evidenceVisible) return '';
  const modalities = profile?.modalities || {};
  const flags = Array.isArray(profile?.flags) ? profile.flags : [];
  const evidence = Array.isArray(profile?.evidence_links) ? profile.evidence_links : [];
  const interp = profile?.clinical_interpretation;
  const hypotheses = Array.isArray(interp?.hypotheses) ? interp.hypotheses : [];
  const modRows = Object.entries(modalities).map(([key, m]) => {
    const sev = m?.severity || 'unknown';
    const score = typeof m?.score === 'number' ? m.score : null;
    const conf = typeof m?.confidence === 'number' ? `${Math.round(m.confidence * 100)}%` : '—';
    const grade = sev === 'red' ? 'C-grade (model cue)' : sev === 'amber' ? 'B-grade (elevated)' : sev === 'green' ? 'A-grade (lower concern)' : 'Ungraded';
    const safeWording = sev === 'red'
      ? 'Movement cue detected - requires clinician review. Not a diagnosis.'
      : sev === 'amber' ? 'Elevated movement signal - correlate with clinical exam.'
      : sev === 'green' ? 'Lower model concern - does not exclude clinical pathology.'
      : 'Insufficient data for grading.';
    return `<tr>
      <td style="padding:8px;border-bottom:1px solid var(--border);font-size:12px"><strong>${esc(MODALITY_LABELS[key] || key)}</strong></td>
      <td style="padding:8px;border-bottom:1px solid var(--border);font-size:12px">${esc(grade)}</td>
      <td style="padding:8px;border-bottom:1px solid var(--border);font-size:12px">${score !== null ? esc(String(score)) : '—'}</td>
      <td style="padding:8px;border-bottom:1px solid var(--border);font-size:12px">${esc(conf)}</td>
      <td style="padding:8px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-secondary)">${esc(safeWording)}</td>
    </tr>`;
  }).join('');
  const litRefs = evidence.length
    ? evidence.slice(0, 6).map((e) => `<li style="font-size:11px;color:var(--text-secondary);margin-bottom:6px"><strong>${esc(e.title || e.id)}</strong> (${esc(e.source_type || 'rule')}) - ${esc(e.snippet || '')}</li>`).join('')
    : '<li style="font-size:12px;color:var(--text-secondary)">No linked evidence snippets - cite clinic policy and primary literature at the point of care.</li>';
  const hypoItems = hypotheses.length
    ? hypotheses.map((h) => `<li style="margin-bottom:8px;font-size:12px;color:var(--text-secondary)">${esc(h.statement || '')}${h.caveat ? `<div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">${esc(h.caveat)}</div>` : ''}</li>`).join('')
    : '<li style="font-size:12px;color:var(--text-secondary)">No hypotheses generated - clinical interpretation required.</li>';
  const flagItems = flags.length
    ? flags.map((f) => `<li style="margin-bottom:8px;font-size:12px;color:var(--text-secondary)"><strong>${esc(f.title || f.flag_id || 'Flag')}</strong> - confidence ${typeof f.confidence === 'number' ? `${Math.round(f.confidence * 100)}%` : '—'}</li>`).join('')
    : '<li style="font-size:12px;color:var(--text-secondary)">No flags in this snapshot.</li>';
  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:14px;margin-bottom:14px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h3 style="margin:0;font-size:13px;font-weight:600">Evidence Panel</h3>
      <button type="button" class="btn btn-ghost btn-sm" id="mv-hide-evidence" style="min-height:36px">Hide</button>
    </div>
    <p style="margin:0 0 12px;font-size:11px;color:var(--text-tertiary)">Biomarker evidence grades, confidence scores, and safe clinical wording for decision support.</p>
    <div style="overflow:auto;margin-bottom:14px">
      <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:700px">
        <thead><tr>
          <th style="text-align:left;padding:8px;border-bottom:1px solid var(--border);font-size:10px;color:var(--text-tertiary)">Modality</th>
          <th style="text-align:left;padding:8px;border-bottom:1px solid var(--border);font-size:10px;color:var(--text-tertiary)">Evidence grade</th>
          <th style="text-align:left;padding:8px;border-bottom:1px solid var(--border);font-size:10px;color:var(--text-tertiary)">Score</th>
          <th style="text-align:left;padding:8px;border-bottom:1px solid var(--border);font-size:10px;color:var(--text-tertiary)">Confidence</th>
          <th style="text-align:left;padding:8px;border-bottom:1px solid var(--border);font-size:10px;color:var(--text-tertiary)">Safe clinical wording</th>
        </tr></thead>
        <tbody>${modRows}</tbody>
      </table>
    </div>
    <div style="display:grid;gap:14px">
      <div>
        <div style="font-size:11px;font-weight:600;color:var(--text-tertiary);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">Literature references</div>
        <ul style="margin:0;padding-left:18px">${litRefs}</ul>
      </div>
      <div>
        <div style="font-size:11px;font-weight:600;color:var(--text-tertiary);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">Interpretation hypotheses</div>
        <ul style="margin:0;padding-left:18px">${hypoItems}</ul>
      </div>
      <div>
        <div style="font-size:11px;font-weight:600;color:var(--text-tertiary);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">Movement cues / flags</div>
        <ul style="margin:0;padding-left:18px">${flagItems}</ul>
      </div>
    </div>
    <p style="margin:12px 0 0;font-size:11px;color:var(--text-tertiary)">All grades are decision-support cues - not autonomous diagnosis or treatment directives.</p>
  </div>`;
}

// ── Keyboard Shortcuts Help ───────────────────────────────────────────────
function _renderKeyboardHelpMv(visible) {
  if (!visible) return '';
  const shortcuts = [
    { key: 'Space', action: 'Play / pause video' },
    { key: '&larr; / &rarr;', action: 'Seek back / forward 5 seconds' },
    { key: 'Shift + &larr; / &rarr;', action: 'Seek back / forward 1 second (fine)' },
    { key: '&uarr; / &darr;', action: 'Increase / decrease playback speed' },
    { key: 'A', action: 'Add annotation at current time' },
    { key: 'C', action: 'Toggle comparison view' },
    { key: 'F', action: 'Toggle fullscreen' },
    { key: 'S', action: 'Toggle skeleton overlay' },
    { key: 'E', action: 'Toggle evidence panel' },
    { key: '?', action: 'Show / hide this help' },
  ];
  const rows = shortcuts.map((s) => `<tr><td style="padding:4px 8px;font-family:monospace;font-size:12px;color:var(--text-primary);white-space:nowrap">${esc(s.key)}</td><td style="padding:4px 8px;font-size:12px;color:var(--text-secondary)">${esc(s.action)}</td></tr>`).join('');
  return `<div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999;background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,.4);max-width:420px;width:90vw">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h3 style="margin:0;font-size:14px;font-weight:600">Keyboard Shortcuts</h3>
      <button type="button" id="mv-close-kb-help" style="background:none;border:none;cursor:pointer;font-size:16px;color:var(--text-secondary)">&#10005;</button>
    </div>
    <p style="margin:0 0 10px;font-size:11px;color:var(--text-tertiary)">ELAN-style video review shortcuts for efficient movement analysis.</p>
    <table style="width:100%;border-collapse:collapse">${rows}</table>
    <p style="margin:10px 0 0;font-size:11px;color:var(--text-tertiary)">Press <kbd style="font-family:monospace;background:rgba(255,255,255,.06);padding:2px 6px;border-radius:4px">?</kbd> to close.</p>
  </div>`;
}

// ── Side-by-Side Comparison View ──────────────────────────────────────────
function _renderComparisonViewMv(profile) {
  const comparisonModes = [
    { id: 'current_prior', label: 'Current vs prior session' },
    { id: 'left_right', label: 'Left vs right side' },
    { id: 'baseline_followup', label: 'Baseline vs follow-up' },
  ];
  const modeButtons = comparisonModes.map((m) => `<button type="button" class="btn btn-ghost btn-sm" data-compare-mode="${esc(m.id)}" style="min-height:36px">${esc(m.label)}</button>`).join('');
  const prior = Array.isArray(profile?.prior_scores) ? profile.prior_scores : [];
  const hasPrior = prior.length > 0;
  return `<div style="margin-bottom:14px;padding:14px;background:var(--bg-card);border:1px solid var(--border);border-radius:14px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <h3 style="margin:0;font-size:13px;font-weight:600">Side-by-side comparison</h3>
      <button type="button" class="btn btn-ghost btn-sm" id="mv-hide-compare" style="min-height:36px">Close</button>
    </div>
    <p style="margin:0 0 10px;font-size:11px;color:var(--text-tertiary)">Compare movement across sessions or sides for asymmetry and longitudinal assessment.</p>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px">${modeButtons}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div>
        <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">Current capture</div>
        <div style="width:100%;height:200px;border-radius:8px;background:var(--bg-card);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--text-tertiary)">Current session data</div>
      </div>
      <div>
        <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">Comparison</div>
        <div style="width:100%;height:200px;border-radius:8px;background:var(--bg-card);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--text-tertiary);flex-direction:column;gap:8px">
          <span>${hasPrior ? esc(String(prior.length)) + ' prior capture(s) available' : 'No prior captures loaded'}</span>
          <span style="font-size:11px">Select a comparison mode above</span>
        </div>
      </div>
    </div>
    <p style="margin:10px 0 0;font-size:11px;color:var(--text-tertiary)">Comparison is for clinician review only - not an automated asymmetry diagnosis.</p>
  </div>`;
}

export async function pgMovementAnalyzer(setTopbar, navigate) {
  try {
    setTopbar({
      title: 'Movement Analyzer',
      subtitle: MOVEMENT_CLINICAL_QUESTION,
    });
  } catch {
    try { setTopbar('Movement Analyzer', 'Motor decision support'); } catch {}
  }

  const el = document.getElementById('content');
  if (!el) return;

  const demoMode = isDemoSession();
  let actorRole = null;
  if (!demoMode) {
    try {
      const me = await api.me();
      actorRole = me?.role || me?.user?.role || null;
    } catch {
      actorRole = null;
    }
    if (!canUseMovementAnalyzerWorkspace(actorRole)) {
      el.innerHTML = _renderMovementAnalyzerRestrictedCard();
      return;
    }
  }

  let view = 'clinic';
  let summaryCache = null;
  let rosterCache = [];
  let activePatientId = null;
  let activePatientName = '';
  let profileCache = null;
  let auditCache = null;
  let sortKey = 'worst';
  let sortDir = 'desc';
  let usingFixtures = false;
  let demoAnnotationLocal = false;

  // AI Safety + UX state
  let biasDisclosureVisible = false;
  let evidencePanelVisible = false;
  let keyboardHelpVisible = false;
  let comparisonViewVisible = false;
  let skeletonOverlay = false;
  let playbackSpeed = 1.0;
  const MV_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
  let keyboardBound = false;

  el.innerHTML = `
    <div class="ds-movement-analyzer-shell" style="max-width:1100px;margin:0 auto;padding:16px 20px 48px">
      <div id="mv-demo-banner"></div>
      <div id="mv-dr-hero-slot">${drHero({ question: MOVEMENT_CLINICAL_QUESTION, howToRead: MOVEMENT_HOW_TO_READ, flagCount: 0 })}</div>
      <div style="padding:12px 14px;border-radius:12px;border:1px solid rgba(155,127,255,0.28);background:rgba(155,127,255,0.06);margin-bottom:14px;font-size:12px;line-height:1.45;color:var(--text-secondary)">
        <strong style="color:var(--text-primary)">Clinical decision-support - movement review workspace.</strong>
        Summaries fuse passive sensors and chart context where available. Outputs are <strong>movement-analysis cues</strong>, not autonomous neurological diagnosis, fall-risk final determination, treatment eligibility, protocol approval, or medication recommendations. Every finding requires clinician interpretation.
      </div>
      <div id="mv-bias-slot">${_renderBiasDisclosureMv(biasDisclosureVisible)}</div>
      ${_renderKeyboardHelpMv(keyboardHelpVisible)}
      <div id="mv-toolbar" style="margin-bottom:12px;display:flex;flex-wrap:wrap;gap:10px;align-items:center"></div>
      <div id="mv-breadcrumb" style="display:flex;align-items:center;gap:10px;margin-bottom:12px;font-size:12px"></div>
      <div id="mv-evidence-slot"></div>
      <div id="mv-compare-slot"></div>
      <div id="mv-body"></div>
      <div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:10px;align-items:center">
        <button type="button" class="btn btn-ghost btn-sm" id="mv-toggle-evidence" style="min-height:44px" title="Toggle evidence panel (E)">
          ${evidencePanelVisible ? 'Hide evidence' : 'Evidence panel'}
        </button>
        <button type="button" class="btn btn-ghost btn-sm" id="mv-toggle-compare" style="min-height:44px" title="Toggle comparison view (C)">
          ${comparisonViewVisible ? 'Close comparison' : 'Comparison view'}
        </button>
        <button type="button" class="btn btn-ghost btn-sm" id="mv-toggle-skeleton" style="min-height:44px" title="Toggle skeleton overlay (S)">
          ${skeletonOverlay ? 'Hide skeleton' : 'Skeleton overlay'}
        </button>
        <label style="font-size:11px;color:var(--text-tertiary);display:flex;align-items:center;gap:6px;margin-left:auto">
          <span>Speed</span>
          <select id="mv-speed" class="form-control" style="min-width:90px;font-size:12px">
            ${MV_SPEEDS.map((s) => `<option value="${s}" ${playbackSpeed === s ? 'selected' : ''}>${s === 1 ? '1x' : s + 'x'}</option>`).join('')}
          </select>
        </label>
        <span style="font-size:11px;color:var(--text-tertiary)">Press <kbd style="font-family:monospace;background:rgba(255,255,255,.06);padding:2px 6px;border-radius:4px">?</kbd> for shortcuts</span>
      </div>
    </div>`;

  async function _refreshMvDrHero(patientId) {
    const slot = document.getElementById('mv-dr-hero-slot');
    if (!slot) return;
    let flagCount = 0; let flagSummary = '';
    if (patientId) {
      const s = await loadPatientFlagSummary(patientId);
      flagCount = s.flagCount; flagSummary = s.flagSummary;
    }
    slot.innerHTML = drHero({ question: MOVEMENT_CLINICAL_QUESTION, howToRead: MOVEMENT_HOW_TO_READ, flagCount, flagSummary });
  }
  _refreshMvDrHero(activePatientId);

  if (!el.querySelector('[data-aar-strip="movement"]')) {
    const _aarHost = document.createElement('div');
    _aarHost.dataset.aarStrip = 'movement';
    el.prepend(_aarHost);
    mountAnalyzerAIReportStrip({
      container: _aarHost,
      analyzerType: 'movement',
      getAnalysisId: () => activePatientId,
      label: 'AI Decision Support',
    });
  }

  const $ = (id) => document.getElementById(id);

  function _syncDemoBanner() {
    const slot = $('mv-demo-banner');
    if (!slot) return;
    slot.innerHTML = usingFixtures && isDemoSession() ? DEMO_FIXTURE_BANNER_HTML : '';
  }

  function renderToolbar() {
    const tb = $('mv-toolbar');
    if (!tb) return;
    const opts = (rosterCache || []).map((p) => {
      const label = esc(_patientDisplayName(p) || p.id);
      const sel = p.id === activePatientId ? ' selected' : '';
      return `<option value="${esc(p.id)}"${sel}>${label}</option>`;
    }).join('');
    tb.innerHTML = `
      <button type="button" class="btn btn-ghost btn-sm" id="mv-back-clinic" style="min-height:44px;display:${view === 'patient' ? 'inline-flex' : 'none'}">← Clinic summary</button>
      <label style="font-size:12px;color:var(--text-secondary);display:flex;align-items:center;gap:8px">
        <span>Select patient</span>
        <select id="mv-patient-select" class="form-control" style="min-width:220px;max-width:min(420px,90vw)" aria-label="Select patient for movement workspace">
          <option value="">— Choose patient —</option>
          ${opts}
        </select>
      </label>
      <button type="button" class="btn btn-ghost btn-sm" id="mv-refresh" style="min-height:44px">Refresh data</button>
      <button type="button" class="btn btn-ghost btn-sm" id="mv-nav-dashboard" style="min-height:44px" title="Return to dashboard">Dashboard</button>
    `;
    const selEl = $('mv-patient-select');
    if (selEl && activePatientId) selEl.value = activePatientId;
    $('mv-back-clinic')?.addEventListener('click', () => {
      view = 'clinic';
      activePatientId = null;
      _refreshMvDrHero(activePatientId);
      render();
    });
    $('mv-refresh')?.addEventListener('click', () => {
      if (view === 'clinic') loadClinic();
      else loadPatient();
    });
    $('mv-nav-dashboard')?.addEventListener('click', () => {
      try { navigate?.('home'); } catch {}
    });
    selEl?.addEventListener('change', (ev) => {
      const v = String(ev.target.value || '').trim();
      if (!v) return;
      activePatientId = v;
      _refreshMvDrHero(activePatientId);
      const hit = rosterCache.find((x) => x.id === v);
      activePatientName = _patientDisplayName(hit) || profileCache?.patient_name || v;
      view = 'patient';
      render();
    });
  }

  function setBreadcrumb() {
    const bc = $('mv-breadcrumb');
    if (!bc) return;
    if (view === 'clinic') {
      bc.innerHTML = `<span style="font-weight:600">Clinic movement summary</span>`;
    } else {
      bc.innerHTML = `<span style="color:var(--text-tertiary)">Patient:</span> <span style="font-weight:600">${esc(activePatientName || activePatientId)}</span>`;
    }
    renderToolbar();
    const back = $('mv-back-clinic');
    if (back) back.style.display = view === 'patient' ? 'inline-flex' : 'none';
  }

  async function loadClinic() {
    const body = $('mv-body');
    if (!body) return;
    body.innerHTML = `<div style="padding:18px;background:var(--bg-card);border:1px solid var(--border);border-radius:14px">${_skeletonChips(5)}</div>`;
    demoAnnotationLocal = false;
    try {
      const loaded = await _loadClinicSummaryFromApi();
      summaryCache = { patients: loaded.patients || [] };
      rosterCache = loaded.roster || [];
      if ((!summaryCache.patients?.length) && isDemoSession() && ANALYZER_DEMO_FIXTURES?.movement) {
        summaryCache = ANALYZER_DEMO_FIXTURES.movement.clinic_summary();
        rosterCache = (summaryCache.patients || []).map((p) => ({
          id: p.patient_id,
          first_name: (p.patient_name || '').split(' ')[0] || '',
          last_name: (p.patient_name || '').split(' ').slice(1).join(' ') || '',
        }));
        usingFixtures = true;
      } else if (summaryCache.patients?.length) {
        usingFixtures = false;
      }
    } catch (e) {
      if (isDemoSession() && ANALYZER_DEMO_FIXTURES?.movement) {
        summaryCache = ANALYZER_DEMO_FIXTURES.movement.clinic_summary();
        rosterCache = (summaryCache.patients || []).map((p) => ({
          id: p.patient_id,
          first_name: (p.patient_name || '').split(' ')[0] || '',
          last_name: (p.patient_name || '').split(' ').slice(1).join(' ') || '',
        }));
        usingFixtures = true;
      } else {
        const msg = (e && e.message) || String(e);
        body.innerHTML = _errorCard(msg);
        body.querySelector('[data-action="retry"]')?.addEventListener('click', loadClinic);
        return;
      }
    }
    _syncDemoBanner();
    body.innerHTML = _renderClinicTable(summaryCache?.patients || [], sortKey, sortDir);
    body.querySelectorAll('[data-sort-key]').forEach((th) => {
      th.addEventListener('click', () => {
        const k = th.getAttribute('data-sort-key');
        if (k === sortKey) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        else { sortKey = k; sortDir = k === 'name' ? 'asc' : 'desc'; }
        body.innerHTML = _renderClinicTable(summaryCache?.patients || [], sortKey, sortDir);
        wireClinicRows();
      });
    });
    wireClinicRows();
    setBreadcrumb();
  }

  function wireClinicRows() {
    const body = $('mv-body');
    body?.querySelectorAll('tr[data-patient-id]').forEach((tr) => {
      const pid = tr.getAttribute('data-patient-id');
      const open = () => {
        const p = (summaryCache?.patients || []).find((x) => x.patient_id === pid);
        activePatientId = pid;
        _refreshMvDrHero(activePatientId);
        activePatientName = p?.patient_name || pid;
        const sel = $('mv-patient-select');
        if (sel) sel.value = pid;
        view = 'patient';
        render();
      };
      tr.addEventListener('click', (ev) => {
        if (ev.target?.closest && ev.target.closest('[data-action]')) return;
        open();
      });
      tr.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); }
      });
    });
    body?.querySelectorAll('[data-action="open-patient"]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const pid = btn.getAttribute('data-patient-id');
        const p = (summaryCache?.patients || []).find((x) => x.patient_id === pid);
        activePatientId = pid;
        _refreshMvDrHero(activePatientId);
        activePatientName = p?.patient_name || pid;
        const sel = $('mv-patient-select');
        if (sel) sel.value = pid;
        view = 'patient';
        render();
      });
    });
  }

  async function loadPatient() {
    const body = $('mv-body');
    if (!body || !activePatientId) return;
    body.innerHTML = `<div style="padding:18px;background:var(--bg-card);border:1px solid var(--border);border-radius:14px">${_skeletonChips(5)}</div>`;
    demoAnnotationLocal = false;
    try {
      const prof = await api.getMovementProfile(activePatientId);
      profileCache = prof;
      let auditResp = await api.getMovementAudit(activePatientId).catch(() => null);
      const merged = mergeMovementAuditItems(profileCache, auditResp);
      auditCache = { patient_id: activePatientId, items: merged };
      if (profileCache) {
        activePatientName = profileCache.patient_name || activePatientName;
      }
      const missingModalities = !profileCache?.modalities || !Object.keys(profileCache.modalities).length;
      if ((missingModalities || !profileCache?.patient_id) && isDemoSession() && ANALYZER_DEMO_FIXTURES?.movement) {
        profileCache = ANALYZER_DEMO_FIXTURES.movement.patient_profile(activePatientId);
        auditCache = { patient_id: activePatientId, items: ANALYZER_DEMO_FIXTURES.movement.patient_audit(activePatientId)?.items || [] };
        usingFixtures = true;
        demoAnnotationLocal = true;
      } else if (profileCache) {
        usingFixtures = false;
      }
    } catch (e) {
      if (isDemoSession() && ANALYZER_DEMO_FIXTURES?.movement) {
        profileCache = ANALYZER_DEMO_FIXTURES.movement.patient_profile(activePatientId);
        auditCache = { patient_id: activePatientId, items: ANALYZER_DEMO_FIXTURES.movement.patient_audit(activePatientId)?.items || [] };
        usingFixtures = true;
        demoAnnotationLocal = true;
      } else {
        const msg = (e && e.message) || String(e);
        body.innerHTML = _errorCard(msg);
        body.querySelector('[data-action="retry"]')?.addEventListener('click', loadPatient);
        return;
      }
    }
    _syncDemoBanner();
    const auditDemoLabel = usingFixtures && isDemoSession() ? 'Sample audit events for offline demo — not a real patient record.' : '';
    body.innerHTML = _renderPatientDetail(profileCache, auditCache, navigate, {
      usingFixtures,
      patientId: activePatientId,
      demoAnnotationLocal,
      auditDemoLabel,
    });
    wirePatientDetail();
  }

  function wirePatientDetail() {
    const body = $('mv-body');
    if (!body) return;

    // Render confidence heatmap if pose data available
    const heatmapCanvas = document.getElementById('mv-pose-heatmap');
    if (heatmapCanvas && profileCache?.pose_sequence) {
      try { _renderConfidenceHeatmap(heatmapCanvas, profileCache.pose_sequence); } catch (_) {}
    }

    // Wire skeleton overlay for the inline skeleton video player
    const skeletonVideo = document.getElementById('mv-skeleton-video');
    if (skeletonVideo) {
      const rid = skeletonVideo.getAttribute('data-recording-id');
      if (rid && skeletonOverlay) {
        _mvSkeletonOverlayEnabled = true;
        _wireSkeletonOverlay(skeletonVideo, rid);
      }
      skeletonVideo.addEventListener('play', () => {
        if (skeletonOverlay && rid) { _mvSkeletonOverlayEnabled = true; _wireSkeletonOverlay(skeletonVideo, rid); }
      });
      skeletonVideo.addEventListener('pause', () => _stopSkeletonAnimation());
      skeletonVideo.addEventListener('ended', () => _stopSkeletonAnimation());
    }

    function goWithPatient(pageId) {
      if (!activePatientId) return;
      applyMovementAnalyzerPatientContext(pageId, activePatientId);
      try {
        navigate?.(pageId);
      } catch {}
    }

    body.querySelectorAll('[data-action="go-video-assessments"]').forEach((btn) => {
      btn.addEventListener('click', () => goWithPatient('video-assessments'));
    });
    body.querySelectorAll('[data-action="go-wearables"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled || !activePatientId) return;
        goWithPatient('wearables');
      });
    });
    body.querySelectorAll('[data-action="go-documents"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled || !activePatientId) return;
        goWithPatient('documents-v2');
      });
    });

    body.querySelector('[data-action="export-json"]')?.addEventListener('click', async (ev) => {
      const btn = ev.currentTarget;
      if (btn.disabled || usingFixtures) return;
      const old = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Preparing…';
      try {
        const { blob, filename } = await api.exportMovementWorkspace(activePatientId);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || `movement-workspace-${activePatientId.slice(0, 8)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        const fresh = await api.getMovementAudit(activePatientId).catch(() => null);
        if (fresh && Array.isArray(fresh.items)) {
          auditCache = fresh;
          body.innerHTML = _renderPatientDetail(profileCache, auditCache, navigate, {
            usingFixtures,
            patientId: activePatientId,
            demoAnnotationLocal,
            auditDemoLabel: usingFixtures && isDemoSession() ? 'Sample audit events for offline demo — not a real patient record.' : '',
          });
          wirePatientDetail();
        }
      } catch (e) {
        _prependInlineError(
          body,
          (e && e.message) || String(e),
          () => body.querySelector('[data-action="export-json"]')?.click(),
          'Retry export',
        );
      } finally {
        if (btn.isConnected) {
          btn.disabled = false;
          btn.textContent = old;
        }
      }
    });

    body.querySelector('[data-review-ack-form]')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const form = ev.currentTarget;
      const err = form.querySelector('[data-review-form-error]');
      if (err) err.textContent = '';
      const note = String(new FormData(form).get('review_note') || '').trim();
      if (!note) {
        if (err) err.textContent = 'Enter a short review note.';
        form.querySelector('textarea')?.focus();
        return;
      }
      const submit = form.querySelector('[data-action="review-submit"]');
      if (submit) {
        submit.disabled = true;
        submit.textContent = 'Saving…';
      }
      try {
        if (usingFixtures && demoAnnotationLocal) {
          const added = {
            id: `demo-mv-rev-${Date.now()}`,
            kind: 'review_ack',
            actor: 'Demo clinician (sample)',
            message: note,
            created_at: new Date().toISOString(),
          };
          const items = Array.isArray(auditCache?.items) ? auditCache.items.slice() : [];
          items.unshift(added);
          auditCache = { ...(auditCache || {}), items };
        } else {
          await api.ackMovementReview(activePatientId, { note });
          const freshAudit = await api.getMovementAudit(activePatientId).catch(() => null);
          auditCache = freshAudit && Array.isArray(freshAudit.items)
            ? freshAudit
            : { patient_id: activePatientId, items: [] };
        }
        form.reset();
        body.innerHTML = _renderPatientDetail(profileCache, auditCache, navigate, {
          usingFixtures,
          patientId: activePatientId,
          demoAnnotationLocal,
          auditDemoLabel: usingFixtures && isDemoSession() ? 'Sample audit events for offline demo — not a real patient record.' : '',
        });
        wirePatientDetail();
      } catch (e) {
        if (err) err.textContent = (e && e.message) || String(e);
      } finally {
        const sub = form.querySelector('[data-action="review-submit"]');
        if (sub && sub.isConnected) {
          sub.disabled = false;
          sub.textContent = 'Mark workspace reviewed';
        }
      }
    });

    body.querySelectorAll('[data-action="nav-module"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const page = btn.getAttribute('data-nav-page');
        if (!page) return;
        applyMovementAnalyzerPatientContext(page, activePatientId);
        try {
          navigate?.(page);
        } catch {}
      });
    });

    body.querySelector('[data-action="recompute"]')?.addEventListener('click', async (ev) => {
      const btn = ev.currentTarget;
      if (btn.disabled) return;
      const old = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Recomputing…';
      try {
        await api.recomputeMovement(activePatientId);
        await loadPatient();
      } catch (e) {
        btn.disabled = false;
        btn.textContent = old;
        _prependInlineError(
          body,
          (e && e.message) || String(e),
          () => body.querySelector('[data-action="recompute"]')?.click(),
          'Retry recompute',
        );
      }
    });

    body.querySelector('[data-action="refresh-patient"]')?.addEventListener('click', () => loadPatient());

    body.querySelector('[data-action="open-recording"]')?.addEventListener('click', (ev) => {
      ev.preventDefault();
      const rid = ev.currentTarget.getAttribute('data-recording-id');
      try {
        if (rid) {
          window._mvOpenRecording = rid;
          applyMovementAnalyzerPatientContext('video-assessments', activePatientId);
          navigate?.('video-assessments');
        }
      } catch {}
    });

    body.querySelector('[data-annotation-form]')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const form = ev.currentTarget;
      const errSlot = form.querySelector('[data-form-error]');
      if (errSlot) errSlot.textContent = '';
      const note = String(new FormData(form).get('note') || '').trim();
      if (!note) {
        if (errSlot) errSlot.textContent = 'Enter a clinical note before saving.';
        form.querySelector('textarea')?.focus();
        return;
      }
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      submit.textContent = 'Saving…';
      try {
        if (usingFixtures && demoAnnotationLocal) {
          const added = {
            id: `demo-mv-aud-${Date.now()}`,
            kind: 'annotation',
            actor: 'Demo clinician (sample)',
            message: note,
            created_at: new Date().toISOString(),
          };
          const items = Array.isArray(auditCache?.items) ? auditCache.items.slice() : [];
          items.unshift(added);
          auditCache = { ...(auditCache || {}), items };
        } else {
          await api.addMovementAnnotation(activePatientId, { message: note });
          const freshAudit = await api.getMovementAudit(activePatientId).catch(() => null);
          auditCache = freshAudit && Array.isArray(freshAudit.items)
            ? freshAudit
            : { patient_id: activePatientId, items: [] };
        }
        form.reset();
        body.innerHTML = _renderPatientDetail(profileCache, auditCache, navigate, {
          usingFixtures,
          patientId: activePatientId,
          demoAnnotationLocal,
          auditDemoLabel: usingFixtures && isDemoSession() ? 'Sample audit events for offline demo — not a real patient record.' : '',
        });
        wirePatientDetail();
      } catch (e) {
        if (errSlot) errSlot.textContent = (e && e.message) || String(e);
      } finally {
        if (submit && submit.isConnected) {
          submit.disabled = false;
          submit.textContent = 'Save note to audit trail';
        }
      }
    });
  }

  // ── Keyboard shortcuts (ELAN-style) ──
  function _applyMvPlaybackSpeed(videoEl) {
    if (!videoEl) return;
    try { videoEl.playbackRate = playbackSpeed; } catch (_) {}
  }
  if (!keyboardBound && typeof document !== 'undefined') {
    keyboardBound = true;
    document.addEventListener('keydown', (e) => {
      const tag = (e.target?.tagName || '').toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable;
      if (isTyping) return;
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        keyboardHelpVisible = !keyboardHelpVisible;
        _renderMvShell();
        return;
      }
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
        else document.exitFullscreen().catch(() => {});
        return;
      }
      if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        comparisonViewVisible = !comparisonViewVisible;
        _renderComparisonSlot();
        return;
      }
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        skeletonOverlay = !skeletonOverlay;
        _mvSkeletonOverlayEnabled = skeletonOverlay;
        const video = document.querySelector('video');
        if (video) {
          if (skeletonOverlay) {
            const rid = document.querySelector('[data-recording-id]')?.getAttribute('data-recording-id');
            _wireSkeletonOverlay(video, rid);
          } else {
            _stopSkeletonAnimation();
            _removeSkeletonCanvas(video);
            _removeKpTooltip();
          }
        }
        const btn = document.getElementById('mv-toggle-skeleton');
        if (btn) btn.textContent = skeletonOverlay ? 'Hide skeleton' : 'Skeleton overlay';
        return;
      }
      if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        evidencePanelVisible = !evidencePanelVisible;
        _renderEvidenceSlot();
        return;
      }
      if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        const video = document.querySelector('video');
        const time = video ? Math.round(video.currentTime * 10) / 10 : 0;
        const noteField = document.querySelector('[data-annotation-form] textarea');
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
          if (video.paused) { video.play(); _applyMvPlaybackSpeed(video); }
          else video.pause();
        }
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const idx = MV_SPEEDS.indexOf(playbackSpeed);
        playbackSpeed = idx < MV_SPEEDS.length - 1 ? MV_SPEEDS[idx + 1] : 2;
        document.querySelectorAll('video').forEach(_applyMvPlaybackSpeed);
        const sel = document.getElementById('mv-speed');
        if (sel) sel.value = String(playbackSpeed);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const idx = MV_SPEEDS.indexOf(playbackSpeed);
        playbackSpeed = idx > 0 ? MV_SPEEDS[idx - 1] : 0.25;
        document.querySelectorAll('video').forEach(_applyMvPlaybackSpeed);
        const sel = document.getElementById('mv-speed');
        if (sel) sel.value = String(playbackSpeed);
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
    });
  }

  // ── Render helpers for dynamic slots ──
  function _renderMvShell() {
    const biasSlot = document.getElementById('mv-bias-slot');
    if (biasSlot) biasSlot.innerHTML = _renderBiasDisclosureMv(biasDisclosureVisible);
    _rebindBiasButtons();
  }
  function _rebindBiasButtons() {
    document.getElementById('mv-show-bias')?.addEventListener('click', () => { biasDisclosureVisible = true; _renderMvShell(); });
    document.getElementById('mv-hide-bias')?.addEventListener('click', () => { biasDisclosureVisible = false; _renderMvShell(); });
  }
  function _renderEvidenceSlot() {
    const slot = document.getElementById('mv-evidence-slot');
    if (!slot) return;
    slot.innerHTML = evidencePanelVisible ? _renderEvidencePanelMv(evidencePanelVisible, profileCache) : '';
    document.getElementById('mv-hide-evidence')?.addEventListener('click', () => { evidencePanelVisible = false; _renderEvidenceSlot(); });
  }
  function _renderComparisonSlot() {
    const slot = document.getElementById('mv-compare-slot');
    if (!slot) return;
    slot.innerHTML = comparisonViewVisible ? _renderComparisonViewMv(profileCache) : '';
    document.getElementById('mv-hide-compare')?.addEventListener('click', () => { comparisonViewVisible = false; _renderComparisonSlot(); });
  }

  // ── Wire new interactive controls ──
  function _wireMvControls() {
    document.getElementById('mv-show-bias')?.addEventListener('click', () => { biasDisclosureVisible = true; _renderMvShell(); });
    document.getElementById('mv-hide-bias')?.addEventListener('click', () => { biasDisclosureVisible = false; _renderMvShell(); });
    document.getElementById('mv-toggle-evidence')?.addEventListener('click', () => { evidencePanelVisible = !evidencePanelVisible; _renderEvidenceSlot(); });
    document.getElementById('mv-hide-evidence')?.addEventListener('click', () => { evidencePanelVisible = false; _renderEvidenceSlot(); });
    document.getElementById('mv-toggle-compare')?.addEventListener('click', () => { comparisonViewVisible = !comparisonViewVisible; _renderComparisonSlot(); });
    document.getElementById('mv-hide-compare')?.addEventListener('click', () => { comparisonViewVisible = false; _renderComparisonSlot(); });
    document.getElementById('mv-toggle-skeleton')?.addEventListener('click', () => {
      skeletonOverlay = !skeletonOverlay;
      _mvSkeletonOverlayEnabled = skeletonOverlay;
      const btn = document.getElementById('mv-toggle-skeleton');
      if (btn) btn.textContent = skeletonOverlay ? 'Hide skeleton' : 'Skeleton overlay';
      const video = document.querySelector('video');
      if (video) {
        if (skeletonOverlay) {
          const rid = document.querySelector('[data-recording-id]')?.getAttribute('data-recording-id');
          _wireSkeletonOverlay(video, rid);
        } else {
          _stopSkeletonAnimation();
          _removeSkeletonCanvas(video);
          _removeKpTooltip();
        }
      }
    });
    document.getElementById('mv-speed')?.addEventListener('change', (ev) => {
      const v = parseFloat(ev.target.value);
      if (!Number.isNaN(v)) { playbackSpeed = v; document.querySelectorAll('video').forEach(_applyMvPlaybackSpeed); }
    });
    document.getElementById('mv-close-kb-help')?.addEventListener('click', () => { keyboardHelpVisible = false; _renderMvShell(); });
  }

  _wireMvControls();

  function render() {
    setBreadcrumb();
    if (view === 'clinic') loadClinic();
    else loadPatient();
  }



/* -- Explainability & Bias Frontend Panel (Wave 2) -- */

function _renderExplainabilityPanel(analysisResult) {
  if (!analysisResult || !analysisResult.explanation) return '';
  const exp = analysisResult.explanation;
  let fiBars = '';
  if (exp.feature_importance && exp.feature_importance.length) {
    fiBars = '<div style="margin-top:12px">' +
      '<h4 style="font-size:12px;margin:0 0 6px;color:#6b7280">Feature Importance</h4>' +
      exp.feature_importance.map(function(f) {
        const pct = Math.round(f.importance * 100);
        const barColor = f.direction === 'increased' ? '#22c55e' : f.direction === 'decreased' ? '#ef4444' : '#6b7280';
        return '<div style="margin-bottom:4px">' +
          '<div style="display:flex;justify-content:space-between;font-size:11px">' +
            '<span>' + esc(f.feature) + '</span>' +
            '<span style="color:' + barColor + '">' + esc(f.direction || 'neutral') + ' (' + pct + '%)</span>' +
          '</div>' +
          '<div style="background:rgba(0,0,0,0.06);border-radius:4px;height:8px;overflow:hidden">' +
            '<div style="width:' + pct + '%;background:' + barColor + ';height:100%;border-radius:4px;opacity:0.7"></div>' +
          '</div>' +
          '<div style="font-size:10px;color:#9ca3af;margin-top:1px">' + esc(f.clinical_note || '') + '</div>' +
        '</div>';
      }).join('') +
    '</div>';
  }

  let uncertaintyBars = '';
  if (exp.uncertainty_breakdown) {
    const ub = exp.uncertainty_breakdown;
    uncertaintyBars = '<div style="margin-top:12px">' +
      '<h4 style="font-size:12px;margin:0 0 6px;color:#6b7280">Uncertainty Breakdown</h4>' +
      (ub.pose_estimation !== undefined ? _uncertaintyBar('Pose Estimation', ub.pose_estimation) : '') +
      (ub.signal_processing !== undefined ? _uncertaintyBar('Signal Processing', ub.signal_processing) : '') +
      (ub.clinical_interpretation !== undefined ? _uncertaintyBar('Clinical Interpretation', ub.clinical_interpretation) : '') +
      '<div style="font-size:10px;color:#9ca3af;margin-top:4px">Total uncertainty: ' + Math.round((ub.total || 0) * 100) + '%</div>' +
    '</div>';
  }

  return '<div style="background:rgba(255,255,255,0.9);border:1px solid rgba(0,212,188,0.25);border-radius:10px;padding:14px;margin-top:14px">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
      '<h3 style="font-size:13px;margin:0;color:#1f2937">Why This Result?</h3>' +
      '<span style="font-size:11px;color:#6b7280">Confidence: ' + Math.round((exp.confidence || 0) * 100) + '%</span>' +
    '</div>' +
    '<div style="font-size:11.5px;color:#1f2937;background:rgba(0,212,188,0.06);padding:10px;border-radius:8px;margin-bottom:10px">' +
      '<strong>Finding:</strong> ' + esc(exp.predicted_finding || 'N/A') +
    '</div>' +
    fiBars + uncertaintyBars +
    (exp.evidence_link ? '<div style="margin-top:10px;font-size:10px;color:#9ca3af;border-top:1px solid rgba(0,0,0,0.06);padding-top:8px">' + esc(exp.evidence_link) + '</div>' : '') +
    (exp.safe_clinical_summary ? '<div style="margin-top:8px;font-size:11px;color:#6b7280;font-style:italic;border-left:3px solid rgba(0,212,188,0.4);padding-left:10px">' + esc(exp.safe_clinical_summary) + '</div>' : '') +
  '</div>';
}

function _uncertaintyBar(label, value) {
  const pct = Math.round((value || 0) * 100);
  return '<div style="margin-bottom:3px">' +
    '<div style="display:flex;justify-content:space-between;font-size:10px">' +
      '<span>' + esc(label) + '</span>' +
      '<span>' + pct + '%</span>' +
    '</div>' +
    '<div style="background:rgba(0,0,0,0.06);border-radius:3px;height:6px;overflow:hidden">' +
      '<div style="width:' + pct + '%;background:rgba(107,114,128,0.5);height:100%;border-radius:3px"></div>' +
    '</div>' +
  '</div>';
}

function _renderBiasPanel(biasResult) {
  if (!biasResult) return '';
  const risk = biasResult.overall_bias_risk || 'unknown';
  const riskColor = risk === 'low' ? '#16a34a' : risk === 'moderate' ? '#f59e0b' : '#ef4444';
  let recs = '';
  if (biasResult.recommendations && biasResult.recommendations.length) {
    recs = '<ul style="margin:6px 0;padding-left:16px;font-size:10.5px;color:#6b7280">' +
      biasResult.recommendations.map(function(r) { return '<li>' + esc(r) + '</li>'; }).join('') +
    '</ul>';
  }
  return '<div style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.2);border-radius:10px;padding:12px;margin-top:12px">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
      '<h4 style="font-size:12px;margin:0;color:#1f2937">Bias Assessment</h4>' +
      '<span style="font-size:11px;padding:2px 8px;border-radius:4px;background:' + riskColor + '14;color:' + riskColor + ';font-weight:600">' + esc(risk.toUpperCase()) + ' RISK</span>' +
    '</div>' +
    (biasResult.adjusted_confidence !== undefined ? '<div style="font-size:11px;margin-bottom:6px">Adjusted confidence: ' + Math.round(biasResult.adjusted_confidence * 100) + '%</div>' : '') +
    recs +
    (biasResult.evidence_reference ? '<div style="font-size:10px;color:#9ca3af;margin-top:6px">' + esc(biasResult.evidence_reference) + '</div>' : '') +
  '</div>';
}

/* -- End Explainability Panel -- */

  render();
}

export default { pgMovementAnalyzer };
