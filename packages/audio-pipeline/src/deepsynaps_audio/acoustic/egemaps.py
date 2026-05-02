"""eGeMAPS via openSMILE when installed ([acoustic-extras])."""

from __future__ import annotations

import tempfile
from pathlib import Path

import numpy as np

from ..schemas import EGeMAPSVector, Recording


def extract_egemaps(
    recording: Recording,
    *,
    feature_set: str = "eGeMAPSv02",
) -> EGeMAPSVector:
    """Extract openSMILE functionals (eGeMAPS v02 default)."""

    try:
        import opensmile
    except ImportError as exc:
        raise ImportError(
            "extract_egemaps requires opensmile — pip install 'packages/audio-pipeline[acoustic-extras]'."
        ) from exc

    if recording.waveform is None:
        raise ValueError("recording.waveform required")

    arr = np.asarray(recording.waveform, dtype=np.float32).ravel()
    sr = recording.sample_rate

    fs_enum = opensmile.FeatureSet.eGeMAPSv02
    if feature_set == "ComParE_2016":
        fs_enum = opensmile.FeatureSet.ComParE_2016

    smile = opensmile.Smile(
        feature_level=opensmile.FeatureLevel.Functionals,
        feature_set=fs_enum,
        sampling_rate=sr,
    )

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        wav_path = Path(tmp.name)

    try:
        import soundfile as sf

        sf.write(str(wav_path), arr, sr)
        feats = smile.process_file(str(wav_path))
    finally:
        try:
            wav_path.unlink(missing_ok=True)
        except OSError:
            pass

    # Single-row dataframe of functionals
    row = feats.iloc[0]
    names = [str(c) for c in feats.columns]
    values = [float(row[c]) for c in feats.columns]

    fs_label: str = "ComParE_2016" if feature_set == "ComParE_2016" else "eGeMAPSv02"

    return EGeMAPSVector(feature_set=fs_label, values=values, names=names)
