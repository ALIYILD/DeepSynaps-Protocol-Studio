"""
DeepSynaps Protocol Studio — Lifespan Manager v4

Complete lifespan manager that:
1. Initializes adapter registry v3
2. Initializes intelligent orchestrator
3. Initializes smart cache
4. Initializes governance layer
5. Initializes all 4 analyzer bridges
6. Logs startup status for every component
7. Graceful shutdown on exit

Usage:
    from app.lifespan_v4 import deepsynaps_lifespan
    app = FastAPI(lifespan=deepsynaps_lifespan)
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
import time
from contextlib import asynccontextmanager
from typing import Any, Optional

from fastapi import FastAPI

# ─── Logging ─────────────────────────────────────────────────────────────────

LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s | %(name)-30s | %(levelname)-7s | %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("deepsynaps.lifespan")

# ─── Component Status Tracker ────────────────────────────────────────────────

_COMPONENT_STATUS: dict[str, dict[str, Any]] = {}


def _safe_import(module_path: str, attr_name: str | None = None) -> Any:
    """Gracefully import a module or attribute; return None on failure."""
    try:
        module = __import__(module_path, fromlist=[attr_name] if attr_name else [])
        if attr_name is None:
            return module
        return getattr(module, attr_name)
    except Exception as exc:
        logger.debug("Import failed for %s.%s: %s", module_path, attr_name or "*", exc)
        return None


# ═══════════════════════════════════════════════════════════════════════════════
#  INITIALIZATION PHASES
# ═══════════════════════════════════════════════════════════════════════════════


async def _init_adapter_registry_v3(app: FastAPI) -> None:
    """Phase 1: Initialize Adapter Registry v3 with all 66 adapters."""
    phase = "adapter_registry"
    try:
        # Try the v3 registry first
        registry_cls = _safe_import("app.adapters.adapter_registry_v3", "AdapterRegistry")
        if registry_cls is None:
            # Fallback to v2
            registry_cls = _safe_import("app.adapters.adapter_registry", "AdapterRegistry")
        if registry_cls is None:
            # Fallback to wiring module
            wiring = _safe_import("app.adapter_wiring", "get_adapter_wiring")
            if wiring:
                app.state.adapter_wiring = wiring()
                result = await app.state.adapter_wiring.initialize_all()
                _COMPONENT_STATUS[phase] = {
                    "status": "ready",
                    "loaded": result.get("loaded", 0),
                    "failed": result.get("failed", 0),
                    "pending": result.get("pending", 0),
                }
                logger.info(
                    "Adapter Registry     : %s/%s adapters loaded (%s failed, %s pending)",
                    result.get("loaded", 0),
                    result.get("loaded", 0) + result.get("failed", 0) + result.get("pending", 0),
                    result.get("failed", 0),
                    result.get("pending", 0),
                )
            else:
                raise ImportError("No adapter registry available")
            return

        app.state.registry = registry_cls()
        if hasattr(app.state.registry, "initialize") and callable(app.state.registry.initialize):
            if asyncio.iscoroutinefunction(app.state.registry.initialize):
                await app.state.registry.initialize()
            else:
                app.state.registry.initialize()

        # Count available adapters
        available = 0
        failed = 0
        if hasattr(app.state.registry, "list_available_adapters"):
            try:
                available = len(app.state.registry.list_available_adapters())
            except Exception:
                available = 0
        if hasattr(app.state.registry, "list_failed_adapters"):
            try:
                failed = len(app.state.registry.list_failed_adapters())
            except Exception:
                failed = 0

        _COMPONENT_STATUS[phase] = {
            "status": "ready",
            "adapters_loaded": available,
            "adapters_failed": failed,
        }
        logger.info("Adapter Registry v3  : %s loaded, %s failed", available, failed)
    except Exception as exc:
        logger.warning("Adapter Registry init: %s", exc)
        app.state.registry = None
        _COMPONENT_STATUS[phase] = {"status": "failed", "error": str(exc)}


async def _init_smart_cache(app: FastAPI) -> None:
    """Phase 2: Initialize Smart Cache."""
    phase = "smart_cache"
    try:
        cache_cls = _safe_import("app.intelligent.smart_cache", "SmartCache")
        if cache_cls is None:
            # Fallback: try wiring module
            cache_cls = _safe_import("app.intelligent.smart_cache", "SmartCache")
        if cache_cls is None:
            raise ImportError("SmartCache not found")

        app.state.cache = cache_cls()
        if hasattr(app.state.cache, "initialize") and callable(app.state.cache.initialize):
            if asyncio.iscoroutinefunction(app.state.cache.initialize):
                await app.state.cache.initialize()
            else:
                app.state.cache.initialize()

        _COMPONENT_STATUS[phase] = {"status": "ready"}
        logger.info("Smart Cache          : READY")
    except Exception as exc:
        logger.warning("Smart Cache init: %s", exc)
        app.state.cache = None
        _COMPONENT_STATUS[phase] = {"status": "failed", "error": str(exc)}


async def _init_confidence_engine(app: FastAPI) -> None:
    """Phase 3: Initialize 7D Confidence Engine."""
    phase = "confidence_engine"
    try:
        engine_cls = _safe_import("app.intelligent.confidence_engine", "ConfidenceEngine")
        if engine_cls is None:
            raise ImportError("ConfidenceEngine not found")

        app.state.confidence_engine = engine_cls()
        _COMPONENT_STATUS[phase] = {"status": "ready"}
        logger.info("Confidence Engine    : READY")
    except Exception as exc:
        logger.warning("Confidence Engine init: %s", exc)
        app.state.confidence_engine = None
        _COMPONENT_STATUS[phase] = {"status": "failed", "error": str(exc)}


async def _init_governance_layer(app: FastAPI) -> None:
    """Phase 4: Initialize Governance Layer."""
    phase = "governance_layer"
    try:
        gov_cls = _safe_import("app.intelligent.governance_layer", "GovernanceLayer")
        if gov_cls is None:
            raise ImportError("GovernanceLayer not found")

        app.state.governance = gov_cls()
        _COMPONENT_STATUS[phase] = {"status": "ready"}
        logger.info("Governance Layer     : READY")
    except Exception as exc:
        logger.warning("Governance Layer init: %s", exc)
        app.state.governance = None
        _COMPONENT_STATUS[phase] = {"status": "failed", "error": str(exc)}


async def _init_cross_reference_mesh(app: FastAPI) -> None:
    """Phase 5: Initialize Cross-Reference Mesh."""
    phase = "cross_reference_mesh"
    try:
        mesh_cls = _safe_import("app.intelligent.cross_reference_mesh", "CrossReferenceMesh")
        if mesh_cls is None:
            raise ImportError("CrossReferenceMesh not found")

        app.state.cross_ref_mesh = mesh_cls()
        _COMPONENT_STATUS[phase] = {"status": "ready"}
        logger.info("Cross-Reference Mesh : READY")
    except Exception as exc:
        logger.warning("Cross-Reference Mesh init: %s", exc)
        app.state.cross_ref_mesh = None
        _COMPONENT_STATUS[phase] = {"status": "failed", "error": str(exc)}


async def _init_evidence_fusion(app: FastAPI) -> None:
    """Phase 6: Initialize Evidence Fusion engine."""
    phase = "evidence_fusion"
    try:
        fusion_cls = _safe_import("app.intelligent.evidence_fusion", "EvidenceFusion")
        if fusion_cls is None:
            raise ImportError("EvidenceFusion not found")

        app.state.evidence_fusion = fusion_cls()
        _COMPONENT_STATUS[phase] = {"status": "ready"}
        logger.info("Evidence Fusion      : READY")
    except Exception as exc:
        logger.warning("Evidence Fusion init: %s", exc)
        app.state.evidence_fusion = None
        _COMPONENT_STATUS[phase] = {"status": "failed", "error": str(exc)}


async def _init_query_planner(app: FastAPI) -> None:
    """Phase 7: Initialize Query Planner."""
    phase = "query_planner"
    try:
        planner_cls = _safe_import("app.intelligent.query_planner", "QueryPlanner")
        if planner_cls is None:
            raise ImportError("QueryPlanner not found")

        app.state.query_planner = planner_cls()
        _COMPONENT_STATUS[phase] = {"status": "ready"}
        logger.info("Query Planner        : READY")
    except Exception as exc:
        logger.warning("Query Planner init: %s", exc)
        app.state.query_planner = None
        _COMPONENT_STATUS[phase] = {"status": "failed", "error": str(exc)}


async def _init_response_synthesizer(app: FastAPI) -> None:
    """Phase 8: Initialize Response Synthesizer."""
    phase = "response_synthesizer"
    try:
        synth_cls = _safe_import("app.intelligent.response_synthesizer", "ResponseSynthesizer")
        if synth_cls is None:
            raise ImportError("ResponseSynthesizer not found")

        app.state.response_synthesizer = synth_cls()
        _COMPONENT_STATUS[phase] = {"status": "ready"}
        logger.info("Response Synthesizer : READY")
    except Exception as exc:
        logger.warning("Response Synthesizer init: %s", exc)
        app.state.response_synthesizer = None
        _COMPONENT_STATUS[phase] = {"status": "failed", "error": str(exc)}


async def _init_intelligent_orchestrator(app: FastAPI) -> None:
    """Phase 9: Initialize Intelligent Orchestrator (depends on phases 1-8)."""
    phase = "orchestrator"
    try:
        orch_cls = _safe_import("app.intelligent.intelligent_orchestrator", "IntelligentOrchestrator")
        if orch_cls is None:
            raise ImportError("IntelligentOrchestrator not found")

        # Build kwargs from available dependencies
        kwargs: dict[str, Any] = {}
        if getattr(app.state, "registry", None) is not None:
            kwargs["registry"] = app.state.registry
        if getattr(app.state, "response_synthesizer", None) is not None:
            kwargs["synthesizer"] = app.state.response_synthesizer
        if getattr(app.state, "confidence_engine", None) is not None:
            kwargs["confidence_engine"] = app.state.confidence_engine
        if getattr(app.state, "cross_ref_mesh", None) is not None:
            kwargs["cross_ref_mesh"] = app.state.cross_ref_mesh
        if getattr(app.state, "evidence_fusion", None) is not None:
            kwargs["evidence_fusion"] = app.state.evidence_fusion
        if getattr(app.state, "query_planner", None) is not None:
            kwargs["query_planner"] = app.state.query_planner
        if getattr(app.state, "governance", None) is not None:
            kwargs["governance"] = app.state.governance
        if getattr(app.state, "cache", None) is not None:
            kwargs["cache"] = app.state.cache

        app.state.orchestrator = orch_cls(**kwargs)
        _COMPONENT_STATUS[phase] = {"status": "ready", "dependencies": list(kwargs.keys())}
        logger.info("Intelligent Orchestrator: READY (deps: %s)", ", ".join(kwargs.keys()))
    except Exception as exc:
        logger.warning("Orchestrator init: %s", exc)
        app.state.orchestrator = None
        _COMPONENT_STATUS[phase] = {"status": "failed", "error": str(exc)}


async def _init_multimodal_synthesizer(app: FastAPI) -> None:
    """Phase 10: Initialize Multimodal Synthesizer."""
    phase = "multimodal_synthesizer"
    try:
        mm_cls = _safe_import("app.synthesis.multimodal_synthesizer", "MultimodalSynthesizer")
        if mm_cls is None:
            # Try alternative path
            mm_cls = _safe_import("app.multimodal_synthesizer_v2", "MultimodalSynthesizerV2")
        if mm_cls is None:
            raise ImportError("MultimodalSynthesizer not found")

        app.state.multimodal_synthesizer = mm_cls()
        _COMPONENT_STATUS[phase] = {"status": "ready"}
        logger.info("Multimodal Synthesizer: READY")
    except Exception as exc:
        logger.warning("Multimodal Synthesizer init: %s", exc)
        app.state.multimodal_synthesizer = None
        _COMPONENT_STATUS[phase] = {"status": "failed", "error": str(exc)}


async def _init_protocol_generator(app: FastAPI) -> None:
    """Phase 11: Initialize Protocol Generator."""
    phase = "protocol_generator"
    try:
        pg_cls = _safe_import("app.protocol.protocol_generator", "ProtocolGenerator")
        if pg_cls is None:
            # Try alternative paths
            pg_cls = _safe_import("app.protocol_generator", "ProtocolGenerator")
        if pg_cls is None:
            raise ImportError("ProtocolGenerator not found")

        app.state.protocol_generator = pg_cls()
        _COMPONENT_STATUS[phase] = {"status": "ready"}
        logger.info("Protocol Generator   : READY")
    except Exception as exc:
        logger.warning("Protocol Generator init: %s", exc)
        app.state.protocol_generator = None
        _COMPONENT_STATUS[phase] = {"status": "failed", "error": str(exc)}


async def _init_evidence_store(app: FastAPI) -> None:
    """Phase 12: Initialize Evidence Store."""
    phase = "evidence_store"
    try:
        es_cls = _safe_import("app.evidence.evidence_store", "EvidenceStore")
        if es_cls is None:
            raise ImportError("EvidenceStore not found")

        app.state.evidence_store = es_cls()
        _COMPONENT_STATUS[phase] = {"status": "ready"}
        logger.info("Evidence Store       : READY")
    except Exception as exc:
        logger.warning("Evidence Store init: %s", exc)
        app.state.evidence_store = None
        _COMPONENT_STATUS[phase] = {"status": "failed", "error": str(exc)}


async def _init_analyzer_bridges(app: FastAPI) -> None:
    """Phase 13: Initialize all 4 Analyzer Bridges."""
    bridges = [
        ("efficacy_analyzer", "EfficacyAnalyzer", "Efficacy Analyzer"),
        ("safety_analyzer", "SafetyAnalyzer", "Safety Analyzer"),
        ("comparator_analyzer", "ComparatorAnalyzer", "Comparator Analyzer"),
        ("biomarker_analyzer", "BiomarkerAnalyzer", "Biomarker Analyzer"),
    ]

    for bridge_name, class_name, display_name in bridges:
        try:
            cls = _safe_import(f"app.analyzers.{bridge_name}", class_name)
            if cls is not None:
                setattr(app.state, bridge_name, cls())
                _COMPONENT_STATUS[bridge_name] = {"status": "ready"}
                logger.info("%-20s : READY", display_name)
            else:
                # Try alternative: qeeg analyzer bridges
                alt_cls = _safe_import(f"app.qeeg_analyzer_bridge", class_name)
                if alt_cls is not None:
                    setattr(app.state, bridge_name, alt_cls())
                    _COMPONENT_STATUS[bridge_name] = {"status": "ready"}
                    logger.info("%-20s : READY (alt)", display_name)
                else:
                    raise ImportError(f"{class_name} not found")
        except Exception as exc:
            logger.warning("%s init: %s", display_name, exc)
            setattr(app.state, bridge_name, None)
            _COMPONENT_STATUS[bridge_name] = {"status": "failed", "error": str(exc)}


async def _init_neuroimaging_pipeline(app: FastAPI) -> None:
    """Phase 14: Initialize Neuroimaging Pipeline (video analysis)."""
    phase = "neuroimaging_pipeline"
    try:
        pipeline_cls = _safe_import("app.services.neuroimaging_pipeline", "NeuroimagingPipeline")
        if pipeline_cls is None:
            raise ImportError("NeuroimagingPipeline not found")

        app.state.neuroimaging_pipeline = pipeline_cls()
        _COMPONENT_STATUS[phase] = {"status": "ready"}
        logger.info("Neuroimaging Pipeline: READY")
    except Exception as exc:
        logger.debug("Neuroimaging Pipeline init (optional): %s", exc)
        app.state.neuroimaging_pipeline = None
        _COMPONENT_STATUS[phase] = {"status": "pending", "error": str(exc)}


async def _init_knowledge_router(app: FastAPI) -> None:
    """Phase 15: Initialize Knowledge Router v2."""
    phase = "knowledge_router"
    try:
        router_cls = _safe_import("app.knowledge_router_v2", "KnowledgeRouterV2")
        if router_cls is None:
            router_cls = _safe_import("app.routers.knowledge_router_v2", "router")
        if router_cls is not None:
            app.state.knowledge_router = router_cls
            _COMPONENT_STATUS[phase] = {"status": "ready"}
            logger.info("Knowledge Router v2  : READY")
        else:
            raise ImportError("KnowledgeRouter not found")
    except Exception as exc:
        logger.debug("Knowledge Router init (optional): %s", exc)
        app.state.knowledge_router = None
        _COMPONENT_STATUS[phase] = {"status": "pending", "error": str(exc)}


# ═══════════════════════════════════════════════════════════════════════════════
#  MAIN LIFESPAN
# ═══════════════════════════════════════════════════════════════════════════════


@asynccontextmanager
async def deepsynaps_lifespan(app: FastAPI):
    """DeepSynaps Protocol Studio v4 — Full Lifecycle Manager.

    Initializes all subsystems in dependency order:
    1. Adapter Registry v3 (66 adapters)
    2. Smart Cache
    3. Confidence Engine
    4. Governance Layer
    5. Cross-Reference Mesh
    6. Evidence Fusion
    7. Query Planner
    8. Response Synthesizer
    9. Intelligent Orchestrator (depends on 1-8)
    10. Multimodal Synthesizer
    11. Protocol Generator
    12. Evidence Store
    13. Analyzer Bridges (x4)
    14. Neuroimaging Pipeline
    15. Knowledge Router v2
    """
    t0 = time.perf_counter()
    logger.info("=" * 60)
    logger.info("DeepSynaps Protocol Studio v4  —  Boot Sequence")
    logger.info("=" * 60)

    # Reset status
    global _COMPONENT_STATUS
    _COMPONENT_STATUS = {}

    # ── Phase 1: Adapter Registry ──
    await _init_adapter_registry_v3(app)

    # ── Phase 2: Smart Cache ──
    await _init_smart_cache(app)

    # ── Phase 3: Confidence Engine ──
    await _init_confidence_engine(app)

    # ── Phase 4: Governance Layer ──
    await _init_governance_layer(app)

    # ── Phase 5: Cross-Reference Mesh ──
    await _init_cross_reference_mesh(app)

    # ── Phase 6: Evidence Fusion ──
    await _init_evidence_fusion(app)

    # ── Phase 7: Query Planner ──
    await _init_query_planner(app)

    # ── Phase 8: Response Synthesizer ──
    await _init_response_synthesizer(app)

    # ── Phase 9: Intelligent Orchestrator ──
    await _init_intelligent_orchestrator(app)

    # ── Phase 10: Multimodal Synthesizer ──
    await _init_multimodal_synthesizer(app)

    # ── Phase 11: Protocol Generator ──
    await _init_protocol_generator(app)

    # ── Phase 12: Evidence Store ──
    await _init_evidence_store(app)

    # ── Phase 13: Analyzer Bridges ──
    await _init_analyzer_bridges(app)

    # ── Phase 14: Neuroimaging Pipeline ──
    await _init_neuroimaging_pipeline(app)

    # ── Phase 15: Knowledge Router ──
    await _init_knowledge_router(app)

    # ── Boot Summary ──
    elapsed = time.perf_counter() - t0
    ready_count = sum(1 for v in _COMPONENT_STATUS.values() if v.get("status") == "ready")
    failed_count = sum(1 for v in _COMPONENT_STATUS.values() if v.get("status") == "failed")
    pending_count = sum(1 for v in _COMPONENT_STATUS.values() if v.get("status") == "pending")

    logger.info("=" * 60)
    logger.info("Boot complete in %.3fs", elapsed)
    logger.info("  Components ready : %s", ready_count)
    logger.info("  Components failed: %s", failed_count)
    logger.info("  Components pending: %s", pending_count)
    logger.info("=" * 60)

    # Store status on app state for health endpoints
    app.state.component_status = _COMPONENT_STATUS

    yield

    # ═══════════════════════════════════════════════════════════════════════════
    #  SHUTDOWN SEQUENCE
    # ═══════════════════════════════════════════════════════════════════════════

    logger.info("=" * 60)
    logger.info("DeepSynaps Protocol Studio — Shutdown Sequence")
    logger.info("=" * 60)

    # Shutdown in reverse order
    shutdown_tasks = [
        ("neuroimaging_pipeline", "Neuroimaging Pipeline"),
        ("knowledge_router", "Knowledge Router"),
        ("evidence_store", "Evidence Store"),
        ("protocol_generator", "Protocol Generator"),
        ("multimodal_synthesizer", "Multimodal Synthesizer"),
        ("orchestrator", "Intelligent Orchestrator"),
        ("response_synthesizer", "Response Synthesizer"),
        ("query_planner", "Query Planner"),
        ("evidence_fusion", "Evidence Fusion"),
        ("cross_ref_mesh", "Cross-Reference Mesh"),
        ("governance", "Governance Layer"),
        ("confidence_engine", "Confidence Engine"),
        ("cache", "Smart Cache"),
        ("registry", "Adapter Registry"),
        ("adapter_wiring", "Adapter Wiring"),
    ]

    for attr_name, display_name in shutdown_tasks:
        instance = getattr(app.state, attr_name, None)
        if instance is not None:
            try:
                if hasattr(instance, "close") and callable(getattr(instance, "close")):
                    if asyncio.iscoroutinefunction(instance.close):
                        await instance.close()
                    else:
                        instance.close()
                    logger.info("  %-30s : closed", display_name)
                elif hasattr(instance, "shutdown") and callable(getattr(instance, "shutdown")):
                    if asyncio.iscoroutinefunction(instance.shutdown):
                        await instance.shutdown()
                    else:
                        instance.shutdown()
                    logger.info("  %-30s : shutdown", display_name)
                else:
                    logger.debug("  %-30s : no cleanup needed", display_name)
            except Exception as exc:
                logger.warning("  %-30s : shutdown error — %s", display_name, exc)

    # Shutdown analyzer bridges
    for bridge_name in ["efficacy_analyzer", "safety_analyzer", "comparator_analyzer", "biomarker_analyzer"]:
        instance = getattr(app.state, bridge_name, None)
        if instance is not None:
            try:
                if hasattr(instance, "close") and callable(getattr(instance, "close")):
                    if asyncio.iscoroutinefunction(instance.close):
                        await instance.close()
                    else:
                        instance.close()
                logger.info("  %-30s : closed", bridge_name)
            except Exception as exc:
                logger.warning("  %-30s : shutdown error — %s", bridge_name, exc)

    logger.info("DeepSynaps Protocol Studio — Goodbye.")
    logger.info("=" * 60)


# ═══════════════════════════════════════════════════════════════════════════════
#  UTILITY FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════


def get_component_status() -> dict[str, dict[str, Any]]:
    """Return the current component status map."""
    return dict(_COMPONENT_STATUS)


def is_component_ready(name: str) -> bool:
    """Check if a specific component is ready."""
    status = _COMPONENT_STATUS.get(name, {})
    return status.get("status") == "ready"


def get_overall_status() -> dict[str, Any]:
    """Get overall system status summary."""
    ready = sum(1 for v in _COMPONENT_STATUS.values() if v.get("status") == "ready")
    failed = sum(1 for v in _COMPONENT_STATUS.values() if v.get("status") == "failed")
    pending = sum(1 for v in _COMPONENT_STATUS.values() if v.get("status") == "pending")
    total = len(_COMPONENT_STATUS)

    return {
        "status": "healthy" if failed == 0 and ready > 0 else "degraded" if ready > 0 else "unhealthy",
        "total_components": total,
        "ready": ready,
        "failed": failed,
        "pending": pending,
        "components": dict(_COMPONENT_STATUS),
    }
