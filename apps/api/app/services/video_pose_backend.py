"""Pluggable pose estimation backend for video movement analysis.

Default: MediaPipe BlazePose (Apache-2.0)
- 33 keypoints, ICC=0.94 vs physiotherapists
- 30 FPS on mobile, 60+ FPS on desktop
- On-device inference, no network required

Decision-support only: pose data requires clinician review.
"""
from __future__ import annotations

import io
import logging
import math
import os
import tempfile
import time
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

_log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Lazy MediaPipe import
# ---------------------------------------------------------------------------
try:
    import mediapipe as mp

    MEDIAPIPE_AVAILABLE = True
except ImportError:
    mp = None  # type: ignore[assignment]
    MEDIAPIPE_AVAILABLE = False

# ---------------------------------------------------------------------------
# Lazy OpenCV import (always available, but lazy for type-check parity)
# ---------------------------------------------------------------------------
try:
    import cv2
except ImportError:
    cv2 = None  # type: ignore[assignment]

# ---------------------------------------------------------------------------
# scipy is optional; features degrade to numpy-only fallbacks
# ---------------------------------------------------------------------------
try:
    from scipy import signal, integrate
except ImportError:
    signal = None  # type: ignore[assignment]
    integrate = None  # type: ignore[assignment]

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
_MEDIAPIPE_VERSION: str = getattr(mp, "__version__", "0.10.0") if mp else "0.10.0"

#: MediaPipe BlazePose keypoint names (33 keypoints total)
_MEDIAPIPE_KEYPOINT_NAMES: list[str] = [
    "nose",
    "left_eye_inner",
    "left_eye",
    "left_eye_outer",
    "right_eye_inner",
    "right_eye",
    "right_eye_outer",
    "left_ear",
    "right_ear",
    "mouth_left",
    "mouth_right",
    "left_shoulder",
    "right_shoulder",
    "left_elbow",
    "right_elbow",
    "left_wrist",
    "right_wrist",
    "left_pinky",
    "right_pinky",
    "left_index",
    "right_index",
    "left_thumb",
    "right_thumb",
    "left_hip",
    "right_hip",
    "left_knee",
    "right_knee",
    "left_ankle",
    "right_ankle",
    "left_heel",
    "right_heel",
    "left_foot_index",
    "right_foot_index",
]

#: Keypoint indices used for body-center / stability heuristics
_KEYPOINT_INVERSE: dict[str, int] = {n: i for i, n in enumerate(_MEDIAPIPE_KEYPOINT_NAMES)}

#: Approximate pixel-to-meter calibration (very rough; real systems use
#  reference objects or known subject height).  Used for gait-speed estimates.
_PIXELS_PER_METER: float = 400.0

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _clamp01(x: float) -> float:
    """Clamp value to [0.0, 1.0] range."""
    return max(0.0, min(1.0, float(x)))


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _bytes_to_cv2_cap(video_bytes: bytes) -> Any:
    """Convert raw video bytes to an OpenCV VideoCapture.

    Strategy:
    1. Write to a temporary file (most reliable cross-platform approach).
    2. Open with cv2.VideoCapture.
    """
    if cv2 is None:
        raise RuntimeError(
            "OpenCV (cv2) is required for video decoding but is not installed. "
            "Install it with: pip install opencv-python-headless"
        )
    suffix = ".mp4"
    if video_bytes[:4] == b"\x1aE\xdf\xa3":
        suffix = ".webm"
    elif video_bytes[4:8] == b"ftyp":
        suffix = ".mp4"
    fd, path = tempfile.mkstemp(suffix=suffix)
    try:
        os.write(fd, video_bytes)
        os.close(fd)
        cap = cv2.VideoCapture(path)
        if not cap.isOpened():
            raise RuntimeError(
                "cv2.VideoCapture could not open the video file. "
                "The video format may be unsupported or the file may be corrupt."
            )
        return cap, path
    except Exception:
        os.close(fd)
        raise


def _release_cap(cap: Any, path: str) -> None:
    """Release VideoCapture and delete temp file."""
    try:
        cap.release()
    except Exception:
        pass
    try:
        os.unlink(path)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Core pose extraction
# ---------------------------------------------------------------------------


def _landmarks_to_keypoints(
    landmarks: Any,
) -> list[dict[str, Any]]:
    """Convert MediaPipe NormalizedLandmarkList to contract keypoints."""
    keypoints: list[dict[str, Any]] = []
    if landmarks is None:
        return keypoints
    for i, name in enumerate(_MEDIAPIPE_KEYPOINT_NAMES):
        if i < len(landmarks.landmark):
            lm = landmarks.landmark[i]
            keypoints.append(
                {
                    "id": name,
                    "x": _clamp01(lm.x),
                    "y": _clamp01(lm.y),
                    "z": _safe_float(lm.z, 0.0),
                    "confidence": _clamp01(lm.visibility if hasattr(lm, "visibility") else 0.0),
                    "visibility": _clamp01(lm.visibility if hasattr(lm, "visibility") else 0.0),
                }
            )
        else:
            keypoints.append(
                {
                    "id": name,
                    "x": 0.0,
                    "y": 0.0,
                    "z": 0.0,
                    "confidence": 0.0,
                    "visibility": 0.0,
                }
            )
    return keypoints


def _frame_confidence(keypoints: list[dict[str, Any]]) -> float:
    """Aggregate frame confidence from individual keypoint confidences."""
    if not keypoints:
        return 0.0
    return _clamp01(sum(kp["confidence"] for kp in keypoints) / len(keypoints))


# ---------------------------------------------------------------------------
# A. process_video
# ---------------------------------------------------------------------------


