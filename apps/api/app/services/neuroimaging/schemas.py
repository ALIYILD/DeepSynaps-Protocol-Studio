from __future__ import annotations

from pydantic import BaseModel


class NiftiSummary(BaseModel):
    shape: list[int]
    voxel_size: list[float]
    affine: list[list[float]]
    units: str | None
    dtype: str
    header_keys: list[str]


class LayoutSummary(BaseModel):
    n_subjects: int
    n_sessions: int
    modalities: list[str]
    tasks: list[str]
    validated: bool


class BIDSFileRef(BaseModel):
    path: str
    subject: str | None
    session: str | None
    task: str | None
    modality: str | None
    suffix: str | None


class NwbSummary(BaseModel):
    identifier: str
    session_description: str
    session_start_time: str
    acquisition_keys: list[str]
    processing_keys: list[str]


class NeuroimagingHealth(BaseModel):
    nibabel: bool
    pybids: bool
    pynwb: bool
    neurokit2: bool = False
    versions: dict[str, str | None] = {}


class EcgFeatures(BaseModel):
    mean_hr_bpm: float
    hrv_sdnn_ms: float
    rpeak_count: int
    signal_length: int


class EdaFeatures(BaseModel):
    mean_tonic_microsiemens: float
    scr_count: int
    signal_length: int


class RspFeatures(BaseModel):
    mean_rate_bpm: float
    rrv_sdbb_ms: float
    signal_length: int
