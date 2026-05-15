"""
Posture & Balance Analysis Pipeline
=====================================
Production pipeline for postural sway analysis from pose keypoint sequences.

Features:
    - Postural Sway Area (convex hull of nose trajectory)
    - Sway Velocity (mean velocity of nose trajectory)
    - Sway Path Length (total path length of nose trajectory)
    - AP vs ML Sway Ratio (anteroposterior vs mediolateral)
    - Romberg Proxy (eyes-closed / eyes-open sway ratio)
    - Body Lean Angle (trunk angle from vertical)
    - Balance Confidence Score (composite 0-100)

Input: Pose keypoint time series (nose, shoulders, hips, ankles)
Output: Structured posture analysis with evidence grades and safe clinical wording

Evidence Grades:
    - Grade B: Sway area, velocity, path length, Romberg proxy
    - Grade C: AP/ML ratio, body lean angle, balance confidence score

References:
    - Sway area correlates with Berg Balance Scale (r=-0.71)
    - Romberg quotient >1.5 suggests proprioceptive deficit
    - Body lean >5 deg forward may indicate parkinsonian posture

DISCLAIMER: Decision-support only. Requires clinical correlation.
"""

import numpy as np
from scipy.spatial import ConvexHull
from typing import Any

# ---------------------------------------------------------------------------
# Safe clinical wording templates
# ---------------------------------------------------------------------------

_SAFE_WORDING_SWAY_AREA = (
    "Postural sway area is a proxy marker for balance assessment. "
    "Sway area correlates with Berg Balance Scale (r=-0.71). "
    "Not a fall-risk determination. Requires clinical correlation."
)

_SAFE_WORDING_SWAY_VELOCITY = (
    "Sway velocity indicates movement stability during quiet standing. "
    "Higher values suggest increased postural instability. "
    "Not a fall-risk determination. Requires clinical correlation."
)

_SAFE_WORDING_SWAY_PATH = (
    "Sway path length reflects cumulative postural displacement. "
    "Longer paths indicate greater postural adjustment. "
    "Not a fall-risk determination. Requires clinical correlation."
)

_SAFE_WORDING_AP_ML = (
    "AP/ML sway ratio characterizes directional sway patterns. "
    "Different conditions show different patterns. "
    "Interpret with caution. Requires clinical correlation."
)

_SAFE_WORDING_ROMBERG = (
    "Romberg proxy compares eyes-closed vs eyes-open sway. "
    "Values >1.5 suggest proprioceptive deficit warranting review. "
    "Requires clinical confirmation. Not a diagnostic test."
)

_SAFE_WORDING_BODY_LEAN = (
    "Body lean angle may support review of postural alignment. "
    "Camera angle affects measurement accuracy. "
    ">5 degrees forward may indicate parkinsonian posture review. "
    "Requires clinical correlation."
)

_SAFE_WORDING_BALANCE_CONFIDENCE = (
    "Balance confidence score is a composite index (0-100). "
    "Higher scores suggest better postural stability. "
    "Not a clinical balance scale replacement. Requires professional assessment."
)

# ---------------------------------------------------------------------------
# Minimum frame thresholds
# ---------------------------------------------------------------------------
_MIN_FRAMES_FOR_SWAY = 10          # Minimum points for convex hull
_MIN_DURATION_SECONDS = 2.0        # Need at least 2 seconds of data
_MIN_CONFIDENCE_THRESHOLD = 0.3    # Minimum keypoint confidence

# ---------------------------------------------------------------------------
# Normalization constants for balance confidence score
# These are approximate empirically-derived reference ranges
# ---------------------------------------------------------------------------
_REF_SWAY_AREA_MAX = 2000.0        # px^2 - upper reference
_REF_SWAY_VELOCITY_MAX = 50.0      # px/s - upper reference
_REF_AP_ML_MAX = 3.0               # ratio - upper reference
_REF_BODY_LEAN_MAX = 15.0          # degrees - upper reference


# ===========================================================================
# Helper functions
# ===========================================================================

def _validate_trajectory(trajectory: np.ndarray, min_points: int = 2) -> tuple[bool, str]:
    """Validate a trajectory array has sufficient valid data.

    Args:
        trajectory: Nx2 or Nx3 array of positions
        min_points: Minimum number of valid points required

    Returns:
        Tuple of (is_valid, reason_if_invalid)
    """
    if trajectory is None or trajectory.size == 0:
        return False, "Empty trajectory"

    if len(trajectory.shape) < 2 or trajectory.shape[1] < 2:
        return False, f"Expected Nx2 array, got shape {trajectory.shape}"

    # Check for NaN/Inf
    valid_mask = np.all(np.isfinite(trajectory[:, :2]), axis=1)
    valid_count = int(np.sum(valid_mask))

    if valid_count < min_points:
        return False, f"Only {valid_count} valid points (need {min_points})"

    # Check for all identical points (zero variance)
    valid_pts = trajectory[valid_mask, :2]
    if np.allclose(valid_pts, valid_pts[0]):
        return False, "All points are identical (no movement detected)"

    return True, ""


