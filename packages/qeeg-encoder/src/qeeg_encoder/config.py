"""Runtime configuration loaded from YAML + env overrides."""

from __future__ import annotations

from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class ServiceConfig(BaseModel):
    name: str = "qeeg-encoder"
    log_level: str = "INFO"
    metrics_port: int = 9090


class BusTopics(BaseModel):
    qeeg_recording: str
    qeeg_features: str
    ai_inference: str
    dlq: str


class BusConfig(BaseModel):
    bootstrap_servers: str
    schema_registry_url: str
    consumer_group: str
    topics: BusTopics
    max_poll_records: int = 32
    enable_auto_commit: bool = False


class FoundationConfig(BaseModel):
    enabled: bool = True
    backbone: Literal["labram-base", "eegpt-small"] = "labram-base"
    weights_dir: Path
    expected_sha256: str
    device: Literal["cuda", "cpu"] = "cuda"
    embedding_dim: int = 512


class TabularConfig(BaseModel):
    enabled: bool = True
    embedding_dim: int = 128
    feature_set: str = "canonical_v1"


class ConformalConfig(BaseModel):
    alpha: float = 0.10
    method: Literal["split", "cv"] = "split"
    calibration_size: float = 0.20
    cache_dir: Path = Path("/var/cache/qeeg-encoder/conformal")


class FeatureStoreConfig(BaseModel):
    feast_repo: Path
    push_endpoint: str
    feature_view: str = "qeeg_session_features"
    freshness_sla_seconds: int = 60


class EmitConfig(BaseModel):
    retries: int = 3
    retry_backoff_ms: int = 250


class TenancyConfig(BaseModel):
    enforce_isolation: bool = True
    tenant_header: str = "x-tenant-id"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="QEEG_ENCODER__",
        env_nested_delimiter="__",
        case_sensitive=False,
    )

    service: ServiceConfig = Field(default_factory=ServiceConfig)
    bus: BusConfig
    foundation: FoundationConfig
    tabular: TabularConfig = Field(default_factory=TabularConfig)
    conformal: ConformalConfig = Field(default_factory=ConformalConfig)
    feature_store: FeatureStoreConfig
    emit: EmitConfig = Field(default_factory=EmitConfig)
    tenancy: TenancyConfig = Field(default_factory=TenancyConfig)


def load_settings(config_path: Path | str = "configs/default.yaml") -> Settings:
    """Load YAML, then let env vars override via pydantic-settings."""
    path = Path(config_path)
    raw = yaml.safe_load(path.read_text()) if path.exists() else {}
    return Settings(**raw)

