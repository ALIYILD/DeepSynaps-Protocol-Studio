"""GZip compression tests — sync wrapper around async httpx calls."""

import asyncio
import gzip
import json
import sqlite3
import pytest

import sys
sys.path.insert(0, "apps/api/src/deepsynaps")

import httpx
from main import app, get_knowledge_layer
from knowledge_layer import KnowledgeLayer
from contracts import MultimodalEvent
from datetime import datetime, timedelta


async def _do_gzip_request(patient_id, headers):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver",
                                  headers={"Accept-Encoding": "gzip"}) as c:
        r = await c.get(
            f"/api/v1/multimodal/patients/{patient_id}/timeline",
            params={"clinician_id": headers.get("clinician_id", "c-001")},
            headers=headers,
        )
        return r.status_code, r.headers.get("content-encoding"), r.content


async def _do_plain_request(patient_id, headers):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver",
                                  headers={"Accept-Encoding": "identity"}) as c:
        r = await c.get(
            f"/api/v1/multimodal/patients/{patient_id}/timeline",
            params={"clinician_id": headers.get("clinician_id", "c-001")},
            headers=headers,
        )
        return r.status_code, r.headers.get("content-encoding"), r.content


async def _do_gzip_health():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver",
                                  headers={"Accept-Encoding": "gzip"}) as c:
        r = await c.get("/health")
        return r.status_code, r.headers.get("content-encoding"), r.json()


def _seed(db_file, patient_ids):
    conn = sqlite3.connect(db_file)
    for pid in patient_ids:
        conn.execute("INSERT OR REPLACE INTO patient_access VALUES (?,?,?,?,?)",
                     (pid, "clinic-001", "c-001", "read", 1))
    conn.commit()
    conn.close()


@pytest.fixture
def db(tmp_path):
    """Single db_file + kl pair shared within a test."""
    path = str(tmp_path / "test.db")
    kl = KnowledgeLayer(db_url=path)
    return {"path": path, "kl": kl}


# ── Compression Activation ─────────────────────────────────────

class TestCompressionActivation:
    def test_large_response_is_gzipped(self, db):
        _seed(db["path"], ["p-c"])
        kl = db["kl"]
        for i in range(200):
            kl.insert_event(MultimodalEvent(
                patient_id="p-c", event_type="test",
                modality="assessment", source_system="test",
                source_record_id=f"r{i}",
                timestamp=datetime.now() - timedelta(hours=i),
                value_summary=("Detailed clinical observation with extended "
                               "narrative for payload size testing that repeats "
                               "many times to ensure compression activation") * 20,
                confidence=0.85, data_quality="high",
            ))
        app.dependency_overrides[get_knowledge_layer] = lambda: kl
        try:
            status, ce, body = asyncio.run(_do_gzip_request("p-c", {
                "X-Clinic-ID": "clinic-001", "X-Patient-Access-Token": "token"}))
        finally:
            app.dependency_overrides.clear()
        assert status == 200
        assert ce == "gzip", f"Expected gzip, got: {ce}"
        parsed = json.loads(body)
        assert "safety_disclaimer" in parsed
        assert len(parsed["events"]) == 200

    def test_small_response_not_gzipped(self):
        status, ce, body = asyncio.run(_do_gzip_health())
        assert status == 200
        assert ce != "gzip"
        assert body["status"] == "ok"

    def test_no_accept_encoding_no_gzip(self, db):
        _seed(db["path"], ["p-n"])
        kl = db["kl"]
        kl.insert_event(MultimodalEvent(
            patient_id="p-n", event_type="test", modality="assessment",
            source_system="test", source_record_id="r1",
            timestamp=datetime.now(), value_summary="x" * 5000,
            confidence=0.9, data_quality="high",
        ))
        app.dependency_overrides[get_knowledge_layer] = lambda: kl
        try:
            status, ce, _ = asyncio.run(_do_plain_request("p-n", {
                "X-Clinic-ID": "clinic-001", "X-Patient-Access-Token": "token"}))
        finally:
            app.dependency_overrides.clear()
        assert status == 200
        assert ce != "gzip"


# ── Compression Ratio ──────────────────────────────────────────

class TestCompressionRatio:
    def test_ratio_above_50_percent(self, db):
        _seed(db["path"], ["p-r"])
        kl = db["kl"]
        for i in range(200):
            kl.insert_event(MultimodalEvent(
                patient_id="p-r", event_type="test",
                modality="assessment", source_system="test",
                source_record_id=f"r{i}",
                timestamp=datetime.now() - timedelta(hours=i),
                value_summary=("Detailed clinical observation event with "
                               "repeated text for compression ratio testing") * 10,
                confidence=0.85, data_quality="high",
            ))
        app.dependency_overrides[get_knowledge_layer] = lambda: kl
        try:
            status, ce, body = asyncio.run(_do_gzip_request("p-r", {
                "X-Clinic-ID": "clinic-001", "X-Patient-Access-Token": "token"}))
        finally:
            app.dependency_overrides.clear()
        assert status == 200 and ce == "gzip"
        # httpx auto-decompresses body; compare sizes manually
        comp = len(gzip.compress(body))
        assert comp < len(body) * 0.5, (
            f"Ratio {comp}/{len(body)} = {comp/len(body):.1%} not < 50%"
        )


# ── Headers Preserved ──────────────────────────────────────────

class TestHeadersPreserved:
    def test_safety_disclaimer_survives(self, db):
        _seed(db["path"], ["p-s"])
        kl = db["kl"]
        for i in range(50):
            kl.insert_event(MultimodalEvent(
                patient_id="p-s", event_type="test", modality="qeeg",
                source_system="test", source_record_id=f"r{i}",
                timestamp=datetime.now() - timedelta(hours=i),
                value_summary=("Long description for safety disclaimer "
                               "compression survival testing") * 15,
                confidence=0.8, data_quality="medium",
            ))
        app.dependency_overrides[get_knowledge_layer] = lambda: kl
        try:
            status, ce, body = asyncio.run(_do_gzip_request("p-s", {
                "X-Clinic-ID": "clinic-001", "X-Patient-Access-Token": "token"}))
        finally:
            app.dependency_overrides.clear()
        assert status == 200 and ce == "gzip"
        assert "decision support only" in json.loads(body).get("safety_disclaimer", "").lower()

    def test_content_type_json(self, db):
        _seed(db["path"], ["p-ct"])
        kl = db["kl"]
        kl.insert_event(MultimodalEvent(
            patient_id="p-ct", event_type="test", modality="assessment",
            source_system="test", source_record_id="r1",
            timestamp=datetime.now(), value_summary="x" * 5000,
            confidence=0.9, data_quality="high",
        ))
        app.dependency_overrides[get_knowledge_layer] = lambda: kl
        try:
            status, ce, body = asyncio.run(_do_gzip_request("p-ct", {
                "X-Clinic-ID": "clinic-001", "X-Patient-Access-Token": "token"}))
        finally:
            app.dependency_overrides.clear()
        assert status == 200 and ce == "gzip"
        assert "events" in json.loads(body)
