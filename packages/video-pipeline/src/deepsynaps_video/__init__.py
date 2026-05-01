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
    "VideoAsset",
    "VideoIOBackend",
    "VideoMetadata",
    "extract_video_metadata",
    "import_patient_video",
    "normalize_video_stream",
    "sample_video_frames",
]
