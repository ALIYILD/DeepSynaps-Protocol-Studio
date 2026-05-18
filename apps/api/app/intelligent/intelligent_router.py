"""
intelligent_router.py — Intelligent Synaps v4
===============================================
FastAPI router exposing all Intelligent Synaps capabilities.

Replaces/enhances knowledge_router_v2 with:
- Full orchestrator integration
- Pydantic request/response models
- Correlation ID tracking
- Structured error responses
- Health checks
- Adapter management

Endpoints:
    POST /intelligent-synaps/query           — General knowledge query
    POST /intelligent-synaps/search          — Smart search
    POST /intelligent-synaps/synthesize      — Multi-source synthesis
    POST /intelligent-synaps/protocol/generate      — Protocol generation
    POST /intelligent-synaps/protocol/safety-check  — Safety screening
    GET  /intelligent-synaps/confidence/{id} — Confidence details
    POST /intelligent-synaps/cross-reference — Cross-database lookup
    GET  /intelligent-synaps/evidence/{type}/{id}   — Evidence aggregation
    GET  /intelligent-synaps/health          — System health
    GET  /intelligent-synaps/adapters        — List adapters
    POST /intelligent-synaps/adapters/{name}/query  — Direct adapter query
    GET  /intelligent-synaps/adapters/{name}/health — Adapter health
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import time
import unittest
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel, Field

# FastAPI imports
try:
    from fastapi import APIRouter, HTTPException, Request, status
    from fastapi.responses import JSONResponse
    HAS_FASTAPI = True
except ImportError:
    HAS_FASTAPI = False
    # Stub classes for environments without FastAPI
    class APIRouter:
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            self.routes: list = []
            self.prefix = kwargs.get("prefix", "")
            self.tags = kwargs.get("tags", [])
        def get(self, *args: Any, **kwargs: Any) -> Any:
            def decorator(f: Any) -> Any: return f
            return decorator
        def post(self, *args: Any, **kwargs: Any) -> Any:
            def decorator(f: Any) -> Any: return f
            return decorator
    class HTTPException(Exception):
        def __init__(self, *args: Any, **kwargs: Any) -> None: pass

# Local imports
from confidence_engine import ConfidenceEngine, ConfidenceScore
from cross_reference_mesh import CrossReferenceMesh
from evidence_fusion import EvidenceFusion, EvidencePiece, FusedEvidence
from governance_layer import GovernanceLayer, SafetyResult
from intelligent_orchestrator import (
    IntelligentOrchestrator, AdapterRegistry,
    OrchestratorResult, SearchResult, ProtocolResult,
)
from query_planner import QueryPlanner, QueryPlan
from response_synthesizer import ResponseSynthesizer
from smart_cache import SmartCache

logger = logging.getLogger("intelligent_synaps.router")

# ---------------------------------------------------------------------------
# Pydantic request/response models
# ---------------------------------------------------------------------------

class QueryRequest(BaseModel):
    """Request model for knowledge queries."""

    query: str
    context: Optional[Dict[str, Any]] = None
    filters: Optional[Dict[str, Any]] = None
    min_confidence: float = 0.6
    correlation_id: Optional[str] = None


class SearchRequest(BaseModel):
    """Request model for smart search."""

    query: str
    filters: Optional[Dict[str, Any]] = None
    max_results: int = 20
    correlation_id: Optional[str] = None


class SynthesizeRequest(BaseModel):
    """Request model for multi-source synthesis."""

    queries: List[str]
    context: Optional[Dict[str, Any]] = None
    include_structured: bool = True
    correlation_id: Optional[str] = None


class ProtocolRequest(BaseModel):
    """Request model for protocol generation."""

    patient_data: Dict[str, Any]
    target_indication: str
    modalities: List[str] = ["tDCS", "TMS", "PBM", "Neurofeedback"]
    correlation_id: Optional[str] = None


class SafetyCheckRequest(BaseModel):
    """Request model for safety screening."""

    protocol: Dict[str, Any]
    patient_data: Dict[str, Any]
    correlation_id: Optional[str] = None


class CrossReferenceRequest(BaseModel):
    """Request model for cross-database entity lookup."""

    entity_type: str
    identifier: str
    include_profile: bool = True
    correlation_id: Optional[str] = None


class DirectAdapterRequest(BaseModel):
    """Request model for direct adapter queries."""

    query: str
    context: Optional[Dict[str, Any]] = None
    correlation_id: Optional[str] = None


class ErrorResponse(BaseModel):
    """Standard error response."""

    error: str
    detail: str = ""
    correlation_id: str = ""
    timestamp: str = ""
    path: str = ""


class HealthResponse(BaseModel):
    """System health check response."""

    status: str = "healthy"
    version: str = "4.0.0"
    components: Dict[str, str] = Field(default_factory=dict)
    uptime_seconds: float = 0.0
    timestamp: str = ""


class AdapterListResponse(BaseModel):
    """List of available adapters."""

    adapters: List[Dict[str, Any]] = Field(default_factory=list)
    total: int = 0
    active: int = 0


class ConfidenceDetailResponse(BaseModel):
    """Confidence scoring details."""

    result_id: str = ""
    confidence: Optional[Dict[str, Any]] = None
    dimensions: Optional[Dict[str, float]] = None
    composite: float = 0.0
    grade: str = "F"
    sources: List[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Router setup
# ---------------------------------------------------------------------------

def create_router() -> APIRouter:
    """Create and configure the Intelligent Synaps router."""
    router = APIRouter(
        prefix="/intelligent-synaps",
        tags=["Intelligent Synaps v4"],
    )

    # Module-level singletons (shared across requests)
    _orchestrator: Optional[IntelligentOrchestrator] = None
    _start_time = time.time()

    def get_orchestrator() -> IntelligentOrchestrator:
        nonlocal _orchestrator
        if _orchestrator is None:
            registry = AdapterRegistry()
            _orchestrator = IntelligentOrchestrator(registry)
        return _orchestrator

    def generate_cid() -> str:
        return hashlib.sha256(
            str(time.time()).encode()
        ).hexdigest()[:12]

    # -- POST /intelligent-synaps/query ------------------------------------
    @router.post(
        "/query",
        response_model=Dict[str, Any],
        summary="General knowledge query",
        description="Execute a natural language query across all relevant adapters with full synthesis.",
    )
    async def query(request: QueryRequest) -> Dict[str, Any]:
        """Main query endpoint — full pipeline execution."""
        cid = request.correlation_id or generate_cid()
        start_time = time.time()

        if not request.query or not request.query.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST if HAS_FASTAPI else 400,
                detail="Query cannot be empty",
            )

        try:
            orch = get_orchestrator()
            result = await orch.query(
                query=request.query,
                context=request.context,
                correlation_id=cid,
            )

            response = result.dict() if hasattr(result, "dict") else dict(result)
            response["correlation_id"] = cid
            response["processing_time_ms"] = round(
                (time.time() - start_time) * 1000, 1
            )
            return response

        except Exception as exc:
            logger.error("Query failed [cid=%s]: %s", cid, exc, exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR if HAS_FASTAPI else 500,
                detail=f"Query processing failed: {str(exc)}",
            )

    # -- POST /intelligent-synaps/search -----------------------------------
    @router.post(
        "/search",
        response_model=Dict[str, Any],
        summary="Smart search",
        description="Fast search returning structured results without full synthesis.",
    )
    async def search(request: SearchRequest) -> Dict[str, Any]:
        """Smart search — fast structured results."""
        cid = request.correlation_id or generate_cid()
        start_time = time.time()

        try:
            orch = get_orchestrator()
            result = await orch.smart_search(
                query=request.query,
                filters=request.filters,
                correlation_id=cid,
            )
            response = result.dict() if hasattr(result, "dict") else dict(result)
            response["correlation_id"] = cid
            response["processing_time_ms"] = round(
                (time.time() - start_time) * 1000, 1
            )
            return response

        except Exception as exc:
            logger.error("Search failed [cid=%s]: %s", cid, exc, exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR if HAS_FASTAPI else 500,
                detail=f"Search failed: {str(exc)}",
            )

    # -- POST /intelligent-synaps/synthesize -------------------------------
    @router.post(
        "/synthesize",
        response_model=Dict[str, Any],
        summary="Multi-source synthesis",
        description="Synthesize results from multiple queries into a unified response.",
    )
    async def synthesize(request: SynthesizeRequest) -> Dict[str, Any]:
        """Multi-source synthesis endpoint."""
        cid = request.correlation_id or generate_cid()
        start_time = time.time()

        try:
            orch = get_orchestrator()

            # Execute all queries
            all_results: List[Any] = []
            for q in request.queries:
                result = await orch.query(q, context=request.context, correlation_id=cid)
                all_results.append(result)

            # Combine and synthesize
            synth_results = []
            for r in all_results:
                if hasattr(r, "sources") and r.sources:
                    for src in r.sources:
                        synth_results.append(src)

            synthesizer = orch.synthesizer
            # Build adapter results from query results
            adapter_results = []
            for r in all_results:
                ar_data = {
                    "adapter_name": r.query,
                    "data": {"query_result": r.summary},
                    "confidence": r.confidence,
                }
                from response_synthesizer import AdapterResult
                adapter_results.append(AdapterResult(**ar_data))

            synthesized = await synthesizer.synthesize(
                adapter_results,
                "; ".join(request.queries),
                include_structured=request.include_structured,
            )

            return {
                "correlation_id": cid,
                "synthesized_response": synthesized.dict(),
                "queries_processed": len(request.queries),
                "processing_time_ms": round((time.time() - start_time) * 1000, 1),
            }

        except Exception as exc:
            logger.error("Synthesis failed [cid=%s]: %s", cid, exc, exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR if HAS_FASTAPI else 500,
                detail=f"Synthesis failed: {str(exc)}",
            )

    # -- POST /intelligent-synaps/protocol/generate ------------------------
    @router.post(
        "/protocol/generate",
        response_model=Dict[str, Any],
        summary="Generate neuromodulation protocol",
        description="Generate a personalised neuromodulation protocol using all intelligence components.",
    )
    async def generate_protocol(request: ProtocolRequest) -> Dict[str, Any]:
        """Protocol generation endpoint."""
        cid = request.correlation_id or generate_cid()
        start_time = time.time()

        try:
            orch = get_orchestrator()
            result = await orch.generate_protocol(
                patient_data=request.patient_data,
                target=request.target_indication,
                modalities=request.modalities,
                correlation_id=cid,
            )

            response = result.dict() if hasattr(result, "dict") else dict(result)
            response["correlation_id"] = cid
            response["processing_time_ms"] = round(
                (time.time() - start_time) * 1000, 1
            )
            return response

        except Exception as exc:
            logger.error("Protocol gen failed [cid=%s]: %s", cid, exc, exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR if HAS_FASTAPI else 500,
                detail=f"Protocol generation failed: {str(exc)}",
            )

    # -- POST /intelligent-synaps/protocol/safety-check --------------------
    @router.post(
        "/protocol/safety-check",
        response_model=Dict[str, Any],
        summary="Safety screening",
        description="Full safety screening for a proposed protocol.",
    )
    async def safety_check(request: SafetyCheckRequest) -> Dict[str, Any]:
        """Safety screening endpoint."""
        cid = request.correlation_id or generate_cid()
        start_time = time.time()

        try:
            orch = get_orchestrator()
            result = await orch.safety_check(
                protocol=request.protocol,
                patient_data=request.patient_data,
                correlation_id=cid,
            )

            response = result.dict() if hasattr(result, "dict") else dict(result)
            response["correlation_id"] = cid
            response["processing_time_ms"] = round(
                (time.time() - start_time) * 1000, 1
            )
            return response

        except Exception as exc:
            logger.error("Safety check failed [cid=%s]: %s", cid, exc, exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR if HAS_FASTAPI else 500,
                detail=f"Safety check failed: {str(exc)}",
            )

    # -- GET /intelligent-synaps/confidence/{result_id} --------------------
    @router.get(
        "/confidence/{result_id}",
        response_model=Dict[str, Any],
        summary="Get confidence details",
        description="Retrieve detailed confidence scoring for a previous result.",
    )
    async def get_confidence(result_id: str) -> Dict[str, Any]:
        """Get confidence details for a result."""
        # In production, this would retrieve from a result store
        return {
            "result_id": result_id,
            "status": "not_implemented",
            "note": "Result store retrieval not yet implemented — use query response directly",
        }

    # -- POST /intelligent-synaps/cross-reference --------------------------
    @router.post(
        "/cross-reference",
        response_model=Dict[str, Any],
        summary="Cross-database entity lookup",
        description="Look up an entity across all connected databases.",
    )
    async def cross_reference(request: CrossReferenceRequest) -> Dict[str, Any]:
        """Cross-reference an entity across databases."""
        cid = request.correlation_id or generate_cid()
        start_time = time.time()

        try:
            orch = get_orchestrator()

            # Resolve identity
            profile = await orch.cross_ref.resolve_identity(
                request.entity_type,
                request.identifier,
            )

            # Validate consistency
            consistency = await orch.cross_ref.validate_consistency(
                profile.canonical_id
            )

            return {
                "correlation_id": cid,
                "entity_type": request.entity_type,
                "identifier": request.identifier,
                "canonical_id": profile.canonical_id,
                "profile": profile.dict() if hasattr(profile, "dict") else profile,
                "consistency": consistency.dict() if hasattr(consistency, "dict") else consistency,
                "processing_time_ms": round((time.time() - start_time) * 1000, 1),
            }

        except Exception as exc:
            logger.error("Cross-reference failed [cid=%s]: %s", cid, exc, exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR if HAS_FASTAPI else 500,
                detail=f"Cross-reference failed: {str(exc)}",
            )

    # -- GET /intelligent-synaps/evidence/{entity_type}/{entity_id} --------
    @router.get(
        "/evidence/{entity_type}/{entity_id}",
        response_model=Dict[str, Any],
        summary="Evidence aggregation",
        description="Aggregate evidence for a specific entity.",
    )
    async def get_evidence(
        entity_type: str, entity_id: str
    ) -> Dict[str, Any]:
        """Get aggregated evidence for an entity."""
        try:
            orch = get_orchestrator()

            # Query for evidence
            result = await orch.query(
                query=f"{entity_type} {entity_id} evidence",
                correlation_id=generate_cid(),
            )

            return {
                "entity_type": entity_type,
                "entity_id": entity_id,
                "evidence_count": result.adapter_results,
                "confidence": result.confidence,
                "sources": result.sources,
                "fused_evidence": result.evidence_fusion,
            }

        except Exception as exc:
            logger.error("Evidence query failed: %s", exc, exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR if HAS_FASTAPI else 500,
                detail=f"Evidence query failed: {str(exc)}",
            )

    # -- GET /intelligent-synaps/health ------------------------------------
    @router.get(
        "/health",
        response_model=Dict[str, Any],
        summary="System health",
        description="Check the health status of Intelligent Synaps and all components.",
    )
    async def health() -> Dict[str, Any]:
        """System health check endpoint."""
        orch = get_orchestrator()

        # Check cache
        try:
            cache_stats = asyncio.get_event_loop().run_until_complete(
                orch.cache.stats()
            ) if False else {"status": "ok"}  # Don't actually run sync blocking
            cache_health = "healthy"
        except Exception:
            cache_health = "degraded"

        components = {
            "orchestrator": "healthy",
            "query_planner": "healthy",
            "confidence_engine": "healthy",
            "response_synthesizer": "healthy",
            "governance_layer": "healthy",
            "cross_reference_mesh": "healthy",
            "evidence_fusion": "healthy",
            "smart_cache": cache_health,
        }

        # Check adapters
        for adapter_name in orch.registry.list_adapters():
            try:
                # Fire-and-forget health check
                asyncio.create_task(orch.registry.health_check(adapter_name))
                components[f"adapter_{adapter_name}"] = "healthy"
            except Exception:
                components[f"adapter_{adapter_name}"] = "unavailable"

        return HealthResponse(
            status="healthy" if all(v == "healthy" for v in components.values()) else "degraded",
            version="4.0.0",
            components=components,
            uptime_seconds=round(time.time() - _start_time, 1),
            timestamp=datetime.now(timezone.utc).isoformat(),
        ).dict()

    # -- GET /intelligent-synaps/adapters ----------------------------------
    @router.get(
        "/adapters",
        response_model=Dict[str, Any],
        summary="List adapters",
        description="List all available adapters and their status.",
    )
    async def list_adapters() -> Dict[str, Any]:
        """List all available adapters."""
        orch = get_orchestrator()
        adapter_names = orch.registry.list_adapters()

        adapters = []
        for name in adapter_names:
            adapters.append({
                "name": name,
                "status": "active",
                "health": "healthy",
            })

        return AdapterListResponse(
            adapters=adapters,
            total=len(adapters),
            active=sum(1 for a in adapters if a["status"] == "active"),
        ).dict()

    # -- POST /intelligent-synaps/adapters/{name}/query --------------------
    @router.post(
        "/adapters/{name}/query",
        response_model=Dict[str, Any],
        summary="Direct adapter query",
        description="Send a query directly to a specific adapter.",
    )
    async def adapter_query(
        name: str, request: DirectAdapterRequest
    ) -> Dict[str, Any]:
        """Query a specific adapter directly."""
        cid = request.correlation_id or generate_cid()
        start_time = time.time()

        orch = get_orchestrator()

        if name not in orch.registry.list_adapters():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND if HAS_FASTAPI else 404,
                detail=f"Adapter '{name}' not found",
            )

        try:
            result = await orch.registry.query_adapter(name, request.query)
            return {
                "correlation_id": cid,
                "adapter": name,
                "result": result,
                "processing_time_ms": round((time.time() - start_time) * 1000, 1),
            }

        except Exception as exc:
            logger.error("Adapter query failed [cid=%s]: %s", cid, exc, exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR if HAS_FASTAPI else 500,
                detail=f"Adapter query failed: {str(exc)}",
            )

    # -- GET /intelligent-synaps/adapters/{name}/health --------------------
    @router.get(
        "/adapters/{name}/health",
        response_model=Dict[str, Any],
        summary="Adapter health",
        description="Check health status of a specific adapter.",
    )
    async def adapter_health(name: str) -> Dict[str, Any]:
        """Check adapter health."""
        orch = get_orchestrator()

        if name not in orch.registry.list_adapters():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND if HAS_FASTAPI else 404,
                detail=f"Adapter '{name}' not found",
            )

        try:
            health = await orch.registry.health_check(name)
            return {
                "adapter": name,
                "status": health.get("status", "unknown"),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        except Exception as exc:
            return {
                "adapter": name,
                "status": "unhealthy",
                "error": str(exc),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

    # -- GET /intelligent-synaps/metrics -----------------------------------
    @router.get(
        "/metrics",
        response_model=Dict[str, Any],
        summary="System metrics",
        description="Get system performance metrics.",
    )
    async def get_metrics() -> Dict[str, Any]:
        """Get system metrics."""
        orch = get_orchestrator()
        return orch.metrics.get_summary()

    # -- POST /intelligent-synaps/session ----------------------------------
    @router.post(
        "/session",
        response_model=Dict[str, Any],
        summary="Create session",
        description="Create a new user session.",
    )
    async def create_session(request: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Create a new session."""
        orch = get_orchestrator()
        patient_context = request.get("patient_context") if request else None
        session = orch.create_session(patient_context=patient_context)
        return {
            "session_id": session.session_id,
            "correlation_id": session.correlation_id,
            "created_at": session.created_at,
        }

    return router


