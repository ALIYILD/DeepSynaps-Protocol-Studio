// ─────────────────────────────────────────────────────────────────────────────
// Lightweight motion proxy from recorded clips (browser-only, no pose model).
// Frame-difference statistics — exploratory / QA only; not a validated score.
// ─────────────────────────────────────────────────────────────────────────────

export const MOTION_ENGINE_ID = 'frame_diff_web_v1';

/**
 * @param {Blob} blob
 * @param {{ task_id?: string, maxFrames?: number, targetWidth?: number }} [opts]
 * @returns {Promise<object>}
 */
export async function analyzeVideoBlobMotion(blob, opts = {}) {
  const taskId = opts.task_id || '';
  const maxFrames = Math.min(48, Math.max(8, opts.maxFrames ?? 24));
  const targetWidth = Math.min(320, Math.max(160, opts.targetWidth ?? 240));

  const url = URL.createObjectURL(blob);
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;
    try {
      video.load();
    } catch (_) {}

    await new Promise((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Could not load video for motion analysis'));
    });

    const duration = Number(video.duration) || 0;
    if (!duration || duration > 600) {
      return _failed(taskId, 'duration_unsupported', 'Clip duration missing or too long.');
    }

    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;
    const scale = targetWidth / vw;
    const cw = Math.round(targetWidth);
    const ch = Math.max(1, Math.round(vh * scale));

    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return _failed(taskId, 'canvas', 'Canvas unsupported.');

    const nFrames = Math.min(maxFrames, Math.max(8, Math.ceil(duration * 4)));
    const motionSeries = [];

    const waitSeek = () =>
      new Promise((resolve) => {
        const fn = () => {
          video.removeEventListener('seeked', fn);
          resolve();
        };
        video.addEventListener('seeked', fn);
      });

    let prevGray = null;
    for (let i = 0; i < nFrames; i++) {
      const t = (i / Math.max(nFrames - 1, 1)) * duration * 0.998;
      video.currentTime = t;
      await waitSeek();
      ctx.drawImage(video, 0, 0, cw, ch);
      let img;
      try {
        img = ctx.getImageData(0, 0, cw, ch);
      } catch {
        return _failed(taskId, 'tainted', 'Cannot read pixels (video may be cross-origin).');
      }
      const gray = _downsampleGray(img.data, cw, ch, 4);
      if (prevGray) {
        motionSeries.push(_meanAbsDiff(prevGray, gray));
      }
      prevGray = gray;
    }

    if (motionSeries.length < 2) {
      return _failed(taskId, 'no_motion_series', 'Not enough frames sampled.');
    }

    const mean = motionSeries.reduce((a, b) => a + b, 0) / motionSeries.length;
    const variance =
      motionSeries.reduce((s, x) => s + (x - mean) ** 2, 0) / motionSeries.length;
    const std = Math.sqrt(variance);
    const peaks = _countPeaks(motionSeries, 0.38);
    const durMs = Math.round(duration * 1000);
    const proxyScore = Math.min(
      100,
      Math.round(
        35 * Math.min(1, mean / 18) +
          25 * Math.min(1, std / 12) +
          25 * Math.min(1, peaks / 12) +
          15 * Math.min(1, duration / 25),
      ),
    );

    return {
      engine: MOTION_ENGINE_ID,
      engine_version: '1',
      task_id: taskId,
      analyzed_at: new Date().toISOString(),
      duration_ms: durMs,
      frames_sampled: motionSeries.length + 1,
      mean_motion_0_255: Math.round(mean * 1000) / 1000,
      std_motion_0_255: Math.round(std * 1000) / 1000,
      repetitive_motion_peak_count: peaks,
      motion_activity_score_0_100: proxyScore,
      disclaimer:
        'Heuristic motion proxy from pixel differences — not pose estimation and not validated for diagnosis or severity.',
    };
  } finally {
    try {
      URL.revokeObjectURL(url);
    } catch {}
  }
}

function _failed(taskId, code, message) {
  return {
    engine: MOTION_ENGINE_ID,
    engine_version: '1',
    task_id: taskId,
    analyzed_at: new Date().toISOString(),
    status: 'failed',
    error_code: code,
    error_message: message,
    disclaimer:
      'Automated motion analysis failed or was unavailable. Clinical review remains primary.',
  };
}

function _downsampleGray(rgba, w, h, step) {
  const out = new Float32Array(Math.ceil((w / step) * (h / step)));
  let o = 0;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      out[o++] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
    }
  }
  return out;
}

function _meanAbsDiff(a, b) {
  const n = Math.min(a.length, b.length);
  if (!n) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.abs(a[i] - b[i]);
  return s / n;
}

function _countPeaks(arr, ratio) {
  const mx = Math.max(...arr, 1e-9);
  const thresh = mx * ratio;
  let peaks = 0;
  for (let i = 1; i < arr.length - 1; i++) {
    if (arr[i] > arr[i - 1] && arr[i] >= arr[i + 1] && arr[i] > thresh) peaks++;
  }
  return peaks;
}