def _compute_confidence(valid_points: int, min_required: int, grade: str = "B") -> float:
    """Compute confidence score based on data quality.

    Args:
        valid_points: Number of valid data points
        min_required: Minimum required points
        grade: Evidence grade ("B" or "C")

    Returns:
        Confidence value between 0.0 and 1.0
    """
    base_confidence = 0.85 if grade == "B" else 0.70

    # Penalize for insufficient data
    if valid_points < min_required:
        data_ratio = valid_points / min_required if min_required > 0 else 0.0
    else:
        # Bonus up to 1.0 for extra data
        data_ratio = min(1.0, 0.5 + 0.5 * (valid_points / (min_required * 2)))

    # Grade C gets lower base
    grade_factor = 0.85 if grade == "B" else 0.68

    confidence = grade_factor * data_ratio
    return round(float(np.clip(confidence, 0.35, 0.95)), 2)


# ===========================================================================
# Feature extraction functions
# ===========================================================================

def extract_body_keypoints(frames: list) -> dict[str, np.ndarray]:
    """Extract nose, shoulder_center, hip_center, ankle trajectories from pose frames.

    Expected frame structure (per frame):
        {
            "keypoints": {
                "nose": {"x": float, "y": float, "confidence": float},
                "left_shoulder": {"x": float, "y": float, "confidence": float},
                "right_shoulder": {"x": float, "y": float, "confidence": float},
                "left_hip": {"x": float, "y": float, "confidence": float},
                "right_hip": {"x": float, "y": float, "confidence": float},
                "left_ankle": {"x": float, "y": float, "confidence": float},
                "right_ankle": {"x": float, "y": float, "confidence": float},
            }
        }

    Args:
        frames: List of pose frames

    Returns:
        Dictionary with trajectory arrays:
            - "nose": Nx2 array
            - "shoulder_center": Nx2 array (midpoint of L/R shoulders)
            - "hip_center": Nx2 array (midpoint of L/R hips)
            - "ankle_center": Nx2 array (midpoint of L/R ankles)
            - "left_shoulder": Nx2 array
            - "right_shoulder": Nx2 array
            - "left_hip": Nx2 array
            - "right_hip": Nx2 array
            - "left_ankle": Nx2 array
            - "right_ankle": Nx2 array
    """
    nose_pts = []
    shoulder_center_pts = []
    hip_center_pts = []
    ankle_center_pts = []
    left_shoulder_pts = []
    right_shoulder_pts = []
    left_hip_pts = []
    right_hip_pts = []
    left_ankle_pts = []
    right_ankle_pts = []

    for frame in frames:
        kp = frame.get("keypoints", {})

        # Nose
        nose = kp.get("nose", {})
        nose_pts.append([nose.get("x", np.nan), nose.get("y", np.nan)])

        # Shoulders
        ls = kp.get("left_shoulder", {})
        rs = kp.get("right_shoulder", {})
        left_shoulder_pts.append([ls.get("x", np.nan), ls.get("y", np.nan)])
        right_shoulder_pts.append([rs.get("x", np.nan), rs.get("y", np.nan)])

        if all(k in ls and k in rs for k in ("x", "y")):
            sc_x = (ls["x"] + rs["x"]) / 2.0
            sc_y = (ls["y"] + rs["y"]) / 2.0
        else:
            sc_x, sc_y = np.nan, np.nan
        shoulder_center_pts.append([sc_x, sc_y])

        # Hips
        lh = kp.get("left_hip", {})
        rh = kp.get("right_hip", {})
        left_hip_pts.append([lh.get("x", np.nan), lh.get("y", np.nan)])
        right_hip_pts.append([rh.get("x", np.nan), rh.get("y", np.nan)])

        if all(k in lh and k in rh for k in ("x", "y")):
            hc_x = (lh["x"] + rh["x"]) / 2.0
            hc_y = (lh["y"] + rh["y"]) / 2.0
        else:
            hc_x, hc_y = np.nan, np.nan
        hip_center_pts.append([hc_x, hc_y])

        # Ankles
        la = kp.get("left_ankle", {})
        ra = kp.get("right_ankle", {})
        left_ankle_pts.append([la.get("x", np.nan), la.get("y", np.nan)])
        right_ankle_pts.append([ra.get("x", np.nan), ra.get("y", np.nan)])

        if all(k in la and k in ra for k in ("x", "y")):
            ac_x = (la["x"] + ra["x"]) / 2.0
            ac_y = (la["y"] + ra["y"]) / 2.0
        else:
            ac_x, ac_y = np.nan, np.nan
        ankle_center_pts.append([ac_x, ac_y])

    return {
        "nose": np.array(nose_pts, dtype=np.float64),
        "shoulder_center": np.array(shoulder_center_pts, dtype=np.float64),
        "hip_center": np.array(hip_center_pts, dtype=np.float64),
        "ankle_center": np.array(ankle_center_pts, dtype=np.float64),
        "left_shoulder": np.array(left_shoulder_pts, dtype=np.float64),
        "right_shoulder": np.array(right_shoulder_pts, dtype=np.float64),
        "left_hip": np.array(left_hip_pts, dtype=np.float64),
        "right_hip": np.array(right_hip_pts, dtype=np.float64),
        "left_ankle": np.array(left_ankle_pts, dtype=np.float64),
        "right_ankle": np.array(right_ankle_pts, dtype=np.float64),
    }