def process_video(video_bytes: bytes, sample_fps: float = 30.0) -> dict[str, Any]:
    """Decode a video and run MediaPipe BlazePose on sampled frames.

    Parameters
    ----------
    video_bytes:
        Raw video file bytes (mp4, webm, avi, mov, etc.).
    sample_fps:
        Target frame-rate to sample.  Frames are processed at uniform
        intervals; for a 30 FPS source and ``sample_fps=5``, every 6th
        frame is processed.

    Returns
    -------
    Pose sequence following the POSE SEQUENCE CONTRACT (see module docstring).

    Raises
    ------
    RuntimeError
        If MediaPipe or OpenCV is not available, or video decoding fails.
    """
    if not MEDIAPIPE_AVAILABLE:
        raise RuntimeError(
            "MediaPipe is not installed. Install it with: pip install mediapipe"
        )
    if cv2 is None:
        raise RuntimeError(
            "OpenCV is required for video decoding. Install it with: pip install opencv-python-headless"
        )
    if not video_bytes:
        raise RuntimeError("Empty video bytes provided.")

    cap, tmp_path = _bytes_to_cv2_cap(video_bytes)
    try:
        source_fps: float = cap.get(cv2.CAP_PROP_FPS) or sample_fps
        total_frames_src: int = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        frame_width: int = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 640)
        frame_height: int = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 480)

        if source_fps <= 0:
            source_fps = sample_fps

        sample_interval = max(1, int(round(source_fps / sample_fps)))

        # Configure MediaPipe Pose
        mp_pose = mp.solutions.pose
        with mp_pose.Pose(
            static_image_mode=False,
            model_complexity=1,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        ) as pose:
            frames: list[dict[str, Any]] = []
            frame_idx = 0
            processed = 0
            t0 = time.perf_counter()

            while True:
                ret, frame = cap.read()
                if not ret:
                    break

                if frame_idx % sample_interval == 0:
                    # Convert BGR -> RGB
                    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    result = pose.process(rgb)
                    timestamp_ms = (frame_idx / source_fps) * 1000.0
                    keypoints = _landmarks_to_keypoints(
                        result.pose_landmarks if result else None
                    )
                    conf = _frame_confidence(keypoints)
                    frames.append(
                        {
                            "frame_idx": processed,
                            "timestamp_ms": round(timestamp_ms, 2),
                            "keypoints": keypoints,
                            "confidence": round(conf, 4),
                        }
                    )
                    processed += 1
                frame_idx += 1

            elapsed_ms = (time.perf_counter() - t0) * 1000.0
            duration_ms = (
                (total_frames_src / source_fps) * 1000.0 if source_fps > 0 else 0.0
            )
            avg_conf = (
                round(sum(f["confidence"] for f in frames) / len(frames), 4)
                if frames
                else 0.0
            )

        return {
            "backend": "mediapipe",
            "version": str(_MEDIAPIPE_VERSION),
            "frames": frames,
            "summary": {
                "total_frames": len(frames),
                "fps": round(sample_fps, 1),
                "duration_ms": round(duration_ms, 1),
                "avg_confidence": avg_conf,
                "source_resolution": f"{frame_width}x{frame_height}",
                "source_fps": round(source_fps, 2),
                "source_total_frames": total_frames_src,
                "processing_time_ms": round(elapsed_ms, 1),
            },
        }
    finally:
        _release_cap(cap, tmp_path)


# ---------------------------------------------------------------------------
# B. process_image
# ---------------------------------------------------------------------------


def process_image(image_bytes: bytes) -> dict[str, Any]:
    """Run MediaPipe BlazePose on a single image.

    Parameters
    ----------
    image_bytes:
        Raw image file bytes (jpeg, png, etc.).

    Returns
    -------
    Pose sequence with a single frame following the POSE SEQUENCE CONTRACT.
    """
    if not MEDIAPIPE_AVAILABLE:
        raise RuntimeError(
            "MediaPipe is not installed. Install it with: pip install mediapipe"
        )
    if cv2 is None:
        raise RuntimeError(
            "OpenCV is required for image decoding. Install it with: pip install opencv-python-headless"
        )
    if not image_bytes:
        raise RuntimeError("Empty image bytes provided.")

    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise RuntimeError("Could not decode image bytes with OpenCV.")

    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    mp_pose = mp.solutions.pose
    with mp_pose.Pose(
        static_image_mode=True,
        model_complexity=1,
        min_detection_confidence=0.5,
    ) as pose:
        result = pose.process(rgb)
        keypoints = _landmarks_to_keypoints(
            result.pose_landmarks if result else None
        )
        conf = _frame_confidence(keypoints)

    return {
        "backend": "mediapipe",
        "version": str(_MEDIAPIPE_VERSION),
        "frames": [
            {
                "frame_idx": 0,
                "timestamp_ms": 0.0,
                "keypoints": keypoints,
                "confidence": round(conf, 4),
            }
        ],
        "summary": {
            "total_frames": 1,
            "fps": 0.0,
            "duration_ms": 0.0,
            "avg_confidence": round(conf, 4),
        },
    }


# ---------------------------------------------------------------------------
# C. Feature extraction
# ---------------------------------------------------------------------------


def _get_kp_trajectory(
    pose_sequence: dict[str, Any], kp_name: str
) -> np.ndarray:
    """Extract (N, 3) trajectory array [x, y, visibility] for a keypoint."""
    frames = pose_sequence.get("frames", [])
    if not frames:
        return np.zeros((0, 3))
    idx = _KEYPOINT_INVERSE.get(kp_name, -1)
    if idx < 0:
        return np.zeros((0, 3))
    traj = []
    for f in frames:
        kps = f.get("keypoints", [])
        if idx < len(kps):
            kp = kps[idx]
            traj.append(
                [kp.get("x", 0.0), kp.get("y", 0.0), kp.get("visibility", 0.0)]
            )
        else:
            traj.append([0.0, 0.0, 0.0])
    return np.array(traj, dtype=np.float64)


