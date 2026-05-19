"""
DeepSynaps Startup/Shutdown Wiring

Connects all monitoring, performance, and AI components
to the FastAPI application lifespan events.
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI

logger = logging.getLogger(__name__)


@asynccontextmanager
async def deepynaps_lifespan(app: FastAPI):
    """Lifespan events for DeepSynaps Protocol Studio."""

    # -- STARTUP --
    logger.info("=== DeepSynaps Protocol Studio v3.0 Starting ===")

    # 1. Initialize Redis cache
    try:
        from app.knowledge.knowledge_cache import KnowledgeCache
        app.state.cache = KnowledgeCache()
        logger.info("Redis cache initialized")
    except Exception as e:
        logger.warning(f"Redis cache unavailable: {e}")

    # 2. Initialize circuit breakers for the legacy knowledge-adapter set.
    # Production adapter count lives in app.services.knowledge.adapter_bootstrap.
    try:
        from app.knowledge.circuit_breaker import CircuitBreakerRegistry
        app.state.circuit_breakers = CircuitBreakerRegistry()
        logger.info("Circuit breakers initialized for legacy knowledge adapters")
    except Exception as e:
        logger.warning(f"Circuit breakers unavailable: {e}")

    # 3. Initialize batch query engine
    try:
        from app.knowledge.batch_query_engine import BatchQueryEngine
        app.state.batch_engine = BatchQueryEngine()
        logger.info("Batch query engine initialized")
    except Exception as e:
        logger.warning(f"Batch query engine unavailable: {e}")

    # 4. Start uptime monitor
    try:
        from app.knowledge.uptime_monitor import UptimeMonitor
        app.state.uptime_monitor = UptimeMonitor()
        await app.state.uptime_monitor.start()
        logger.info("Uptime monitor started")
    except Exception as e:
        logger.warning(f"Uptime monitor unavailable: {e}")

    # 5. Initialize alerting engine
    try:
        from app.knowledge.alerting_engine import AlertingEngine
        app.state.alerts = AlertingEngine()
        logger.info("Alerting engine initialized")
    except Exception as e:
        logger.warning(f"Alerting engine unavailable: {e}")

    # 6. Initialize literature monitor
    try:
        from app.knowledge.literature_monitor import LiteratureMonitor
        app.state.literature = LiteratureMonitor()
        logger.info("Literature monitor initialized")
    except Exception as e:
        logger.warning(f"Literature monitor unavailable: {e}")

    # 7. Initialize outcome prediction models
    try:
        from app.knowledge.outcome_prediction_models import TreatmentResponsePredictor
        app.state.predictor = TreatmentResponsePredictor()
        logger.info("Outcome prediction models loaded")
    except Exception as e:
        logger.warning(f"Outcome predictor unavailable: {e}")

    # 8. Initialize adverse event monitor
    try:
        from app.knowledge.adverse_event_alerts import AdverseEventMonitor
        app.state.ae_monitor = AdverseEventMonitor()
        logger.info("Adverse event monitor initialized")
    except Exception as e:
        logger.warning(f"AE monitor unavailable: {e}")

    # 9. Initialize evidence store
    try:
        from app.knowledge.evidence_store import EvidenceStore
        app.state.evidence_store = EvidenceStore()
        logger.info("Evidence store initialized")
    except Exception as e:
        logger.warning(f"Evidence store unavailable: {e}")

    # 10. Initialize protocol generator
    try:
        from app.knowledge.protocol_generator import ProtocolGenerator
        app.state.protocol_generator = ProtocolGenerator()
        logger.info("Protocol generator initialized")
    except Exception as e:
        logger.warning(f"Protocol generator unavailable: {e}")

    logger.info("=== DeepSynaps v3.0 Ready ===")

    yield  # Application runs here

    # -- SHUTDOWN --
    logger.info("=== DeepSynaps v3.0 Shutting Down ===")

    # Stop uptime monitor
    if hasattr(app.state, "uptime_monitor"):
        await app.state.uptime_monitor.stop()

    # Close cache connections
    if hasattr(app.state, "cache"):
        await app.state.cache.close()

    logger.info("=== Shutdown Complete ===")