# ===========================================================================
# Postural sway features
# ===========================================================================

def compute_sway_area(nose_trajectory: np.ndarray) -> dict:
    """Compute convex hull area of nose trajectory (proxy for COP sway area).

    The convex hull encloses the full region of postural sway.
    Sway area correlates with Berg Balance Scale (r=-0.71).

    Args:
        nose_trajectory: Nx2 array of (x, y) nose positions over time

    Returns:
        Dictionary with:
            - value: Sway area in px^2
            - unit: "px^2"
            - confidence: Computed confidence score
            - grade: "B"
            - safe_wording: Clinical disclaimer
            - note: Optional note about computation
    """
    result = {
        "value": 0.0,
        "unit": "px^2",
        "confidence": 0.0,
        "grade": "B",
        "safe_wording": _SAFE_WORDING_SWAY_AREA,
        "note": "",
    }

    is_valid, reason = _validate_trajectory(nose_trajectory, min_points=_MIN_FRAMES_FOR_SWAY)
    if not is_valid:
        result["note"] = f"Cannot compute sway area: {reason}"
        result["confidence"] = 0.30
        return result

    # Filter to valid 2D points
    pts = nose_trajectory[:, :2]
    valid_mask = np.all(np.isfinite(pts), axis=1)
    valid_pts = pts[valid_mask]

    # Need at least 3 non-collinear points for a 2D convex hull
    if len(valid_pts) < 3:
        result["note"] = "Insufficient valid points for convex hull (need >= 3)"
        result["confidence"] = 0.35
        return result

    # Remove duplicate points
    valid_pts = np.unique(valid_pts, axis=0)

    if len(valid_pts) < 3:
        result["note"] = "All valid points are identical (no movement detected)"
        result["confidence"] = 0.35
        return result

    try:
        hull = ConvexHull(valid_pts)
        area = float(hull.volume)  # In 2D, scipy uses .volume for area

        # Check for degenerate hull (collinear points)
        if area < 1e-9:
            result["note"] = "Degenerate hull (nearly collinear points); using bounding box proxy"
            # Fallback: use bounding box area as proxy
            x_range = float(np.ptp(valid_pts[:, 0]))
            y_range = float(np.ptp(valid_pts[:, 1]))
            area = x_range * y_range
            result["confidence"] = _compute_confidence(len(valid_pts), _MIN_FRAMES_FOR_SWAY, "B") * 0.70
        else:
            result["confidence"] = _compute_confidence(len(valid_pts), _MIN_FRAMES_FOR_SWAY, "B")

        result["value"] = round(area, 2)
        result["note"] = result.get("note", "") or f"Computed from {len(valid_pts)} valid points"

    except Exception as e:
        # Degenerate case fallback
        result["note"] = f"ConvexHull failed ({str(e)}); using bounding box proxy"
        x_range = float(np.ptp(valid_pts[:, 0]))
        y_range = float(np.ptp(valid_pts[:, 1]))
        area = x_range * y_range
        result["value"] = round(area, 2)
        result["confidence"] = _compute_confidence(len(valid_pts), _MIN_FRAMES_FOR_SWAY, "B") * 0.60

    return result


def compute_sway_velocity(nose_trajectory: np.ndarray, fps: float) -> dict:
    """Compute mean velocity of nose position (px/s).

    Higher sway velocity indicates more unstable posture.

    Args:
        nose_trajectory: Nx2 array of (x, y) nose positions over time
        fps: Frames per second

    Returns:
        Dictionary with:
            - value: Mean velocity in px/s
            - unit: "px/s"
            - confidence: Computed confidence score
            - grade: "B"
            - safe_wording: Clinical disclaimer
            - note: Optional note
    """
    result = {
        "value": 0.0,
        "unit": "px/s",
        "confidence": 0.0,
        "grade": "B",
        "safe_wording": _SAFE_WORDING_SWAY_VELOCITY,
        "note": "",
    }

    if fps <= 0:
        result["note"] = "Invalid fps (must be > 0)"
        result["confidence"] = 0.25
        return result

    is_valid, reason = _validate_trajectory(nose_trajectory, min_points=2)
    if not is_valid:
        result["note"] = f"Cannot compute sway velocity: {reason}"
        result["confidence"] = 0.30
        return result

    pts = nose_trajectory[:, :2]
    valid_mask = np.all(np.isfinite(pts), axis=1)
    valid_pts = pts[valid_mask]

    if len(valid_pts) < 2:
        result["note"] = "Insufficient valid points for velocity computation"
        result["confidence"] = 0.35
        return result

    # Compute frame-to-frame displacements
    diffs = np.diff(valid_pts, axis=0)
    displacements = np.sqrt(np.sum(diffs ** 2, axis=1))

    # Mean velocity = mean displacement * fps
    mean_velocity = float(np.mean(displacements)) * fps

    result["value"] = round(mean_velocity, 2)
    result["confidence"] = _compute_confidence(len(valid_pts), _MIN_FRAMES_FOR_SWAY, "B")
    result["note"] = f"Computed from {len(valid_pts)} valid points at {fps:.1f} fps"

    return result


