from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from app.settings import AppSettings


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        request_id = getattr(record, "request_id", None)
        if request_id is not None:
            payload["request_id"] = request_id
        for key in ("method", "path", "status_code", "duration_ms", "actor_id", "role", "snapshot_id"):
            value = getattr(record, key, None)
            if value is not None:
                payload[key] = value
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=True)


def configure_logging(app_settings: AppSettings) -> None:
    root_logger = logging.getLogger()
    if getattr(root_logger, "_deepsynaps_configured", False):
        root_logger.setLevel(getattr(logging, app_settings.log_level))
        return

    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())

    root_logger.handlers.clear()
    root_logger.addHandler(handler)
    root_logger.setLevel(getattr(logging, app_settings.log_level))
    setattr(root_logger, "_deepsynaps_configured", True)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
