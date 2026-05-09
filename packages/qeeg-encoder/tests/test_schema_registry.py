"""Tests for qeeg_encoder.bus.schema_registry.SchemaRegistryClient.

Mocks the underlying httpx.Client so the test runs offline. Pins the
caching contract: subject lookups + id lookups must hit the registry
at most once per identifier, and register() must POST to
/subjects/<subject>/versions with the AVRO schemaType.
"""

from __future__ import annotations

import json
from typing import Any
from unittest.mock import MagicMock

import pytest

from qeeg_encoder.bus.schema_registry import SchemaRegistryClient


def _resp(status: int = 200, body: Any = None) -> MagicMock:
    r = MagicMock()
    r.status_code = status
    r.raise_for_status = MagicMock()
    if status >= 400:
        r.raise_for_status.side_effect = RuntimeError(f"HTTP {status}")
    r.json = MagicMock(return_value=body)
    return r


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> SchemaRegistryClient:
    """Build a client whose internal httpx client is a MagicMock."""
    c = SchemaRegistryClient("https://schemas.example.com/")
    fake_http = MagicMock()
    c._client = fake_http  # type: ignore[assignment]
    return c


# ───────────────────────────── construction ────────────────────────────────


class TestConstruction:
    def test_strips_trailing_slash_from_base_url(self) -> None:
        c = SchemaRegistryClient("https://schemas.example.com/")
        assert c.base_url == "https://schemas.example.com"

    def test_no_trailing_slash_passthrough(self) -> None:
        c = SchemaRegistryClient("https://schemas.example.com")
        assert c.base_url == "https://schemas.example.com"

    def test_caches_start_empty(self) -> None:
        c = SchemaRegistryClient("https://x")
        assert c._subject_cache == {}
        assert c._id_cache == {}


# ───────────────────────────── latest_schema ───────────────────────────────


class TestLatestSchema:
    def test_returns_id_and_parsed_schema(self, client: SchemaRegistryClient) -> None:
        schema_obj = {"type": "record", "name": "X"}
        client._client.get.return_value = _resp(  # type: ignore[attr-defined]
            body={"id": 7, "schema": json.dumps(schema_obj)},
        )

        sid, schema = client.latest_schema("foo-subject")
        assert sid == 7
        assert schema == schema_obj

    def test_uses_subject_cache_on_repeat_call(self, client: SchemaRegistryClient) -> None:
        client._client.get.return_value = _resp(  # type: ignore[attr-defined]
            body={"id": 7, "schema": '{"type":"record","name":"X"}'},
        )

        client.latest_schema("subject-a")
        client.latest_schema("subject-a")  # second call → cache
        assert client._client.get.call_count == 1  # type: ignore[attr-defined]

    def test_populates_id_cache_too(self, client: SchemaRegistryClient) -> None:
        client._client.get.return_value = _resp(  # type: ignore[attr-defined]
            body={"id": 42, "schema": '{"type":"record","name":"Y"}'},
        )

        sid, _ = client.latest_schema("subj")
        assert sid in client._id_cache

        # Now schema_by_id(42) must be served from cache, no extra HTTP.
        client.schema_by_id(42)
        assert client._client.get.call_count == 1  # type: ignore[attr-defined]

    def test_get_path_uses_versions_latest(self, client: SchemaRegistryClient) -> None:
        client._client.get.return_value = _resp(  # type: ignore[attr-defined]
            body={"id": 1, "schema": "{}"},
        )
        client.latest_schema("subj")
        url = client._client.get.call_args[0][0]  # type: ignore[attr-defined]
        assert url.endswith("/subjects/subj/versions/latest")


# ───────────────────────────── schema_by_id ────────────────────────────────


class TestSchemaById:
    def test_fetches_and_caches(self, client: SchemaRegistryClient) -> None:
        client._client.get.return_value = _resp(  # type: ignore[attr-defined]
            body={"schema": '{"type":"record","name":"Z"}'},
        )

        schema = client.schema_by_id(99)
        assert schema == {"type": "record", "name": "Z"}

        # Second call hits cache.
        client.schema_by_id(99)
        assert client._client.get.call_count == 1  # type: ignore[attr-defined]

    def test_get_path_uses_schemas_ids(self, client: SchemaRegistryClient) -> None:
        client._client.get.return_value = _resp(  # type: ignore[attr-defined]
            body={"schema": "{}"},
        )
        client.schema_by_id(123)
        url = client._client.get.call_args[0][0]  # type: ignore[attr-defined]
        assert url.endswith("/schemas/ids/123")


# ───────────────────────────── register ────────────────────────────────────


class TestRegister:
    def test_returns_new_schema_id(self, client: SchemaRegistryClient) -> None:
        client._client.post.return_value = _resp(body={"id": 314})  # type: ignore[attr-defined]
        schema = {"type": "record", "name": "X"}
        sid = client.register("subj", schema)
        assert sid == 314

    def test_post_body_contains_avro_schema_type(self, client: SchemaRegistryClient) -> None:
        client._client.post.return_value = _resp(body={"id": 1})  # type: ignore[attr-defined]
        client.register("subj", {"type": "record"})
        kwargs = client._client.post.call_args.kwargs  # type: ignore[attr-defined]
        body = kwargs["json"]
        assert body["schemaType"] == "AVRO"
        assert json.loads(body["schema"]) == {"type": "record"}

    def test_post_url_uses_versions_path(self, client: SchemaRegistryClient) -> None:
        client._client.post.return_value = _resp(body={"id": 1})  # type: ignore[attr-defined]
        client.register("foo", {})
        url = client._client.post.call_args[0][0]  # type: ignore[attr-defined]
        assert url.endswith("/subjects/foo/versions")


# ───────────────────────────── close ───────────────────────────────────────


class TestClose:
    def test_close_propagates_to_inner_client(self, client: SchemaRegistryClient) -> None:
        client.close()
        client._client.close.assert_called_once()  # type: ignore[attr-defined]