def compute_sway_path_length(nose_trajectory: np.ndarray) -> dict:
    """Compute total path length of nose trajectory (px).

    Total cumulative displacement over the recording period.

    Args:
        nose_trajectory: Nx2 array of (x, y) nose positions over time

    Returns:
        Dictionary with:
            - value: Total path length in px
            - unit: "px"
            - confidence: Computed confidence score
            - grade: "B"
            - safe_wording: Clinical disclaimer
            - note: Optional note
    """
    result = {
        "value": 0.0,
        "unit": "px",
        "confidence": 0.0,
        "grade": "B",
        "safe_wording": _SAFE_WORDING_SWAY_PATH,
        "note": "",
    }

    is_valid, reason = _validate_trajectory(nose_trajectory, min_points=2)
    if not is_valid:
        result["note"] = f"Cannot compute sway path length: {reason}"
        result["confidence"] = 0.30
        return result

    pts = nose_trajectory[:, :2]
    valid_mask = np.all(np.isfinite(pts), axis=1)
    valid_pts = pts[valid_mask]

    if len(valid_pts) < 2:
        result["note"] = "Insufficient valid points for path length computation"
        result["confidence"] = 0.35
        return result

    # Sum of frame-to-frame Euclidean distances
    diffs = np.diff(valid_pts, axis=0)
    displacements = np.sqrt(np.sum(diffs ** 2, axis=1))
    total_length = float(np.sum(displacements))

    result["value"] = round(total_length, 2)
    result["confidence"] = _compute_confidence(len(valid_pts), _MIN_FRAMES_FOR_SWAY, "B")
    result["note"] = f"Computed from {len(valid_pts)} valid points"

    return result


def compute_ap_ml_ratio(nose_trajectory: np.ndarray) -> dict:
    """Compute anteroposterior (AP) vs mediolateral (ML) sway ratio.

    AP = variance in Y direction (forward/backward)
    ML = variance in X direction (left/right)
    Ratio = var(Y) / var(X)

    Args:
        nose_trajectory: Nx2 array of (x, y) nose positions over time

    Returns:
        Dictionary with:
            - value: AP/ML ratio
            - unit: "ratio"
            - confidence: Computed confidence score
            - grade: "C"
            - safe_wording: Clinical disclaimer
            - ap_variance: AP variance in px^2
            - ml_variance: ML variance in px^2
            - note: Optional note
    """
    result = {
        "value": 1.0,
        "unit": "ratio",
        "confidence": 0.0,
        "grade": "C",
        "safe_wording": _SAFE_WORDING_AP_ML,
        "ap_variance": 0.0,
        "ml_variance": 0.0,
        "note": "",
    }

    is_valid, reason = _validate_trajectory(nose_trajectory, min_points=_MIN_FRAMES_FOR_SWAY)
    if not is_valid:
        result["note"] = f"Cannot compute AP/ML ratio: {reason}"
        result["confidence"] = 0.30
        return result

    pts = nose_trajectory[:, :2]
    valid_mask = np.all(np.isfinite(pts), axis=1)
    valid_pts = pts[valid_mask]

    if len(valid_pts) < 3:
        result["note"] = "Insufficient valid points for variance computation"
        result["confidence"] = 0.35
        return result

    # Compute variances
    ml_var = float(np.var(valid_pts[:, 0]))  # X = mediolateral
    ap_var = float(np.var(valid_pts[:, 1]))  # Y = anteroposterior

    result["ap_variance"] = round(ap_var, 4)
    result["ml_variance"] = round(ml_var, 4)

    # Avoid division by zero
    if ml_var < 1e-12:
        result["value"] = float("inf") if ap_var > 1e-12 else 1.0
        result["note"] = "ML variance near zero; ratio may be unreliable"
        result["confidence"] = 0.35
    else:
        ratio = ap_var / ml_var
        result["value"] = round(ratio, 3)
        result["confidence"] = _compute_confidence(len(valid_pts), _MIN_FRAMES_FOR_SWAY, "C")
        result["note"] = f"AP variance={ap_var:.4f}, ML variance={ml_var:.4f}"

    return result


# ===========================================================================
# Romberg proxy
# ===========================================================================

