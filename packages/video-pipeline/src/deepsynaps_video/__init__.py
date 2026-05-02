"""DeepSynaps Video Analyzer package.

The package currently exposes the ingestion layer for patient video assets.
Pose estimation, clinical analyzers, and monitoring analyzers live behind
separate future modules and must not be implemented in ingestion code.
"""

from .ingestion import (
    IngestionError,
    VideoIOBackend,
    create_video_asset,
    extract_video_metadata,
    import_patient_video,
    normalize_video_stream,
    normalize_video,
    probe_video_metadata,
    sample_video_frames,
    extract_frame_sample,
)
from .pose_engine import (
    PoseEngineError,
    estimate_2d_pose,
    estimate_3d_pose,
    extract_joint_trajectories,
    run_pose_estimation,
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
    "create_video_asset",
    "estimate_2d_pose",
    "estimate_3d_pose",
    "extract_video_metadata",
    "extract_frame_sample",
    "extract_joint_trajectories",
    "import_patient_video",
    "normalize_video",
    "normalize_video_stream",
    "probe_video_metadata",
    "run_pose_estimation",
    "sample_video_frames",
    "smooth_pose_trajectories",
]