def _detected_confidence(pose_sequence: dict[str, Any]) -> float:
    """Overall detection confidence across all frames."""
    frames = pose_sequence.get("frames", [])
    if not frames:
        return 0.0
    return _clamp01(
        sum(f.get("confidence", 0.0) for f in frames) / len(frames)
    )


def _estimate_fps_from_sequence(pose_sequence: dict[str, Any]) -> float:
    """Derive effective FPS from timestamp deltas."""
    frames = pose_sequence.get("frames", [])
    if len(frames) < 2:
        return pose_sequence.get("summary", {}).get("fps", 30.0) or 30.0
    deltas = []
    for i in range(1, len(frames)):
        dt = frames[i]["timestamp_ms"] - frames[i - 1]["timestamp_ms"]
        if dt > 0:
            deltas.append(dt)
    if not deltas:
        return 30.0
    mean_dt = np.mean(deltas)
    return 1000.0 / mean_dt if mean_dt > 0 else 30.0


def _feature_result(
    value: float,
    confidence: float,
    unit: str,
    safe_wording: str,
    grade: str = "C",
) -> dict[str, Any]:
    """Build a standardised feature entry."""
    return {
        "value": round(float(value), 6) if not np.isnan(value) else None,
        "confidence": _clamp01(confidence),
        "grade": grade if grade in {"A", "B", "C", "D"} else "C",
        "safe_wording": safe_wording,
        "unit": unit,
    }