def compute_romberg_proxy(
    sway_eyes_open: float,
    sway_eyes_closed: float,
    sway_type: str = "area",
) -> dict:
    """Compute Romberg quotient = sway_eyes_closed / sway_eyes_open.

    A Romberg quotient >1.5 suggests significant proprioceptive deficit
    and warrants clinical review.

    Args:
        sway_eyes_open: Sway measure during eyes-open condition
        sway_eyes_closed: Sway measure during eyes-closed condition
        sway_type: Type of sway measure used ("area", "velocity", or "path")

    Returns:
        Dictionary with:
            - value: Romberg quotient
            - unit: "ratio"
            - confidence: Computed confidence score
            - grade: "B"
            - safe_wording: Clinical disclaimer
            - interpretation: Brief interpretation string
            - note: Optional note
    """
    result = {
        "value": 1.0,
        "unit": "ratio",
        "confidence": 0.0,
        "grade": "B",
        "safe_wording": _SAFE_WORDING_ROMBERG,
        "interpretation": "",
        "note": "",
    }

    # Validate inputs
    if not np.isfinite(sway_eyes_open) or not np.isfinite(sway_eyes_closed):
        result["note"] = "Invalid input values (non-finite)"
        result["confidence"] = 0.25
        return result

    if sway_eyes_open <= 0:
        result["note"] = "Eyes-open sway must be positive"
        result["confidence"] = 0.25
        return result

    if sway_eyes_closed < 0:
        result["note"] = "Eyes-closed sway cannot be negative"
        result["confidence"] = 0.25
        return result

    quotient = sway_eyes_closed / sway_eyes_open
    result["value"] = round(quotient, 3)

    # Interpretation
    if quotient > 2.0:
        result["interpretation"] = (
            "Marked increase in sway with eyes closed (>2.0x). "
            "Strongly suggests proprioceptive deficit. Clinical review recommended."
        )
        result["confidence"] = 0.75
    elif quotient > 1.5:
        result["interpretation"] = (
            "Moderate increase in sway with eyes closed (>1.5x). "
            "Suggests proprioceptive deficit warranting review."
        )
        result["confidence"] = 0.75
    elif quotient > 1.0:
        result["interpretation"] = (
            "Mild increase in sway with eyes closed. "
            "May indicate mild proprioceptive involvement."
        )
        result["confidence"] = 0.70
    else:
        result["interpretation"] = (
            "No increase in sway with eyes closed (<=1.0x). "
            "Proprioceptive function appears intact."
        )
        result["confidence"] = 0.70

    result["note"] = f"Based on {sway_type} sway measure"

    return result


# ===========================================================================
# Body lean angle
# ===========================================================================

def compute_body_lean_angle(
    shoulder_center: np.ndarray,
    hip_center: np.ndarray,
) -> dict:
    """Compute forward lean angle between vertical and trunk vector.

    Vector: hip_center -> shoulder_center (trunk vector)
    Angle computed from vertical (0, -1) direction.
    Positive = forward lean, Negative = backward lean.

    Args:
        shoulder_center: Nx2 array of shoulder center positions
        hip_center: Nx2 array of hip center positions

    Returns:
        Dictionary with:
            - value: Mean lean angle in degrees
            - unit: "degrees"
            - confidence: Computed confidence score
            - grade: "C"
            - safe_wording: Clinical disclaimer
            - direction: "forward", "backward", or "neutral"
            - note: Optional note
    """
    result = {
        "value": 0.0,
        "unit": "degrees",
        "confidence": 0.0,
        "grade": "C",
        "safe_wording": _SAFE_WORDING_BODY_LEAN,
        "direction": "neutral",
        "note": "",
    }

    # Validate inputs
    s_valid, s_reason = _validate_trajectory(shoulder_center, min_points=3)
    h_valid, h_reason = _validate_trajectory(hip_center, min_points=3)

    if not s_valid:
        result["note"] = f"Invalid shoulder data: {s_reason}"
        result["confidence"] = 0.30
        return result

    if not h_valid:
        result["note"] = f"Invalid hip data: {h_reason}"
        result["confidence"] = 0.30
        return result

    # Align valid frames
    s_pts = shoulder_center[:, :2]
    h_pts = hip_center[:, :2]
    s_valid = np.all(np.isfinite(s_pts), axis=1)
    h_valid = np.all(np.isfinite(h_pts), axis=1)
    both_valid = s_valid & h_valid

    valid_count = int(np.sum(both_valid))
    if valid_count < 3:
        result["note"] = f"Only {valid_count} aligned valid frames (need >= 3)"
        result["confidence"] = 0.35
        return result

    s_valid_pts = s_pts[both_valid]
    h_valid_pts = h_pts[both_valid]

    # Compute trunk vectors: hip -> shoulder
    trunk_vectors = s_valid_pts - h_valid_pts  # Nx2

    # Reference vertical vector (pointing up, negative Y in image coords)
    vertical = np.array([0.0, -1.0])

    # Compute angle between each trunk vector and vertical
    norms = np.linalg.norm(trunk_vectors, axis=1)
    valid_norms = norms > 1e-9

    if not np.any(valid_norms):
        result["note"] = "All trunk vectors have zero length"
        result["confidence"] = 0.30
        return result

    # Normalize trunk vectors
    trunk_norm = trunk_vectors.copy()
    trunk_norm[valid_norms] = trunk_vectors[valid_norms] / norms[valid_norms, np.newaxis]

    # Dot product with vertical gives cosine of angle
    cos_angles = np.dot(trunk_norm, vertical)
    cos_angles = np.clip(cos_angles, -1.0, 1.0)

    # Angle in degrees (absolute angle from vertical)
    angles = np.degrees(np.arccos(np.abs(cos_angles)))

    # Determine direction: forward lean = shoulder X > hip X (in image coords)
    # In standard image coords, X increases left-to-right
    # Forward lean: shoulders move forward, typically shift relative to hips
    # We'll use the sign of the perpendicular component
    lean_signs = np.sign(trunk_vectors[:, 0])  # X component determines direction
    mean_sign = float(np.sign(np.mean(lean_signs[valid_norms])))

    mean_angle = float(np.mean(angles[valid_norms]))

    # Apply direction sign
    signed_angle = mean_angle * mean_sign if mean_sign != 0 else mean_angle

    result["value"] = round(signed_angle, 2)

    if signed_angle > 2.0:
        result["direction"] = "forward"
    elif signed_angle < -2.0:
        result["direction"] = "backward"
    else:
        result["direction"] = "neutral"

    result["confidence"] = _compute_confidence(valid_count, _MIN_FRAMES_FOR_SWAY, "C")
    result["note"] = (
        f"Mean lean angle from {valid_count} valid frames. "
        f"Direction: {result['direction']}. "
        f"Camera angle affects measurement accuracy."
    )

    return result