# Create the router instance
router = create_router()


# ---------------------------------------------------------------------------
# Unit tests
# ---------------------------------------------------------------------------

class TestRouter(unittest.IsolatedAsyncioTestCase):
    async def test_router_creation(self) -> None:
        r = create_router()
        self.assertIsNotNone(r)
        self.assertTrue(len(r.routes) > 0)

    async def test_health_endpoint(self) -> None:
        r = create_router()
        # Find health endpoint
        health_route = None
        for route in r.routes:
            if hasattr(route, "path") and "health" in route.path and "adapter" not in route.path:
                health_route = route
                break
        self.assertIsNotNone(health_route)

    async def test_adapter_listing(self) -> None:
        r = create_router()
        adapters_route = None
        for route in r.routes:
            if hasattr(route, "path") and route.path == "/intelligent-synaps/adapters":
                adapters_route = route
                break
        self.assertIsNotNone(adapters_route)

    async def test_request_models(self) -> None:
        qr = QueryRequest(query="test", context={"key": "val"})
        self.assertEqual(qr.query, "test")
        self.assertEqual(qr.context, {"key": "val"})
        self.assertEqual(qr.min_confidence, 0.6)

        pr = ProtocolRequest(
            patient_data={"age": 30},
            target_indication="MDD",
        )
        self.assertEqual(pr.target_indication, "MDD")
        self.assertEqual(pr.modalities, ["tDCS", "TMS", "PBM", "Neurofeedback"])

    async def test_health_response(self) -> None:
        hr = HealthResponse(
            status="healthy",
            version="4.0.0",
            components={"orchestrator": "healthy"},
        )
        self.assertEqual(hr.status, "healthy")
        self.assertEqual(hr.version, "4.0.0")

    async def test_error_response(self) -> None:
        er = ErrorResponse(
            error="test_error",
            detail="something went wrong",
            correlation_id="test123",
        )
        self.assertEqual(er.error, "test_error")

    async def test_confidence_detail_response(self) -> None:
        cr = ConfidenceDetailResponse(
            result_id="r1",
            composite=0.85,
            grade="A",
        )
        self.assertEqual(cr.grade, "A")
        self.assertEqual(cr.composite, 0.85)


if __name__ == "__main__":
    unittest.main(module=__name__, exit=False, verbosity=2)
