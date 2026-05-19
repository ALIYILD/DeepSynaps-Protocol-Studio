"""
DeepSynaps Intelligent Synaps v4 — Core Intelligence Package

This package aggregates the nine intelligent Synaps components that form
the cognitive backbone of the DeepSynaps Protocol Studio:

    1. IntelligentOrchestrator   — Central dispatcher & workflow composer
    2. ConfidenceEngine          — 7-dimensional confidence scoring
    3. CrossReferenceMesh        — Cross-adapter consistency validator
    4. EvidenceFusion            — Multi-source evidence merger & ranker
    5. SmartCache                — Intelligent LRU cache with TTL
    6. QueryPlanner              — Cost-based query execution planner
    7. ResponseSynthesizer       — Structured clinical response builder
    8. GovernanceLayer           — Safety guardrails & policy enforcer
    9. IntelligentRouter         — FastAPI router exposing all endpoints

Usage:
    from app.intelligent import IntelligentOrchestrator, ConfidenceEngine
    orchestrator = IntelligentOrchestrator(...)
    result = await orchestrator.process_query("tDCS major depression")
"""

from __future__ import annotations

from typing import TYPE_CHECKING

# ─── Core Components ─────────────────────────────────────────────────────────

try:
    from app.intelligent.intelligent_orchestrator import IntelligentOrchestrator
except ImportError as _exc:
    IntelligentOrchestrator = None  # type: ignore[misc,assignment]

try:
    from app.intelligent.confidence_engine import ConfidenceEngine, ConfidenceScore
except ImportError as _exc:
    ConfidenceEngine = None  # type: ignore[misc,assignment]
    ConfidenceScore = None  # type: ignore[misc,assignment]

try:
    from app.intelligent.cross_reference_mesh import CrossReferenceMesh
except ImportError as _exc:
    CrossReferenceMesh = None  # type: ignore[misc,assignment]

try:
    from app.intelligent.evidence_fusion import EvidenceFusion
except ImportError as _exc:
    EvidenceFusion = None  # type: ignore[misc,assignment]

try:
    from app.intelligent.smart_cache import SmartCache
except ImportError as _exc:
    SmartCache = None  # type: ignore[misc,assignment]

try:
    from app.intelligent.query_planner import QueryPlanner, QueryPlan
except ImportError as _exc:
    QueryPlanner = None  # type: ignore[misc,assignment]
    QueryPlan = None  # type: ignore[misc,assignment]

try:
    from app.intelligent.response_synthesizer import ResponseSynthesizer
except ImportError as _exc:
    ResponseSynthesizer = None  # type: ignore[misc,assignment]

try:
    from app.intelligent.governance_layer import GovernanceLayer
except ImportError as _exc:
    GovernanceLayer = None  # type: ignore[misc,assignment]

# ─── FastAPI Router ──────────────────────────────────────────────────────────

try:
    from app.intelligent.intelligent_router import router
except ImportError as _exc:
    router = None  # type: ignore[misc,assignment]

# ─── Public API ──────────────────────────────────────────────────────────────

__all__ = [
    # Core orchestrator
    "IntelligentOrchestrator",
    # Confidence & validation
    "ConfidenceEngine",
    "ConfidenceScore",
    "CrossReferenceMesh",
    # Evidence processing
    "EvidenceFusion",
    # Caching
    "SmartCache",
    # Query planning
    "QueryPlanner",
    "QueryPlan",
    # Response building
    "ResponseSynthesizer",
    # Safety & governance
    "GovernanceLayer",
    # Router
    "router",
]

# ─── Package Metadata ────────────────────────────────────────────────────────

__version__ = "4.0.0"
__codename__ = "Intelligent Synaps"