# ===========================================================================
# Balance confidence score (composite)
# ===========================================================================

def compute_balance_confidence_score(features: dict) -> dict:
    """Compute composite balance confidence score (0-100).

    Weights:
        - sway_area: 40%
        - sway_velocity: 30%
        - ap_ml_ratio: 15%
        - body_lean_angle: 15%

    Higher score = better balance (lower sway, more stable).

    Args:
        features: Dictionary containing:
            - "sway_area": float (px^2)
            - "sway_velocity": float (px/s)
            - "ap_ml_ratio": float
            - "body_lean_angle": float (degrees, absolute value)

    Returns:
        Dictionary with:
            - value: Composite score 0-100
            - unit: "0-100"
            - confidence: Computed confidence score
            - grade: "C"
            - safe_wording: Clinical disclaimer
            - component_scores: Breakdown of individual components
            - note: Optional note
    """
    result = {
        "value": 50.0,
        "unit": "0-100",
        "confidence": 0.0,
        "grade": "C",
        "safe_wording": _SAFE_WORDING_BALANCE_CONFIDENCE,
        "component_scores": {},
        "note": "",
    }

    # Extract values with defaults
    sway_area = float(features.get("sway_area", 0.0))
    sway_velocity = float(features.get("sway_velocity", 0.0))
    ap_ml_ratio = float(features.get("ap_ml_ratio", 1.0))
    body_lean = abs(float(features.get("body_lean_angle", 0.0)))

    # Track which components are valid
    valid_components = 0
    total_weight = 0.0
    weighted_score = 0.0

    # --- Sway area component (40%) ---
    if sway_area > 0 and np.isfinite(sway_area):
        # Normalize: score = 100 * (1 - area / max_area), clipped
        area_score = max(0.0, 100.0 * (1.0 - sway_area / _REF_SWAY_AREA_MAX))
        area_score = min(100.0, area_score)
        valid_components += 1
        total_weight += 0.40
        weighted_score += 0.40 * area_score
        result["component_scores"]["sway_area"] = round(area_score, 2)
    else:
        result["component_scores"]["sway_area"] = None

    # --- Sway velocity component (30%) ---
    if sway_velocity >= 0 and np.isfinite(sway_velocity):
        vel_score = max(0.0, 100.0 * (1.0 - sway_velocity / _REF_SWAY_VELOCITY_MAX))
        vel_score = min(100.0, vel_score)
        valid_components += 1
        total_weight += 0.30
        weighted_score += 0.30 * vel_score
        result["component_scores"]["sway_velocity"] = round(vel_score, 2)
    else:
        result["component_scores"]["sway_velocity"] = None

    # --- AP/ML ratio component (15%) ---
    if ap_ml_ratio > 0 and np.isfinite(ap_ml_ratio):
        # Optimal ratio is ~1.0 (balanced); penalize deviation
        ratio_deviation = abs(ap_ml_ratio - 1.0)
        ratio_score = max(0.0, 100.0 * (1.0 - ratio_deviation / (_REF_AP_ML_MAX - 1.0)))
        ratio_score = min(100.0, ratio_score)
        valid_components += 1
        total_weight += 0.15
        weighted_score += 0.15 * ratio_score
        result["component_scores"]["ap_ml_ratio"] = round(ratio_score, 2)
    else:
        result["component_scores"]["ap_ml_ratio"] = None

    # --- Body lean component (15%) ---
    if body_lean >= 0 and np.isfinite(body_lean):
        lean_score = max(0.0, 100.0 * (1.0 - body_lean / _REF_BODY_LEAN_MAX))
        lean_score = min(100.0, lean_score)
        valid_components += 1
        total_weight += 0.15
        weighted_score += 0.15 * lean_score
        result["component_scores"]["body_lean_angle"] = round(lean_score, 2)
    else:
        result["component_scores"]["body_lean_angle"] = None

    # Compute final score
    if total_weight > 0:
        # Normalize by actual weight (handle missing components)
        final_score = weighted_score / total_weight
        result["value"] = round(max(0.0, min(100.0, final_score)), 1)
        result["confidence"] = round(0.50 + 0.15 * valid_components, 2)  # 0.65 - 0.95 range
    else:
        result["value"] = 50.0  # Neutral default
        result["confidence"] = 0.30
        result["note"] = "No valid components available for scoring"
        return result

    # Categorize
    score = result["value"]
    if score >= 80:
        category = "good_balance"
    elif score >= 60:
        category = "moderate_balance"
    elif score >= 40:
        category = "mild_impairment"
    else:
        category = "significant_impairment"

    result["confidence"] = round(min(0.90, 0.55 + 0.08 * valid_components), 2)
    result["note"] = (
        f"Composite score from {valid_components}/4 components "
        f"(total weight={total_weight:.2f}). "
        f"Category: {category}. "
        f"Not a clinical balance scale replacement."
    )

    return result


