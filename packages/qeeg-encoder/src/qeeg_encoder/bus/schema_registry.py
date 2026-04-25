"""Confluent Schema Registry client (thin wrapper around httpx).

Caches subject -> schema_id and schema_id -> parsed schema for the lifetime of
the process. Schema evolution is BACKWARD by Schema Registry config.
"""

from __future__ import annotations

import json
from typing import Any

import httpx
import structlog

log = structlog.get_logger(__name__)


class SchemaRegistryClient:
    def __init__(self, base_url: str, timeout_s: float = 5.0) -> None:
        self.base_url = base_url.rstrip("/")
        self._client = httpx.Client(timeout=timeout_s)
        self._subject_cache: dict[str, tuple[int, dict[str, Any]]] = {}
        self._id_cache: dict[int, dict[str, Any]] = {}

    def latest_schema(self, subject: str) -> tuple[int, dict[str, Any]]:
        if subject in self._subject_cache:
            return self._subject_cache[subject]
        resp = self._client.get(f"{self.base_url}/subjects/{subject}/versions/latest")
        resp.raise_for_status()
        body = resp.json()
        schema_id = int(body["id"])
        schema = json.loads(body["schema"])
        self._subject_cache[subject] = (schema_id, schema)
        self._id_cache[schema_id] = schema
        return schema_id, schema

    def schema_by_id(self, schema_id: int) -> dict[str, Any]:
        if schema_id in self._id_cache:
            return self._id_cache[schema_id]
        resp = self._client.get(f"{self.base_url}/schemas/ids/{schema_id}")
        resp.raise_for_status()
        schema = json.loads(resp.json()["schema"])
        self._id_cache[schema_id] = schema
        return schema

    def register(self, subject: str, schema: dict[str, Any]) -> int:
        resp = self._client.post(
            f"{self.base_url}/subjects/{subject}/versions",
            json={"schema": json.dumps(schema), "schemaType": "AVRO"},
        )
        resp.raise_for_status()
        return int(resp.json()["id"])

    def close(self) -> None:
        self._client.close()