def extract_movement_features(pose_sequence: dict[str, Any]) -> dict[str, Any]:
    """Compute clinical movement features from a pose sequence.

    Uses only numpy / scipy (optional).  Every feature includes
    ``value``, ``confidence``, ``grade``, ``safe_wording``, and ``unit``.

    Parameters
    ----------
    pose_sequence:
        Output from :func:`process_video` or :func:`process_image`.

    Returns
    -------
    Nested dict with ``gait_features``, ``tremor_features``,
    ``finger_tap_features``, ``posture_features``, ``general_features``.
    """
    frames = pose_sequence.get("frames", [])
    if not frames:
        return {
            "gait_features": {},
            "tremor_features": {},
            "finger_tap_features": {},
            "posture_features": {},
            "general_features": {},
            "note": "Empty pose sequence; no features extracted.",
        }

    fps = _estimate_fps_from_sequence(pose_sequence)
    n_frames = len(frames)
    overall_conf = _detected_confidence(pose_sequence)

    # -- Trajectories --------------------------------------------------------
    left_ankle = _get_kp_trajectory(pose_sequence, "left_ankle")
    right_ankle = _get_kp_trajectory(pose_sequence, "right_ankle")
    left_wrist = _get_kp_trajectory(pose_sequence, "left_wrist")
    right_wrist = _get_kp_trajectory(pose_sequence, "right_wrist")
    left_shoulder = _get_kp_trajectory(pose_sequence, "left_shoulder")
    right_shoulder = _get_kp_trajectory(pose_sequence, "right_shoulder")
    left_hip = _get_kp_trajectory(pose_sequence, "left_hip")
    right_hip = _get_kp_trajectory(pose_sequence, "right_hip")
    left_knee = _get_kp_trajectory(pose_sequence, "left_knee")
    right_knee = _get_kp_trajectory(pose_sequence, "right_knee")
    left_elbow = _get_kp_trajectory(pose_sequence, "left_elbow")
    right_elbow = _get_kp_trajectory(pose_sequence, "right_elbow")
    nose = _get_kp_trajectory(pose_sequence, "nose")

    def _displacement(a: np.ndarray) -> np.ndarray:
        """Pixel displacement per frame."""
        if len(a) < 2:
            return np.zeros(0)
        return np.sqrt(np.sum(np.diff(a[:, :2], axis=0) ** 2, axis=1))

    def _angle_between(v1: np.ndarray, v2: np.ndarray) -> float:
        """Angle between two 2-D vectors (degrees)."""
        cos = np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2) + 1e-9)
        return math.degrees(math.acos(_clamp01(cos)))

    # =====================================================================
    # GAIT FEATURES
    # =====================================================================
    gait_conf = overall_conf

    # stride_length_m: max ankle-to-ankle horizontal distance
    if len(left_ankle) > 1 and len(right_ankle) > 1:
        ankle_distances = np.abs(left_ankle[:, 0] - right_ankle[:, 0])
        max_ankle_dist = float(np.nanmax(ankle_distances)) if len(ankle_distances) else 0.0
        stride_length_m = max_ankle_dist / _PIXELS_PER_METER
    else:
        stride_length_m = 0.0
        gait_conf *= 0.5

    # cadence: step peaks per minute from ankle vertical oscillation
    cadence_steps_per_min = 0.0
    if len(left_ankle) > 10:
        y_signal = left_ankle[:, 1]
        # Simple zero-crossing-based step detection
        centered = y_signal - np.mean(y_signal)
        zero_crossings = np.where(np.diff(np.sign(centered)))[0]
        n_steps = len(zero_crossings) / 2.0
        duration_min = n_frames / (fps * 60.0) if fps > 0 else 1.0
        if duration_min > 0:
            cadence_steps_per_min = n_steps / duration_min

    # step_time_variability_cv
    step_time_variability_cv = 0.0
    if len(zero_crossings) > 3:
        intervals = np.diff(zero_crossings) / fps if fps > 0 else np.diff(zero_crossings)
        if len(intervals) > 1 and np.mean(intervals) > 0:
            step_time_variability_cv = float(np.std(intervals) / (np.mean(intervals) + 1e-9))

    # gait_speed_m_per_s
    gait_speed_m_per_s = 0.0
    if len(left_ankle) > 1 and fps > 0:
        total_dx = float(np.sum(np.abs(np.diff(left_ankle[:, 0]))))
        total_time_s = n_frames / fps
        if total_time_s > 0:
            gait_speed_m_per_s = (total_dx / _PIXELS_PER_METER) / total_time_s

    # arm_swing_amplitude_deg
    arm_swing_amplitude_deg = 0.0
    arm_conf = gait_conf
    if len(left_shoulder) > 1 and len(left_wrist) > 1:
        angles = []
        for i in range(len(left_shoulder)):
            if left_shoulder[i, 2] > 0.3 and left_wrist[i, 2] > 0.3:
                v = left_wrist[i, :2] - left_shoulder[i, :2]
                angles.append(math.degrees(math.atan2(v[1], v[0])))
        if angles:
            arm_swing_amplitude_deg = float(np.max(angles) - np.min(angles))
    else:
        arm_conf *= 0.5

    # asymmetry_index: |left - right| / (left + right) for ankle displacement
    asymmetry_index = 0.0
    left_disp = float(np.sum(_displacement(left_ankle))) if len(left_ankle) > 1 else 0.0
    right_disp = float(np.sum(_displacement(right_ankle))) if len(right_ankle) > 1 else 0.0
    if (left_disp + right_disp) > 0:
        asymmetry_index = abs(left_disp - right_disp) / (left_disp + right_disp)

    gait_features = {
        "stride_length_m": _feature_result(
            stride_length_m,
            gait_conf,
            "m",
            "Estimated stride length derived from ankle landmark separation.",
            "C",
        ),
        "cadence_steps_per_min": _feature_result(
            cadence_steps_per_min,
            gait_conf,
            "steps/min",
            "Estimated step cadence from vertical ankle oscillation pattern.",
            "C",
        ),
        "step_time_variability_cv": _feature_result(
            step_time_variability_cv,
            gait_conf,
            "CV",
            "Step-to-step timing variability (lower values suggest more regular gait).",
            "C",
        ),
        "gait_speed_m_per_s": _feature_result(
            gait_speed_m_per_s,
            gait_conf,
            "m/s",
            "Estimated gait speed from horizontal ankle displacement over time.",
            "C",
        ),
        "arm_swing_amplitude_deg": _feature_result(
            arm_swing_amplitude_deg,
            arm_conf,
            "degrees",
            "Shoulder-wrist angle range during arm swing (reduced amplitude may indicate bradykinesia).",
            "C",
        ),
        "asymmetry_index": _feature_result(
            asymmetry_index,
            gait_conf,
            "ratio",
            "Left-right ankle displacement symmetry ratio (0 = symmetric, 1 = fully asymmetric).",
            "C",
        ),
    }

    # =====================================================================
    # TREMOR FEATURES
    # =====================================================================
    tremor_conf = overall_conf

    dominant_frequency_hz = 0.0
    band_power_4_6_hz = 0.0
    band_power_8_12_hz = 0.0
    tremor_amplitude_px = 0.0
    tremor_signal_to_noise = 0.0

    if signal is not None and len(left_wrist) > 32:
        # Use wrist y-position as tremor proxy
        y_data = left_wrist[:, 1]
        y_data = y_data - np.mean(y_data)
        n = len(y_data)
        # Welch PSD
        freqs, psd = signal.welch(y_data, fs=fps, nperseg=min(256, n))
        if len(psd) > 0:
            dominant_frequency_hz = float(freqs[np.argmax(psd)])
            # Band power 4-6 Hz
            mask_4_6 = (freqs >= 4.0) & (freqs <= 6.0)
            band_power_4_6_hz = float(np.trapezoid(psd[mask_4_6], freqs[mask_4_6])) if np.any(mask_4_6) else 0.0
            # Band power 8-12 Hz
            mask_8_12 = (freqs >= 8.0) & (freqs <= 12.0)
            band_power_8_12_hz = float(np.trapezoid(psd[mask_8_12], freqs[mask_8_12])) if np.any(mask_8_12) else 0.0
            # Tremor amplitude
            tremor_amplitude_px = float(np.std(y_data))
            # SNR
            total_power = float(np.trapezoid(psd, freqs)) if len(psd) > 1 else 1e-9
            tremor_band_power = band_power_4_6_hz + band_power_8_12_hz
            tremor_signal_to_noise = (
                tremor_band_power / (total_power - tremor_band_power + 1e-9)
            )
    else:
        tremor_conf *= 0.5
        if len(left_wrist) > 1:
            tremor_amplitude_px = float(np.std(left_wrist[:, 1]))

    tremor_features = {
        "dominant_frequency_hz": _feature_result(
            dominant_frequency_hz,
            tremor_conf,
            "Hz",
            "Dominant oscillation frequency in wrist trajectory (rest tremor typically 4-6 Hz).",
            "B" if signal is not None else "C",
        ),
        "band_power_4_6_hz": _feature_result(
            band_power_4_6_hz,
            tremor_conf,
            "arbitrary",
            "Power in the 4-6 Hz band (parkinsonian rest-tremor range).",
            "B" if signal is not None else "C",
        ),
        "band_power_8_12_hz": _feature_result(
            band_power_8_12_hz,
            tremor_conf,
            "arbitrary",
            "Power in the 8-12 Hz band (physiological tremor range).",
            "B" if signal is not None else "C",
        ),
        "tremor_amplitude_px": _feature_result(
            tremor_amplitude_px,
            tremor_conf,
            "px",
            "Standard deviation of wrist vertical displacement (proxy for tremor amplitude).",
            "C",
        ),
        "tremor_signal_to_noise": _feature_result(
            tremor_signal_to_noise,
            tremor_conf,
            "ratio",
            "Ratio of tremor-band power to total power.",
            "C",
        ),
    }

    # =====================================================================
    # FINGER TAP FEATURES
    # =====================================================================
    tap_conf = overall_conf
    # Use index finger vertical position as tapping proxy
    left_index_traj = _get_kp_trajectory(pose_sequence, "left_index")

    taps_per_10s = 0.0
    amplitude_decay_ratio = 0.0
    inter_tap_interval_cv = 0.0
    tapping_regularity_score = 0.0

    if len(left_index_traj) > 10:
        y_idx = left_index_traj[:, 1]
        y_idx = y_idx - np.mean(y_idx)
        # Peak detection for taps
        peaks = []
        for i in range(1, len(y_idx) - 1):
            if y_idx[i] > y_idx[i - 1] and y_idx[i] > y_idx[i + 1] and y_idx[i] > 0.01:
                peaks.append(i)
        duration_10s = (n_frames / fps) / 10.0 if fps > 0 else 1.0
        if duration_10s > 0:
            taps_per_10s = len(peaks) / duration_10s
        if len(peaks) > 3:
            intervals = np.diff(peaks) / fps if fps > 0 else np.diff(peaks)
            if len(intervals) > 1 and np.mean(intervals) > 0:
                inter_tap_interval_cv = float(np.std(intervals) / np.mean(intervals))
            # Regularity: 1 - CV (higher = more regular)
            tapping_regularity_score = _clamp01(1.0 - inter_tap_interval_cv)
            # Amplitude decay: compare first half to second half
            mid = len(peaks) // 2
            if mid > 0:
                amp_first = float(np.mean([y_idx[p] for p in peaks[:mid]])) if mid > 0 else 1e-9
                amp_second = float(np.mean([y_idx[p] for p in peaks[mid:]])) if (len(peaks) - mid) > 0 else 1e-9
                if amp_first > 0:
                    amplitude_decay_ratio = amp_second / amp_first
    else:
        tap_conf *= 0.5

    finger_tap_features = {
        "taps_per_10s": _feature_result(
            taps_per_10s,
            tap_conf,
            "taps/10s",
            "Estimated finger tapping rate over 10-second windows.",
            "C",
        ),
        "amplitude_decay_ratio": _feature_result(
            amplitude_decay_ratio,
            tap_conf,
            "ratio",
            "Ratio of late-tap amplitude to early-tap amplitude (fatigue indicator).",
            "C",
        ),
        "inter_tap_interval_cv": _feature_result(
            inter_tap_interval_cv,
            tap_conf,
            "CV",
            "Variability in inter-tap intervals (higher = more irregular).",
            "C",
        ),
        "tapping_regularity_score": _feature_result(
            tapping_regularity_score,
            tap_conf,
            "0-1",
            "Regularity of tapping rhythm (1.0 = perfectly regular).",
            "C",
        ),
    }

    # =====================================================================
    # POSTURE FEATURES
    # =====================================================================
    post_conf = overall_conf

    sway_area_px2 = 0.0
    sway_velocity_px_per_s = 0.0
    romberg_ratio = 0.0
    balance_confidence_score = 0.0

    if len(nose) > 5:
        # Sway area: convex hull area of nose trajectory (proxy for CoP)
        pts = nose[:, :2]
        if len(pts) >= 3:
            # Simple bounding-box proxy for sway area
            sway_area_px2 = float(
                (np.max(pts[:, 0]) - np.min(pts[:, 0]))
                * (np.max(pts[:, 1]) - np.min(pts[:, 1]))
            )
        # Sway velocity: mean displacement per second
        displacements = _displacement(nose)
        total_sway_px = float(np.sum(displacements))
        total_time_s = n_frames / fps if fps > 0 else 1.0
        if total_time_s > 0:
            sway_velocity_px_per_s = total_sway_px / total_time_s
        # Balance confidence: inverse of sway (normalized)
        balance_confidence_score = _clamp01(1.0 - sway_area_px2 * 10.0)
        # Romberg ratio: eyes-open / eyes-closed sway (placeholder: we don't
        # know eyes state, so return 1.0 as neutral)
        romberg_ratio = 1.0
    else:
        post_conf *= 0.5

    posture_features = {
        "sway_area_px2": _feature_result(
            sway_area_px2,
            post_conf,
            "px\u00b2",
            "Approximate postural sway area from nose trajectory (proxy for center-of-pressure area).",
            "C",
        ),
        "sway_velocity_px_per_s": _feature_result(
            sway_velocity_px_per_s,
            post_conf,
            "px/s",
            "Mean sway velocity of nose landmark.",
            "C",
        ),
        "romberg_ratio": _feature_result(
            romberg_ratio,
            0.3,
            "ratio",
            "Eyes-open to eyes-closed sway ratio (placeholder; requires condition labeling).",
            "D",
        ),
        "balance_confidence_score": _feature_result(
            balance_confidence_score,
            post_conf,
            "0-1",
            "Inverted-normalized sway area as a balance-confidence proxy.",
            "C",
        ),
    }

    # =====================================================================
    # GENERAL FEATURES
    # =====================================================================
    gen_conf = overall_conf

    # movement_smoothness: log dimensionless jerk (lower = smoother)
    movement_smoothness_jerk = 0.0
    total_body_movement_px = 0.0
    keypoint_coverage_percent = 0.0

    # Compute total body movement from all keypoints
    all_kps = [
        "nose", "left_shoulder", "right_shoulder", "left_hip", "right_hip",
        "left_knee", "right_knee", "left_ankle", "right_ankle",
        "left_wrist", "right_wrist", "left_elbow", "right_elbow",
    ]
    total_movement = 0.0
    visible_count = 0
    total_kp_frames = 0
    for kp_name in all_kps:
        traj = _get_kp_trajectory(pose_sequence, kp_name)
        if len(traj) > 1:
            total_movement += float(np.sum(_displacement(traj)))
            visible_count += int(np.sum(traj[:, 2] > 0.3))
            total_kp_frames += len(traj)

    total_body_movement_px = total_movement

    if total_kp_frames > 0:
        keypoint_coverage_percent = 100.0 * visible_count / total_kp_frames

    # Log dimensionless jerk from nose trajectory
    if len(nose) > 3 and fps > 0:
        pos = nose[:, :2]
        dt = 1.0 / fps
        vel = np.diff(pos, axis=0) / dt
        acc = np.diff(vel, axis=0) / dt
        jerk = np.diff(acc, axis=0) / dt
        if len(jerk) > 0:
            path_len = float(np.sum(np.sqrt(np.sum(np.diff(pos, axis=0) ** 2, axis=1))))
            duration = len(nose) / fps
            mean_jerk = float(np.mean(np.sqrt(np.sum(jerk ** 2, axis=1))))
            if path_len > 0 and duration > 0:
                movement_smoothness_jerk = -math.log(
                    (mean_jerk * (duration ** 3) / (path_len ** 2)) + 1e-9
                )

    general_features = {
        "movement_smoothness_jerk": _feature_result(
            movement_smoothness_jerk,
            gen_conf,
            "dimensionless",
            "Log dimensionless jerk (higher values indicate smoother movement).",
            "B",
        ),
        "total_body_movement_px": _feature_result(
            total_body_movement_px,
            gen_conf,
            "px",
            "Cumulative pixel displacement across major body landmarks.",
            "B",
        ),
        "keypoint_coverage_percent": _feature_result(
            keypoint_coverage_percent,
            gen_conf,
            "percent",
            "Percentage of keypoint-frames with visibility > 0.3.",
            "A",
        ),
    }

    return {
        "gait_features": gait_features,
        "tremor_features": tremor_features,
        "finger_tap_features": finger_tap_features,
        "posture_features": posture_features,
        "general_features": general_features,
        "overall_confidence": round(gen_conf, 4),
        "frames_processed": n_frames,
        "effective_fps": round(fps, 2),
    }


