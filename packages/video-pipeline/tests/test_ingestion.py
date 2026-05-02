from __future__ import annotations

from pathlib import Path

import pytest

from deepsynaps_video.ingestion import (
    IngestionError,
    VideoIOBackend,
    extract_video_metadata,
    import_patient_video,
    normalize_video_stream,
    sample_video_frames,
)
from deepsynaps_video.schemas import (
    CameraInfo,
    FrameSample,
    NormalizationConfig,
    NormalizedVideo,
    VideoAsset,
    VideoMetadata,
    VideoSourceType,
)


class FakeBackend(VideoIOBackend):
    name = "fake"

    def __init__(self) -> None:
        self.probed: list[Path] = []
        self.normalized: list[tuple[VideoAsset, NormalizationConfig, Path]] = []
        self.sampled: list[tuple[NormalizedVideo, int, Path]] = []

    def probe(self, source_path: Path) -> VideoMetadata:
        self.probed.append(source_path)
        return VideoMetadata(
            duration_seconds=2.5,
            fps=29.97,
            width=1920,
            height=1080,
            codec="h264",
            container="mp4",
            color_space="unknown",
            audio_present=False,
            frame_count=75,
            camera=CameraInfo(device_model="fixture-camera"),
        )

    def normalize(
        self,
        asset: VideoAsset,
        config: NormalizationConfig,
        output_dir: Path,
    ) -> NormalizedVideo:
        self.normalized.append((asset, config, output_dir))
        output_dir.mkdir(parents=True, exist_ok=True)
        output = output_dir / f"{asset.asset_id}_normalized.mp4"
        output.write_bytes(b"normalized")
        assert asset.metadata is not None
        assert asset.metadata.fps is not None
        source_width = asset.metadata.width or 0
        source_height = asset.metadata.height or 0
        return NormalizedVideo(
            normalized_id="norm_fixture",
            source_asset_id=asset.asset_id,
            path=str(output),
            metadata=VideoMetadata(
                duration_seconds=2.5,
                fps=config.target_fps or asset.metadata.fps,
                width=(config.target_resolution or (source_width, source_height))[0],
                height=(config.target_resolution or (source_width, source_height))[1],
                codec=config.target_codec,
                container="mp4",
                color_space=config.target_color_space,
                audio_present=False,
                frame_count=75,
            ),
            config=config,
            frame_index=(0.0, 1.0, 2.0),
        )

    def sample_frames(
        self,
        video: NormalizedVideo,
        count: int,
        output_dir: Path,
    ) -> list[FrameSample]:
        self.sampled.append((video, count, output_dir))
        samples: list[FrameSample] = []
        for index in range(count):
            path = output_dir / f"frame_{index:04d}.jpg"
            path.write_bytes(b"frame")
            samples.append(
                FrameSample(
                    sample_id=f"sample_{index}",
                    normalized_id=video.normalized_id,
                    frame_number=index,
                    timestamp_seconds=float(index),
                    path=str(path),
                )
            )
        return samples


class FailingProbeBackend(FakeBackend):
    def probe(self, source_path: Path) -> VideoMetadata:
        raise IngestionError("probe failed", code="probe_failed")


def test_import_patient_video_from_disk_extracts_metadata(tmp_path: Path) -> None:
    source = tmp_path / "task.mp4"
    source.write_bytes(b"fake video")
    backend = FakeBackend()

    asset = import_patient_video(
        source,
        patient_ref="patient-123",
        session_ref="visit-1",
        task_ref="finger_tapping_right",
        backend=backend,
    )

    assert asset.source_type == VideoSourceType.FILE
    assert asset.patient_ref == "patient-123"
    assert asset.session_ref == "visit-1"
    assert asset.task_ref == "finger_tapping_right"
    assert asset.metadata is not None
    assert asset.metadata.duration_seconds == pytest.approx(2.5)
    assert asset.metadata.width == 1920
    assert asset.metadata.camera.device_model == "fixture-camera"
    assert backend.probed == [source]
    assert asset.provenance[0].operation == "import_patient_video"
    assert asset.provenance[1].operation == "extract_video_metadata"


