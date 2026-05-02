"""Audio ingestion: file → normalised :class:`Recording`, session bundling, BIDS-Audio export.

Heavy I/O imports (``soundfile``, ``librosa``, ``ffmpeg``) are guarded
inside the implementation bodies — see ``CLAUDE.md`` for the slim-import
rule shared with ``deepsynaps_qeeg`` and ``deepsynaps_mri``.
"""

from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path
from typing import Iterable, Optional
from uuid import UUID, uuid4

from .constants import TASK_PROTOCOLS
from .schemas import Recording, Session

logger = logging.getLogger(__name__)


def load_recording(
    path: str | Path,
    task_protocol: str,
    *,
    target_sr: Optional[int] = None,
    recording_id: Optional[UUID] = None,
) -> Recording:
    """Load any supported audio file and normalise it to the target sample rate."""

    try:
        import librosa
        import numpy as np
        import soundfile as sf
    except ImportError as exc:
        raise ImportError(
            "ingestion.load_recording requires optional deps: pip install "
            "'packages/audio-pipeline[acoustic]' (librosa, soundfile, audioread)."
        ) from exc

    p = Path(path)
    if not p.is_file():
        raise FileNotFoundError(str(p))

    raw_bytes = p.read_bytes()
    file_hash = hashlib.sha256(raw_bytes).hexdigest()

    sr_native = None
    try:
        info = sf.info(str(p))
        sr_native = info.samplerate
    except Exception:
        sr_native = None

    y_native, sr_loaded = librosa.load(str(p), sr=None, mono=True)
    sr_loaded = int(sr_loaded)

    default_sr = TASK_PROTOCOLS.get(task_protocol, {}).get("target_sr")
    target = target_sr if target_sr is not None else (default_sr if default_sr is not None else sr_loaded)
    target = int(target)

    if sr_loaded != target:
        y = librosa.resample(np.asarray(y_native, dtype=np.float64), orig_sr=sr_loaded, target_sr=target)
        sr_final = target
    else:
        y = np.asarray(y_native, dtype=np.float64).ravel()
        sr_final = sr_loaded

    n_samples = int(y.shape[0])
    duration_s = float(n_samples / sr_final) if sr_final > 0 else 0.0

    rid = recording_id or uuid4()
    return Recording(
        recording_id=rid,
        task_protocol=task_protocol,
        sample_rate=sr_final,
        duration_s=duration_s,
        n_samples=n_samples,
        channels=1,
        waveform=y.astype(float).tolist(),
        file_hash=file_hash,
        source_path=str(p.resolve()),
        recorder_fingerprint=_recorder_fingerprint(raw_bytes, sr_native),
    )


def import_session(
    files: Iterable[tuple[str, str | Path]],
    *,
    session_id: UUID,
    patient_id: UUID,
    tenant_id: UUID,
) -> Session:
    """Bundle multiple per-task recordings into a clinical :class:`Session`."""

    recordings: dict[str, Recording] = {}
    for task_protocol, file_path in files:
        if task_protocol in recordings:
            raise ValueError(f"duplicate task_protocol in session: {task_protocol}")
        rec = load_recording(file_path, task_protocol)
        recordings[task_protocol] = rec
    return Session(
        session_id=session_id,
        patient_id=patient_id,
        tenant_id=tenant_id,
        recordings=recordings,
    )


def to_bids(session: Session, root: str | Path) -> Path:
    """Write a minimal BIDS-like derivative folder (audio subfolder + JSON sidecars)."""

    root_p = Path(root)
    sub = f"sub-{session.patient_id}"
    audio_dir = root_p / sub / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)

    participants_tsv = root_p / "participants.tsv"
    if not participants_tsv.exists():
        participants_tsv.write_text("participant_id\n", encoding="utf-8")
    # Append patient row once (best-effort idempotency by naive check)
    content = participants_tsv.read_text(encoding="utf-8")
    line = f"{session.patient_id}\n"
    if str(session.patient_id) not in content:
        participants_tsv.write_text(content + line, encoding="utf-8")

    scans_lines: list[str] = []
    for task_key, rec in session.recordings.items():
        fname = f"{task_key}.wav"
        dest = audio_dir / fname
        try:
            import numpy as np
            import soundfile as sf

            if rec.waveform is None:
                raise ValueError(f"recording {task_key} has no waveform to export")
            sf.write(str(dest), np.asarray(rec.waveform, dtype=np.float32), rec.sample_rate)
        except ImportError as exc:
            raise ImportError("to_bids requires soundfile + numpy (acoustic extra)") from exc

        side = dest.with_suffix(".json")
        side.write_text(
            json.dumps(
                {
                    "TaskName": task_key,
                    "SamplingFrequency": rec.sample_rate,
                    "file_hash_sha256": rec.file_hash,
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        scans_lines.append(f"{sub}/audio/{fname}\t{task_key}\t{rec.duration_s}\n")

    scans_tsv = audio_dir / "scans.tsv"
    header = "filename\ttask_key\tduration_s\n"
    scans_tsv.write_text(header + "".join(scans_lines), encoding="utf-8")

    return root_p


def _recorder_fingerprint(raw_bytes: bytes, native_sr: Optional[int]) -> str:
    """Short hash for chain-of-custody metadata (not cryptographic proof)."""

    h = hashlib.sha256(raw_bytes[: min(4096, len(raw_bytes))])
    if native_sr is not None:
        h.update(str(native_sr).encode())
    return h.hexdigest()[:16]