# ---------------------------------------------------------------------------
# D. Video quality assessment
# ---------------------------------------------------------------------------


def assess_video_quality(video_bytes: bytes) -> dict[str, Any]:
    """Assess video quality metrics using OpenCV.

    Parameters
    ----------
    video_bytes:
        Raw video file bytes.

    Returns
    -------
    dict with resolution, frame_rate, duration_ms, lighting_score,
    occlusion_score, blur_score, overall_quality, recommendations.
    """
    if cv2 is None:
        raise RuntimeError(
            "OpenCV is required for video quality assessment. "
            "Install it with: pip install opencv-python-headless"
        )
    if not video_bytes:
        raise RuntimeError("Empty video bytes provided.")

    cap, tmp_path = _bytes_to_cv2_cap(video_bytes)
    recommendations: list[str] = []

    try:
        frame_rate = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
        duration_ms = (total_frames / frame_rate * 1000.0) if frame_rate > 0 else 0.0

        # Sample frames for quality metrics
        sample_frames: list[np.ndarray] = []
        frame_idx = 0
        max_samples = 30
        while len(sample_frames) < max_samples:
            ret, frame = cap.read()
            if not ret:
                break
            if frame_idx % max(1, total_frames // max_samples if total_frames > 0 else 1) == 0:
                sample_frames.append(frame)
            frame_idx += 1

        # Lighting score from luminance histogram
        lighting_score = 0.0
        if sample_frames:
            luminance_scores = []
            for frame in sample_frames:
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                mean_lum = float(np.mean(gray)) / 255.0
                std_lum = float(np.std(gray)) / 255.0
                # Ideal: mean 0.3-0.7, moderate std
                if 0.3 <= mean_lum <= 0.7:
                    score = 0.5 + 0.5 * (1.0 - abs(mean_lum - 0.5) / 0.2)
                elif mean_lum < 0.2:
                    score = mean_lum / 0.2 * 0.3
                elif mean_lum > 0.8:
                    score = (1.0 - mean_lum) / 0.2 * 0.3
                else:
                    score = 0.3 + 0.4 * (1.0 - abs(mean_lum - 0.5) / 0.3)
                # Penalize very low contrast
                if std_lum < 0.05:
                    score *= 0.5
                luminance_scores.append(_clamp01(score))
            lighting_score = float(np.mean(luminance_scores)) if luminance_scores else 0.5

        # Blur score: Laplacian variance
        blur_score = 0.0
        if sample_frames:
            blur_scores = []
            for frame in sample_frames:
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                lap_var = cv2.Laplacian(gray, cv2.CV_64F).var()
                # Normalize: 100+ variance = sharp, < 50 = blurry
                score = _clamp01(lap_var / 200.0)
                blur_scores.append(score)
            blur_score = float(np.mean(blur_scores)) if blur_scores else 0.5

        # Occlusion score: use MediaPipe to check keypoint visibility
        occlusion_score = 0.0
        if MEDIAPIPE_AVAILABLE and sample_frames:
            mp_pose = mp.solutions.pose
            visibilities = []
            with mp_pose.Pose(
                static_image_mode=True,
                model_complexity=0,  # fast
                min_detection_confidence=0.3,
            ) as pose:
                for frame in sample_frames:
                    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    result = pose.process(rgb)
                    if result.pose_landmarks:
                        vis = [
                            lm.visibility
                            for lm in result.pose_landmarks.landmark
                        ]
                        visibilities.append(float(np.mean(vis)) if vis else 0.0)
                    else:
                        visibilities.append(0.0)
            occlusion_score = (
                float(np.mean(visibilities)) if visibilities else 0.0
            )
        else:
            occlusion_score = 0.5  # neutral if no pose detection
            if not MEDIAPIPE_AVAILABLE:
                recommendations.append(
                    "Install mediapipe for occlusion detection from pose keypoint visibility."
                )

        # Overall quality classification
        factors = []
        if frame_width >= 640 and frame_height >= 480:
            factors.append(0.25)
        else:
            recommendations.append(
                f"Resolution ({frame_width}x{frame_height}) is below recommended 640x480. "
                "Re-record at 720p or higher for optimal analysis."
            )

        if frame_rate >= 15:
            factors.append(0.25)
        else:
            recommendations.append(
                f"Frame rate ({frame_rate:.1f} FPS) is below 15 FPS. "
                "Rapid movement detection may be unreliable; use 30 FPS if possible."
            )

        if lighting_score >= 0.4:
            factors.append(0.20)
        else:
            recommendations.append(
                f"Lighting score ({lighting_score:.2f}) is low. "
                "Record in a well-lit environment with even front-facing lighting."
            )

        if blur_score >= 0.3:
            factors.append(0.15)
        else:
            recommendations.append(
                f"Blur score ({blur_score:.2f}) indicates significant motion blur or out-of-focus capture. "
                "Ensure the camera is stationary and the subject is in focus."
            )

        if occlusion_score >= 0.5:
            factors.append(0.15)
        else:
            recommendations.append(
                f"Occlusion score ({occlusion_score:.2f}) suggests body parts may be hidden. "
                "Position camera to capture the full body without obstruction."
            )

        overall = sum(factors)

        if overall >= 0.8:
            overall_quality = "excellent"
        elif overall >= 0.6:
            overall_quality = "good"
        elif overall >= 0.4:
            overall_quality = "fair"
        else:
            overall_quality = "poor"

        if overall_quality in ("fair", "poor"):
            recommendations.append(
                "Consider re-recording the video with the above recommendations for reliable pose-based analysis."
            )

        return {
            "resolution": f"{frame_width}x{frame_height}",
            "frame_rate": round(frame_rate, 1),
            "duration_ms": round(duration_ms, 1),
            "lighting_score": round(lighting_score, 4),
            "occlusion_score": round(occlusion_score, 4),
            "blur_score": round(blur_score, 4),
            "overall_quality": overall_quality,
            "overall_quality_score": round(overall, 4),
            "recommendations": recommendations,
        }
    finally:
        _release_cap(cap, tmp_path)


# ---------------------------------------------------------------------------
# Legacy PoseEstimationBackend class (backward-compatible wrapper)
# ---------------------------------------------------------------------------


class PoseBackendType(str, Enum):
    """Supported pose estimation backend implementations."""

    MEDIAPIPE = "mediapipe"
    MOVENET = "movenet"
    YOLO_POSE = "yolo_pose"
    DISABLED = "disabled"


class PoseEstimationBackend:
    """Pluggable pose estimation for video movement analysis.

    Default: MediaPipe BlazePose (Apache-2.0)
    - 33 keypoints, ICC=0.94 vs physiotherapists
    - 30 FPS on mobile, 60+ FPS on desktop
    - On-device inference, no network required

    Decision-support only: pose data requires clinician review.
    """

    def __init__(self, backend_type: PoseBackendType = PoseBackendType.DISABLED) -> None:
        self.backend_type = backend_type
        self._impl = None

    # ------------------------------------------------------------------
    # Lifecycle helpers
    # ------------------------------------------------------------------

    def is_available(self) -> bool:
        """Return True if a backend other than DISABLED is configured."""
        if self.backend_type == PoseBackendType.DISABLED:
            return False
        if self.backend_type == PoseBackendType.MEDIAPIPE:
            return MEDIAPIPE_AVAILABLE
        return True

    def get_backend_info(self) -> dict[str, str]:
        """Return metadata about the configured backend."""
        backend_info = {
            PoseBackendType.MEDIAPIPE: {
                "name": "MediaPipe BlazePose",
                "license": "Apache-2.0",
                "keypoints": "33",
                "icc": "0.94",
                "fps_mobile": "30",
                "fps_desktop": "60+",
                "inference": "on-device",
                "description": "Google MediaPipe BlazePose; 33 keypoints with visibility scores",
                "installed": str(MEDIAPIPE_AVAILABLE),
            },
            PoseBackendType.MOVENET: {
                "name": "MoveNet",
                "license": "Apache-2.0",
                "keypoints": "17",
                "icc": "0.90",
                "fps_mobile": "30",
                "fps_desktop": "120+",
                "inference": "on-device",
                "description": "TensorFlow MoveNet; 17 keypoints, optimized for speed",
                "installed": "False",
            },
            PoseBackendType.YOLO_POSE: {
                "name": "YOLO-Pose",
                "license": "AGPL-3.0",
                "keypoints": "17",
                "icc": "0.88",
                "fps_mobile": "15",
                "fps_desktop": "60+",
                "inference": "on-device",
                "description": "Ultralytics YOLO-Pose; bounding box + keypoints",
                "installed": "False",
            },
            PoseBackendType.DISABLED: {
                "name": "Disabled",
                "license": "n/a",
                "keypoints": "0",
                "icc": "n/a",
                "fps_mobile": "0",
                "fps_desktop": "0",
                "inference": "none",
                "description": "Pose estimation is disabled; no pose analysis will be performed",
                "installed": "n/a",
            },
        }
        return backend_info.get(self.backend_type, backend_info[PoseBackendType.DISABLED])

    # ------------------------------------------------------------------
    # Core API
    # ------------------------------------------------------------------

    def estimate_pose(self, video_bytes: bytes) -> dict[str, Any]:
        """Return pose keypoints for a video frame sequence.

        Delegates to :func:`process_video` when MediaPipe is available,
        otherwise returns a graceful degradation response.
        """
        if not self.is_available():
            return {
                "available": False,
                "reason": "pose_estimation_disabled",
                "note": "Pose estimation is disabled. Configure a backend to enable analysis.",
            }

        if self.backend_type == PoseBackendType.MEDIAPIPE:
            if not MEDIAPIPE_AVAILABLE:
                return {
                    "available": False,
                    "reason": "mediapipe_not_installed",
                    "note": "MediaPipe is not installed. Install it with: pip install mediapipe",
                }
            try:
                return process_video(video_bytes)
            except Exception as exc:
                _log.exception("MediaPipe pose estimation failed")
                return {
                    "available": True,
                    "backend": "mediapipe",
                    "error": str(exc),
                    "frames": [],
                    "summary": {
                        "total_frames": 0,
                        "fps": 0,
                        "duration_ms": 0,
                        "avg_confidence": 0.0,
                    },
                }

        return {
            "available": True,
            "backend": self.backend_type.value,
            "version": "stub_0.1.0",
            "frames": [],
            "summary": {
                "total_frames": 0,
                "avg_confidence": 0.0,
                "keypoints_tracked": 0,
            },
            "note": (
                "Pose estimation backend is configured but running in stub mode. "
                "Install mediapipe for live inference."
            ),
        }

    def extract_movement_features(self, pose_sequence: dict[str, Any]) -> dict[str, Any]:
        """Extract clinical movement features from pose sequence.

        Delegates to :func:`extract_movement_features`.
        """
        frames = pose_sequence.get("frames", [])
        if not frames:
            return {
                "features_extracted": False,
                "note": "No pose frames available for feature extraction.",
                "feature_schema": dict(_MOVEMENT_FEATURE_SCHEMA),
            }
        try:
            result = extract_movement_features(pose_sequence)
            result["features_extracted"] = True
            return result
        except Exception as exc:
            _log.exception("Feature extraction failed")
            return {
                "features_extracted": False,
                "error": str(exc),
                "note": "Feature extraction encountered an error.",
                "feature_schema": dict(_MOVEMENT_FEATURE_SCHEMA),
            }

    # ------------------------------------------------------------------
    # Stub helpers for testing / frontend integration
    # ------------------------------------------------------------------

    def mock_keypoints_for_frame(
        self,
        frame_idx: int = 0,
        timestamp_ms: float = 0.0,
        confidence: float = 0.92,
    ) -> dict[str, Any]:
        """Return a single frame with mock keypoint data for all 33 landmarks."""
        keypoints = []
        for i, name in enumerate(_MEDIAPIPE_KEYPOINT_NAMES):
            angle = (i / len(_MEDIAPIPE_KEYPOINT_NAMES)) * 2 * math.pi
            base_x = 0.5 + 0.1 * math.cos(angle)
            base_y = 0.3 + 0.15 * math.sin(angle)
            x = _clamp01(base_x + frame_idx * 0.001)
            y = _clamp01(base_y + frame_idx * 0.0005)
            keypoints.append(
                {
                    "id": name,
                    "x": round(x, 4),
                    "y": round(y, 4),
                    "z": round(0.0, 4),
                    "confidence": round(confidence, 4),
                    "visibility": round(confidence * 0.98, 4),
                }
            )
        return {
            "frame_idx": frame_idx,
            "timestamp_ms": timestamp_ms,
            "keypoints": keypoints,
            "confidence": round(confidence, 4),
        }

    def mock_pose_result(self, num_frames: int = 10) -> dict[str, Any]:
        """Return a mock pose estimation result with synthetic keypoint data."""
        frames = []
        for i in range(num_frames):
            frame = self.mock_keypoints_for_frame(
                frame_idx=i,
                timestamp_ms=i * 33.33,
                confidence=0.85 + 0.1 * (i % 3) / 2,
            )
            frames.append(frame)
        avg_conf = (
            round(sum(f["confidence"] for f in frames) / len(frames), 4)
            if frames
            else 0.0
        )
        return {
            "available": True,
            "backend": self.backend_type.value,
            "version": "stub_0.1.0",
            "frames": frames,
            "summary": {
                "total_frames": num_frames,
                "avg_confidence": avg_conf,
                "keypoints_tracked": len(_MEDIAPIPE_KEYPOINT_NAMES),
            },
        }


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------


#: Clinical movement feature schema for evidence-based assessment
_MOVEMENT_FEATURE_SCHEMA: dict[str, dict[str, str]] = {
    "gait_speed": {"unit": "m/s", "confidence_range": "0.0-1.0"},
    "stride_length": {"unit": "m", "confidence_range": "0.0-1.0"},
    "arm_swing_amplitude": {"unit": "degrees", "confidence_range": "0.0-1.0"},
    "tremor_band_power_4_6hz": {"unit": "arbitrary", "confidence_range": "0.0-1.0"},
    "postural_sway_area": {"unit": "mm\u00b2", "confidence_range": "0.0-1.0"},
    "movement_smoothness": {"unit": "dimensionless", "confidence_range": "0.0-1.0"},
    "asymmetry_index": {"unit": "ratio", "confidence_range": "0.0-1.0"},
}


def get_pose_backend() -> PoseEstimationBackend:
    """Factory: returns configured pose estimation backend.

    Reads ``pose_backend_type`` from app settings (default: ``disabled``).
    Falls back to DISABLED on unknown values.
    """
    try:
        from app.settings import get_settings

        settings = get_settings()
        backend_type_str = getattr(settings, "pose_backend_type", "disabled")
    except Exception:
        _log.warning("Could not load settings for pose backend; using disabled.")
        return PoseEstimationBackend(PoseBackendType.DISABLED)

    try:
        backend_type = PoseBackendType(str(backend_type_str).lower().strip())
    except ValueError:
        _log.warning(
            "Unknown pose backend type: %r. Using disabled. "
            "Valid options: %s",
            backend_type_str,
            ", ".join([e.value for e in PoseBackendType]),
        )
        backend_type = PoseBackendType.DISABLED

    return PoseEstimationBackend(backend_type)