# ===========================================================================
# Main analysis function
# ===========================================================================

def analyze_posture(
    pose_sequence: dict,
    eyes_closed_segment: tuple[int, int] | None = None,
) -> dict[str, Any]:
    """Run full posture and balance analysis on a pose sequence.

    Args:
        pose_sequence: Dictionary with:
            - "frames": List of pose frames with keypoints
            - "fps": float, frames per second
            - Optionally other metadata
        eyes_closed_segment: Optional (start_frame, end_frame) tuple
            indicating which frames correspond to eyes-closed condition.
            If not provided, Romberg proxy is not computed.

    Returns:
        Dictionary with complete posture analysis results including:
            - posture_analysis: All computed features
            - analysis_confidence: Overall confidence
            - evidence_summary: Text summary with evidence grades
    """
    frames = pose_sequence.get("frames", [])
    fps = float(pose_sequence.get("fps", 30.0))

    result: dict[str, Any] = {
        "posture_analysis": {},
        "analysis_confidence": 0.0,
        "evidence_summary": "",
        "metadata": {
            "total_frames": len(frames),
            "fps": fps,
            "duration_seconds": len(frames) / fps if fps > 0 else 0.0,
            "eyes_closed_segment": eyes_closed_segment,
        },
    }

    # --- Check minimum requirements ---
    min_frames_needed = int(_MIN_DURATION_SECONDS * fps) if fps > 0 else 60
    if len(frames) < min_frames_needed:
        result["metadata"]["insufficient_data"] = True
        result["metadata"]["note"] = (
            f"Insufficient frames: {len(frames)} frames "
            f"(need >= {min_frames_needed} for {_MIN_DURATION_SECONDS}s at {fps}fps)"
        )
        # Still attempt analysis but mark low confidence

    if len(frames) < 2:
        result["posture_analysis"] = {
            "sway_area": {
                "value": 0.0, "unit": "px^2", "confidence": 0.20,
                "grade": "B", "safe_wording": _SAFE_WORDING_SWAY_AREA,
                "note": "No frames available for analysis",
            },
            "sway_velocity": {
                "value": 0.0, "unit": "px/s", "confidence": 0.20,
                "grade": "B", "safe_wording": _SAFE_WORDING_SWAY_VELOCITY,
                "note": "No frames available for analysis",
            },
            "sway_path_length": {
                "value": 0.0, "unit": "px", "confidence": 0.20,
                "grade": "B", "safe_wording": _SAFE_WORDING_SWAY_PATH,
                "note": "No frames available for analysis",
            },
            "ap_ml_ratio": {
                "value": 1.0, "unit": "ratio", "confidence": 0.20,
                "grade": "C", "safe_wording": _SAFE_WORDING_AP_ML,
                "ap_variance": 0.0, "ml_variance": 0.0,
                "note": "No frames available for analysis",
            },
            "romberg_proxy": {
                "value": 1.0, "unit": "ratio", "confidence": 0.20,
                "grade": "B", "safe_wording": _SAFE_WORDING_ROMBERG,
                "interpretation": "No data for Romberg computation",
                "note": "No frames available",
            },
            "body_lean_angle": {
                "value": 0.0, "unit": "degrees", "confidence": 0.20,
                "grade": "C", "safe_wording": _SAFE_WORDING_BODY_LEAN,
                "direction": "unknown",
                "note": "No frames available for analysis",
            },
            "balance_confidence_score": {
                "value": 50.0, "unit": "0-100", "confidence": 0.20,
                "grade": "C", "safe_wording": _SAFE_WORDING_BALANCE_CONFIDENCE,
                "component_scores": {},
                "note": "No frames available for analysis",
            },
        }
        result["analysis_confidence"] = 0.20
        result["evidence_summary"] = (
            "Insufficient data for posture analysis. "
            "Postural sway features are proxy markers (Grade B). "
            "Requires valid pose sequence input."
        )
        return result

    # --- Extract keypoints ---
    keypoints = extract_body_keypoints(frames)
    nose_traj = keypoints["nose"]
    shoulder_center = keypoints["shoulder_center"]
    hip_center = keypoints["hip_center"]

    # --- Compute individual features ---
    sway_area_result = compute_sway_area(nose_traj)
    sway_velocity_result = compute_sway_velocity(nose_traj, fps)
    sway_path_result = compute_sway_path_length(nose_traj)
    ap_ml_result = compute_ap_ml_ratio(nose_traj)
    body_lean_result = compute_body_lean_angle(shoulder_center, hip_center)

    # --- Romberg proxy (if eyes-closed segment provided) ---
    romberg_result = {
        "value": None,
        "unit": "ratio",
        "confidence": 0.0,
        "grade": "B",
        "safe_wording": _SAFE_WORDING_ROMBERG,
        "interpretation": "Eyes-closed segment not provided",
        "note": "No eyes-closed segment tagged",
    }

    if eyes_closed_segment is not None:
        start_ec, end_ec = eyes_closed_segment
        start_ec = max(0, start_ec)
        end_ec = min(len(frames), end_ec)

        if end_ec > start_ec:
            # Compute eyes-closed sway area
            ec_nose = nose_traj[start_ec:end_ec]
            ec_sway = compute_sway_area(ec_nose)
            ec_sway_value = ec_sway.get("value", 0.0)

            # Eyes-open = full sequence minus eyes-closed (or use full if no EO segment)
            # Default: use full sequence sway as eyes-open reference
            eo_sway_value = sway_area_result.get("value", 0.0)

            # Alternative: if an eyes-open segment is implied as the complement
            if end_ec < len(frames) and start_ec > 0:
                # Split: [0:start_ec] and [end_ec:] are eyes-open
                eo_parts = []
                if start_ec > 0:
                    eo_parts.append(nose_traj[:start_ec])
                if end_ec < len(frames):
                    eo_parts.append(nose_traj[end_ec:])
                if eo_parts:
                    eo_nose = np.concatenate(eo_parts, axis=0)
                    eo_sway = compute_sway_area(eo_nose)
                    eo_sway_value = eo_sway.get("value", 0.0)

            if ec_sway_value > 0 and eo_sway_value > 0:
                romberg_result = compute_romberg_proxy(
                    eo_sway_value, ec_sway_value, sway_type="area"
                )
            else:
                romberg_result["interpretation"] = "Insufficient data for Romberg computation"
                romberg_result["note"] = "Zero or invalid sway values"
                romberg_result["confidence"] = 0.30
        else:
            romberg_result["interpretation"] = "Invalid eyes-closed segment range"
            romberg_result["note"] = f"Range ({start_ec}, {end_ec}) is invalid"
            romberg_result["confidence"] = 0.25

    # --- Balance confidence score ---
    balance_features = {
        "sway_area": sway_area_result.get("value", 0.0),
        "sway_velocity": sway_velocity_result.get("value", 0.0),
        "ap_ml_ratio": ap_ml_result.get("value", 1.0),
        "body_lean_angle": abs(body_lean_result.get("value", 0.0)),
    }
    balance_confidence_result = compute_balance_confidence_score(balance_features)

    # --- Assemble results ---
    result["posture_analysis"] = {
        "sway_area": sway_area_result,
        "sway_velocity": sway_velocity_result,
        "sway_path_length": sway_path_result,
        "ap_ml_ratio": ap_ml_result,
        "romberg_proxy": romberg_result,
        "body_lean_angle": body_lean_result,
        "balance_confidence_score": balance_confidence_result,
    }

    # --- Compute overall analysis confidence ---
    confidences = [
        sway_area_result.get("confidence", 0.0),
        sway_velocity_result.get("confidence", 0.0),
        sway_path_result.get("confidence", 0.0),
        ap_ml_result.get("confidence", 0.0),
        romberg_result.get("confidence", 0.0),
        body_lean_result.get("confidence", 0.0),
        balance_confidence_result.get("confidence", 0.0),
    ]
    # Weight by evidence grade: B=0.6, C=0.4
    weights = [0.6, 0.6, 0.6, 0.4, 0.6, 0.4, 0.4]
    weighted_sum = sum(c * w for c, w in zip(confidences, weights))
    weight_total = sum(weights)
    result["analysis_confidence"] = round(weighted_sum / weight_total, 2) if weight_total > 0 else 0.30

    # --- Evidence summary ---
    romberg_val = romberg_result.get("value")
    romberg_note = ""
    if romberg_val is not None and np.isfinite(romberg_val) and romberg_val > 1.5:
        romberg_note = f" Romberg proxy ({romberg_val:.2f}) suggests proprioceptive deficit review."

    lean_val = body_lean_result.get("value", 0.0)
    lean_note = ""
    if abs(lean_val) > 5.0:
        lean_note = f" Body lean ({lean_val:.1f} deg) may indicate postural alignment review."

    result["evidence_summary"] = (
        "Postural sway features are proxy markers for balance assessment (Grade B). "
        "Sway area correlates with Berg Balance Scale (r=-0.71). "
        "Not a fall-risk determination. Requires clinical correlation."
        f"{romberg_note}{lean_note}"
    )

    return result