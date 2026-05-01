"""DeepSynaps Video Analyzer package.

The package currently exposes the ingestion layer for patient video assets.
Pose estimation, clinical analyzers, and monitoring analyzers live behind
separate future modules and must not be implemented in ingestion code.
"""

from .ingestion import (
    IngestionError,
    VideoIOBackend,
    extract_video_metadata,
    import_patient_video,
    normalize_video_stream,
    sample_video_frames,
)
from .pose_engine import (
    PoseEngineError,
    estimate_2d_pose,
    estimate_3d_pose,
    extract_joint_trajectories,
    smooth_pose_trajectories,
)
from .schemas import (
    CameraInfo,
    FrameSample,
    NormalizationConfig,
    NormalizedVideo,
    ProvenanceRecord,
    VideoAsset,
    VideoMetadata,
)

__all__ = [
    "CameraInfo",
    "FrameSample",
    "IngestionError",
    "NormalizationConfig",
    "NormalizedVideo",
    "ProvenanceRecord",
    "PoseEngineError",
    "VideoAsset",
    "VideoIOBackend",
    "VideoMetadata",
    "estimate_2d_pose",
    "estimate_3d_pose",
    "extract_video_metadata",
    "extract_joint_trajectories",
    "import_patient_video",
    "normalize_video_stream",
    "sample_video_frames",
    "smooth_pose_trajectories",
]