def test_import_patient_video_copies_upload_blob(tmp_path: Path) -> None:
    backend = FakeBackend()
    asset = import_patient_video(
        b"blob bytes",
        source_filename="upload.mov",
        storage_dir=tmp_path / "storage",
        patient_ref="patient-123",
        backend=backend,
    )

    copied = Path(asset.source_uri)
    assert copied.exists()
    assert copied.suffix == ".mov"
    assert copied.read_bytes() == b"blob bytes"
    assert asset.source_type == VideoSourceType.UPLOAD_BLOB
    assert asset.metadata is not None
    assert asset.metadata.container == "mp4"


def test_import_patient_video_rejects_unsupported_extension(tmp_path: Path) -> None:
    source = tmp_path / "not_video.txt"
    source.write_text("not a video")

    with pytest.raises(IngestionError, match="Unsupported video format"):
        import_patient_video(source, backend=FakeBackend())


def test_import_patient_video_wraps_probe_errors(tmp_path: Path) -> None:
    source = tmp_path / "task.mp4"
    source.write_bytes(b"fake video")

    with pytest.raises(IngestionError, match="probe failed"):
        import_patient_video(source, backend=FailingProbeBackend())


def test_extract_video_metadata_returns_json_friendly_schema(tmp_path: Path) -> None:
    source = tmp_path / "task.mp4"
    source.write_bytes(b"fake video")

    metadata = extract_video_metadata(source, backend=FakeBackend())

    payload = metadata.to_json_dict()
    assert payload["duration_seconds"] == 2.5
    assert payload["fps"] == 29.97
    assert payload["camera"]["device_model"] == "fixture-camera"


def test_normalize_video_stream_uses_config_and_records_provenance(tmp_path: Path) -> None:
    source = tmp_path / "task.mp4"
    source.write_bytes(b"fake video")
    backend = FakeBackend()
    asset = import_patient_video(source, backend=backend)
    config = NormalizationConfig(target_fps=15.0, target_resolution=(640, 480))

    normalized = normalize_video_stream(
        asset,
        output_dir=tmp_path / "normalized",
        config=config,
        backend=backend,
    )

    assert normalized.metadata.fps == 15.0
    assert normalized.metadata.width == 640
    assert normalized.metadata.height == 480
    assert normalized.config.target_resolution == (640, 480)
    assert normalized.provenance[-1].operation == "normalize_video_stream"
    assert backend.normalized[0][0] == asset


def test_sample_video_frames_returns_typed_samples(tmp_path: Path) -> None:
    source = tmp_path / "task.mp4"
    source.write_bytes(b"fake video")
    backend = FakeBackend()
    asset = import_patient_video(source, backend=backend)
    normalized = normalize_video_stream(asset, output_dir=tmp_path / "normalized", backend=backend)

    samples = sample_video_frames(
        normalized,
        count=3,
        output_dir=tmp_path / "frames",
        backend=backend,
    )

    assert [sample.frame_number for sample in samples] == [0, 1, 2]
    assert [sample.timestamp_seconds for sample in samples] == [0.0, 1.0, 2.0]
    assert all(Path(sample.path).exists() for sample in samples)
    assert backend.sampled[0][1] == 3


def test_sample_video_frames_rejects_non_positive_count(tmp_path: Path) -> None:
    normalized = NormalizedVideo(
        normalized_id="norm",
        source_asset_id="asset",
        path=str(tmp_path / "normalized.mp4"),
        metadata=VideoMetadata(
            duration_seconds=1.0,
            fps=1.0,
            frame_count=1,
            width=10,
            height=10,
        ),
    )

    with pytest.raises(IngestionError, match="greater than zero"):
        sample_video_frames(normalized, count=0, output_dir=tmp_path, backend=FakeBackend())
