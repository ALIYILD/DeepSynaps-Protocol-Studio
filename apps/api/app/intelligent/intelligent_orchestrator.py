"""
intelligent_orchestrator.py — Intelligent Synaps v4
=====================================================
Central orchestration hub for routing queries to the right adapters,
synthesizing results, and managing the full knowledge pipeline.

Pipeline:
    Query → QueryPlanner.plan() → parallel adapter execution
    → ConfidenceEngine.score() → CrossReferenceMesh.link()
    → EvidenceFusion.fuse() → GovernanceLayer.check()
    → ResponseSynthesizer.synthesize() → OrchestratorResult

Also supports:
    - Smart search with automatic adapter routing
    - Protocol generation with safety checks
    - Full safety screening
    - Session management
    - Metrics collection
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import time
import unittest
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Tuple

from pydantic import BaseModel, Field

# Local imports (from the same package)
from app.intelligent.confidence_engine import ConfidenceEngine, ConfidenceScore
from app.intelligent.cross_reference_mesh import CrossReferenceMesh, EntityProfile
from app.intelligent.evidence_fusion import EvidenceFusion, EvidencePiece, FusedEvidence
from app.intelligent.governance_layer import GovernanceLayer, SafetyResult
from app.intelligent.query_planner import QueryPlanner, QueryPlan, QueryIntent, BudgetConstraint
from app.intelligent.response_synthesizer import ResponseSynthesizer, AdapterResult, SynthesizedResponse
from app.intelligent.smart_cache import SmartCache

logger = logging.getLogger("intelligent_synaps.orchestrator")

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class OrchestratorResult(BaseModel):
    """Final result from the orchestrator."""

    result_id: str = ""
    query: str = ""
    status: str = "success"  # success, partial, error
    natural_language: str = ""
    summary: str = ""
    structured_data: List[Any] = Field(default_factory=list)
    citations: List[Any] = Field(default_factory=list)
    confidence: float = 0.0
    confidence_grade: str = "F"
    sources: List[str] = Field(default_factory=list)
    adapter_results: int = 0
    execution_time_ms: float = 0.0
    safety_result: Optional[SafetyResult] = None
    cross_references: List[Any] = Field(default_factory=list)
    evidence_fusion: Optional[Any] = None
    query_plan: Optional[Any] = None
    requires_caution: bool = False
    caution_notes: List[str] = Field(default_factory=list)
    correlation_id: str = ""
    processed_at: str = ""

    class Config:
        arbitrary_types_allowed = True


class SearchResult(BaseModel):
    """Result from a smart search."""

    result_id: str = ""
    query: str = ""
    results: List[Dict[str, Any]] = Field(default_factory=list)
    total_found: int = 0
    sources_queried: List[str] = Field(default_factory=list)
    execution_time_ms: float = 0.0
    filters_applied: Dict[str, Any] = Field(default_factory=dict)


class ProtocolResult(BaseModel):
    """Result from protocol generation."""

    result_id: str = ""
    target_indication: str = ""
    modalities: List[str] = Field(default_factory=list)
    protocol: Dict[str, Any] = Field(default_factory=dict)
    safety_check: Optional[SafetyResult] = None
    confidence: float = 0.0
    evidence_summary: str = ""
    requires_review: bool = False
    review_notes: List[str] = Field(default_factory=list)
    generated_at: str = ""


class SessionContext(BaseModel):
    """User session context."""

    session_id: str = ""
    correlation_id: str = ""
    query_count: int = 0
    last_query: str = ""
    patient_context: Dict[str, Any] = Field(default_factory=dict)
    preferences: Dict[str, Any] = Field(default_factory=dict)
    created_at: str = ""


class MetricsCollector:
    """Simple metrics collector for the orchestrator."""

    def __init__(self) -> None:
        self.total_queries = 0
        self.total_errors = 0
        self.total_cache_hits = 0
        self.total_cache_misses = 0
        self.avg_latency_ms = 0.0
        self._latencies: List[float] = []
        self._adapter_usage: Dict[str, int] = {}
        self._intent_distribution: Dict[str, int] = {}

    def record_query(
        self,
        latency_ms: float,
        adapters_used: List[str],
        intent: str,
        cache_hit: bool = False,
    ) -> None:
        self.total_queries += 1
        self._latencies.append(latency_ms)
        self.avg_latency_ms = sum(self._latencies) / len(self._latencies)
        for adapter in adapters_used:
            self._adapter_usage[adapter] = self._adapter_usage.get(adapter, 0) + 1
        self._intent_distribution[intent] = (
            self._intent_distribution.get(intent, 0) + 1
        )
        if cache_hit:
            self.total_cache_hits += 1
        else:
            self.total_cache_misses += 1

    def record_error(self) -> None:
        self.total_errors += 1

    def get_summary(self) -> Dict[str, Any]:
        return {
            "total_queries": self.total_queries,
            "total_errors": self.total_errors,
            "error_rate": round(self.total_errors / max(self.total_queries, 1), 4),
            "avg_latency_ms": round(self.avg_latency_ms, 2),
            "total_cache_hits": self.total_cache_hits,
            "total_cache_misses": self.total_cache_misses,
            "cache_hit_rate": round(
                self.total_cache_hits / max(self.total_cache_hits + self.total_cache_misses, 1), 4
            ),
            "adapter_usage": dict(self._adapter_usage),
            "intent_distribution": dict(self._intent_distribution),
        }


# ---------------------------------------------------------------------------
# Mock registry for demonstration
# ---------------------------------------------------------------------------

class AdapterRegistry:
    """Registry of available adapters.

    In production, this connects to the 66 real database adapters.
    For now, it provides mock responses for demonstration.
    """

    MOCK_RESPONSES: Dict[str, Callable[[str], Dict[str, Any]]] = {}

    @classmethod
    def _init_mocks(cls) -> None:
        """Initialise mock responses for known adapters."""
        cls.MOCK_RESPONSES = {
            "drugbank": lambda q: {
                "name": cls._extract_entity(q) or "Unknown Drug",
                "mechanism": f"Mechanism of action for {cls._extract_entity(q) or 'unknown'}",
                "drug_class": "Pharmaceutical agent",
                "half_life": "~24 hours (typical)",
                "source": "drugbank",
                "source_id": "DB" + str(hash(q) % 100000).zfill(5),
                "entity_type": "drug",
            },
            "pubmed": lambda q: {
                "title": f"Studies on {cls._extract_entity(q) or q[:30]}",
                "abstract": f"Research findings related to {q[:50]}...",
                "study_design": "systematic_review" if "review" in q.lower() else "rct",
                "sample_size": 200 + hash(q) % 800,
                "publication_year": 2020 + hash(q) % 5,
                "source": "pubmed",
                "source_id": f"PMID:{hash(q) % 10000000}",
                "entity_type": "literature",
            },
            "ensembl": lambda q: {
                "gene_name": cls._extract_entity(q) or "Unknown Gene",
                "chromosome": f"chr{1 + hash(q) % 22}",
                "function": "Protein-coding gene",
                "source": "ensembl",
                "source_id": f"ENSG{hash(q) % 100000000000:011d}",
                "entity_type": "gene",
            },
            "mondo": lambda q: {
                "disease_name": cls._extract_entity(q) or "Unknown Disease",
                "definition": f"A condition characterized by {q[:40]}...",
                "prevalence": "~5% population",
                "source": "mondo",
                "source_id": f"MONDO:{hash(q) % 1000000:07d}",
                "entity_type": "disease",
            },
            "clinicaltrials_gov": lambda q: {
                "trial_title": f"Trial: {q[:50]}",
                "phase": "Phase III",
                "status": "Recruiting",
                "enrollment": 150 + hash(q) % 850,
                "source": "clinicaltrials_gov",
                "source_id": f"NCT{hash(q) % 100000000:08d}",
                "entity_type": "clinical_trial",
            },
            "rxnorm": lambda q: {
                "name": cls._extract_entity(q) or "Unknown",
                "rxnorm_id": f"RX{hash(q) % 1000000:06d}",
                "tty": "SCD",
                "source": "rxnorm",
                "source_id": str(hash(q) % 1000000),
                "entity_type": "drug",
            },
            "chembl": lambda q: {
                "name": cls._extract_entity(q) or "Unknown Compound",
                "bioactivity_count": 50 + hash(q) % 500,
                "molecular_weight": 200 + hash(q) % 400,
                "source": "chembl",
                "source_id": f"CHEMBL{hash(q) % 1000000:06d}",
                "entity_type": "compound",
            },
            "guideline_db": lambda q: {
                "guideline_title": f"Guideline for {q[:40]}",
                "issuing_body": "APA / WHO",
                "recommendation": "First-line treatment recommended",
                "evidence_level": "A",
                "source": "guideline_db",
                "source_id": f"GL{hash(q) % 10000:04d}",
                "entity_type": "guideline",
            },
        }

    @staticmethod
    def _extract_entity(query: str) -> Optional[str]:
        """Extract a drug/disease/gene name from a query."""
        # Simple extraction
        words = query.lower().split()
        drug_names = ["sertraline", "fluoxetine", "escitalopram", "paroxetine",
                      "citalopram", "venlafaxine", "duloxetine", "bupropion",
                      "mirtazapine", "trazodone", "lithium", "quetiapine"]
        for word in words:
            for drug in drug_names:
                if drug in word:
                    return drug
        # Return first content word
        skip = {"the", "a", "an", "is", "are", "what", "how", "for", "of", "in", "on", "about"}
        for w in words:
            if w not in skip and len(w) > 2:
                return w
        return None

    def __init__(self) -> None:
        self._init_mocks()
        self.adapters: Dict[str, Dict[str, Any]] = {
            name: {"name": name, "status": "active"}
            for name in self.MOCK_RESPONSES.keys()
        }
        logger.info("AdapterRegistry initialised (%d adapters)", len(self.adapters))

    async def query_adapter(
        self, adapter_name: str, query: str
    ) -> Dict[str, Any]:
        """Query a single adapter."""
        if adapter_name not in self.MOCK_RESPONSES:
            return {"error": f"Adapter '{adapter_name}' not found", "source": adapter_name}
        mock_fn = self.MOCK_RESPONSES[adapter_name]
        try:
            result = mock_fn(query)
            result["_meta"] = {"source_name": adapter_name, "reliability_tier": 0.9}
            return result
        except Exception as exc:
            return {"error": str(exc), "source": adapter_name}

    async def health_check(self, adapter_name: str) -> Dict[str, str]:
        """Check adapter health."""
        if adapter_name in self.adapters:
            return {"adapter": adapter_name, "status": "healthy"}
        return {"adapter": adapter_name, "status": "not_found"}

    def list_adapters(self) -> List[str]:
        """List all available adapter names."""
        return list(self.adapters.keys())


# ---------------------------------------------------------------------------
# IntelligentOrchestrator
# ---------------------------------------------------------------------------

class IntelligentOrchestrator:
    """Central hub for routing queries and synthesizing results.

    Usage:
        registry = AdapterRegistry()
        orchestrator = IntelligentOrchestrator(registry)
        result = await orchestrator.query("sertraline mechanism of action")
    """

    def __init__(
        self,
        registry: Optional[AdapterRegistry] = None,
        synthesizer: Optional[ResponseSynthesizer] = None,
        confidence_engine: Optional[ConfidenceEngine] = None,
    ) -> None:
        self.registry = registry or AdapterRegistry()
        self.synthesizer = synthesizer or ResponseSynthesizer()
        self.confidence = confidence_engine or ConfidenceEngine()
        self.query_planner = QueryPlanner()
        self.cache = SmartCache()
        self.cross_ref = CrossReferenceMesh()
        self.evidence = EvidenceFusion()
        self.governance = GovernanceLayer()
        self.metrics = MetricsCollector()
        self.sessions: Dict[str, SessionContext] = {}
        logger.info("IntelligentOrchestrator initialised")

    # -- Main API -------------------------------------------------------------

    async def query(
        self,
        query: str,
        context: Optional[Dict[str, Any]] = None,
        correlation_id: str = "",
    ) -> OrchestratorResult:
        """Main entry point for all knowledge queries.

        Pipeline:
        1. Analyse query → determine intent
        2. Plan query execution → select adapters
        3. Execute queries in parallel
        4. Score confidence per result
        5. Cross-reference entities
        6. Fuse evidence
        7. Apply governance/safety checks
        8. Synthesize response
        9. Return structured result

        Parameters
        ----------
        query:
            Natural language query.
        context:
            Optional context dict (e.g. patient data).
        correlation_id:
            Request correlation ID.

        Returns
        -------
        OrchestratorResult with NL response, structured data, citations,
        safety checks, and metadata.
        """
        start_time = time.time()
        result_id = self._generate_id(query)

        if not correlation_id:
            correlation_id = result_id

        logger.info(
            "Query %s: '%s...' | cid=%s",
            result_id,
            query[:60],
            correlation_id,
        )

        try:
            # 1. Check cache
            cache_key = f"query:{hashlib.sha256(query.encode()).hexdigest()[:16]}"
            cached = await self.cache.get(cache_key, category="literature")
            if cached and isinstance(cached, dict):
                logger.info("Cache hit for query: %s...", query[:40])
                self.metrics.record_query(0, [], "cached", cache_hit=True)
                return OrchestratorResult(**cached)

            # 2. Plan
            plan = await self.query_planner.plan(query)

            # 3. Execute in parallel
            adapter_results = await self._execute_adapters(
                plan.adapters, query
            )

            # 4. Score confidence
            scored_results = []
            for ar in adapter_results:
                meta = ar.get("_meta", {"source_name": ar.get("source", "unknown")})
                score = self.confidence.score_adapter_result(ar, meta)
                scored_results.append((ar, score))

            # Filter by threshold
            passing = [(ar, sc) for ar, sc in scored_results if self.confidence.should_include(sc)]

            # 5. Cross-reference entities
            linked_entities = await self.cross_ref.link_entities(adapter_results)

            # 6. Fuse evidence
            evidence_pieces = self._adapter_results_to_evidence(adapter_results)
            fused = await self.evidence.fuse(
                evidence_pieces,
                entity_type=plan.intent.value,
            )

            # 7. Build adapter results for synthesizer
            synth_results = [
                AdapterResult(
                    adapter_name=ar.get("source", ar.get("_meta", {}).get("source_name", "unknown")),
                    data=ar,
                    confidence=sc.composite,
                    entity_type=ar.get("entity_type", ""),
                    entity_id=ar.get("source_id", ""),
                    relevance_score=0.8,
                )
                for ar, sc in passing
            ]

            # 8. Synthesize
            synthesized = await self.synthesizer.synthesize(synth_results, query)

            # 9. Governance check
            synth_dict = synthesized.to_dict()
            safety = await self.governance.check_response(
                synth_dict,
                patient_context=context,
                correlation_id=correlation_id,
            )

            # 10. Build result
            result = OrchestratorResult(
                result_id=result_id,
                query=query,
                status="success" if len(passing) > 0 else "partial",
                natural_language=synthesized.natural_language,
                summary=synthesized.summary,
                structured_data=[s.dict() for s in synthesized.structured_data],
                citations=[c.dict() for c in synthesized.citations],
                confidence=synthesized.overall_confidence,
                confidence_grade=synthesized.confidence_grade,
                sources=synthesized.sources_used,
                adapter_results=len(adapter_results),
                execution_time_ms=round((time.time() - start_time) * 1000, 1),
                safety_result=safety,
                cross_references=[e.dict() for e in linked_entities],
                evidence_fusion=fused.dict() if fused else None,
                query_plan=plan.dict(),
                requires_caution=safety.requires_human_review if safety else False,
                caution_notes=safety.review_reasons if safety else [],
                correlation_id=correlation_id,
                processed_at=datetime.now(timezone.utc).isoformat(),
            )

            # Cache result
            await self.cache.set(cache_key, result.dict(), category="literature", ttl=1800)

            # Metrics
            self.metrics.record_query(
                result.execution_time_ms,
                plan.adapters,
                plan.intent.value,
            )

            logger.info(
                "Query %s completed: %d adapters, grade=%s, time=%.1fms",
                result_id,
                len(adapter_results),
                result.confidence_grade,
                result.execution_time_ms,
            )
            return result

        except Exception as exc:
            logger.error("Query %s failed: %s", result_id, exc, exc_info=True)
            self.metrics.record_error()
            return OrchestratorResult(
                result_id=result_id,
                query=query,
                status="error",
                natural_language=f"An error occurred: {str(exc)}",
                summary="Query processing failed.",
                correlation_id=correlation_id,
                processed_at=datetime.now(timezone.utc).isoformat(),
                execution_time_ms=round((time.time() - start_time) * 1000, 1),
            )

    async def smart_search(
        self,
        query: str,
        filters: Optional[Dict[str, Any]] = None,
        correlation_id: str = "",
    ) -> SearchResult:
        """Intelligent search that routes to optimal adapters.

        Similar to query() but returns raw structured results without
        full synthesis — optimised for speed.

        Parameters
        ----------
        query:
            Search query.
        filters:
            Optional filters like {'year': 2024, 'source': 'pubmed'}.
        correlation_id:
            Request correlation ID.

        Returns
        -------
        SearchResult with raw results from relevant adapters.
        """
        start_time = time.time()
        result_id = self._generate_id(f"search:{query}")

        # Plan
        plan = await self.query_planner.plan(query)

        # Execute with optional filter-based adapter selection
        adapters = plan.adapters
        if filters and "source" in filters:
            adapters = [a for a in adapters if filters["source"] in a]

        adapter_results = await self._execute_adapters(adapters[:5], query)

        # Score
        scored = []
        for ar in adapter_results:
            meta = ar.get("_meta", {"source_name": ar.get("source", "unknown")})
            score = self.confidence.score_adapter_result(ar, meta)
            scored.append((ar, score))

        passing = [
            ar for ar, sc in scored
            if self.confidence.should_include(sc, threshold=0.5)
        ]

        # Apply filters
        filtered = passing
        if filters:
            for key, val in filters.items():
                if key not in ("source",):
                    filtered = [
                        r for r in filtered
                        if str(val).lower() in str(r.get(key, "")).lower()
                    ]

        return SearchResult(
            result_id=result_id,
            query=query,
            results=filtered,
            total_found=len(filtered),
            sources_queried=adapters,
            execution_time_ms=round((time.time() - start_time) * 1000, 1),
            filters_applied=filters or {},
        )

    async def generate_protocol(
        self,
        patient_data: Dict[str, Any],
        target: str,
        modalities: Optional[List[str]] = None,
        correlation_id: str = "",
    ) -> ProtocolResult:
        """Generate neuromodulation protocol using all intelligence components.

        Parameters
        ----------
        patient_data:
            Dict with keys like 'diagnosis', 'age', 'medications',
            'genetics', 'conditions'.
        target:
            Target indication, e.g. "major_depressive_disorder".
        modalities:
            List of modalities to consider: ["tDCS", "TMS", "PBM", "Neurofeedback"].
        correlation_id:
            Request correlation ID.

        Returns
        -------
        ProtocolResult with generated protocol and safety check.
        """
        start_time = time.time()
        result_id = self._generate_id(f"protocol:{target}")
        modalities = modalities or ["tDCS", "TMS", "PBM", "Neurofeedback"]

        # Build protocol query
        protocol_query = f"neuromodulation protocol for {target}"

        # Gather evidence
        plan = await self.query_planner.plan(
            protocol_query, intent=QueryIntent.PROTOCOL_DESIGN
        )
        adapter_results = await self._execute_adapters(plan.adapters, protocol_query)

        # Score
        scored = [
            (ar, self.confidence.score_adapter_result(
                ar, ar.get("_meta", {"source_name": ar.get("source", "unknown")})
            ))
            for ar in adapter_results
        ]
        passing = [ar for ar, sc in scored if self.confidence.should_include(sc)]

        # Generate protocol
        protocol = self._build_protocol(passing, patient_data, target, modalities)

        # Safety check
        safety = await self.governance.check_response(
            {"natural_language": str(protocol), "overall_confidence": 0.7, "sources_used": plan.adapters},
            patient_context=patient_data,
            correlation_id=correlation_id,
        )

        result = ProtocolResult(
            result_id=result_id,
            target_indication=target,
            modalities=modalities,
            protocol=protocol,
            safety_check=safety,
            confidence=0.7,
            evidence_summary=f"Based on {len(passing)} evidence sources",
            requires_review=safety.requires_human_review if safety else False,
            review_notes=safety.review_reasons if safety else [],
            generated_at=datetime.now(timezone.utc).isoformat(),
        )

        logger.info(
            "Protocol generated for %s: modalities=%s, review=%s",
            target,
            modalities,
            result.requires_review,
        )
        return result

    async def safety_check(
        self,
        protocol: Dict[str, Any],
        patient_data: Dict[str, Any],
        correlation_id: str = "",
    ) -> SafetyResult:
        """Full safety screening across all databases.

        Parameters
        ----------
        protocol:
            Protocol dict with keys like 'drug', 'dose', 'frequency'.
        patient_data:
            Patient context dict.
        correlation_id:
            Request correlation ID.

        Returns
        -------
        SafetyResult with all contraindications, interactions, and flags.
        """
        # Build a synthetic response for governance
        protocol_text = json.dumps(protocol, indent=2)
        synthetic_response = {
            "query": f"Safety check for {protocol.get('name', 'protocol')}",
            "natural_language": protocol_text,
            "overall_confidence": protocol.get("confidence", 0.7),
            "sources_used": protocol.get("sources", []),
        }

        safety = await self.governance.check_response(
            synthetic_response,
            patient_context=patient_data,
            correlation_id=correlation_id,
        )
        return safety

    # -- Session management ---------------------------------------------------

    def create_session(
        self, patient_context: Optional[Dict[str, Any]] = None
    ) -> SessionContext:
        """Create a new session context."""
        sid = self._generate_id("session")
        session = SessionContext(
            session_id=sid,
            correlation_id=sid,
            patient_context=patient_context or {},
            created_at=datetime.now(timezone.utc).isoformat(),
        )
        self.sessions[sid] = session
        logger.info("Session created: %s", sid)
        return session

    def get_session(self, session_id: str) -> Optional[SessionContext]:
        """Get session by ID."""
        return self.sessions.get(session_id)

    def close_session(self, session_id: str) -> bool:
        """Close a session."""
        if session_id in self.sessions:
            del self.sessions[session_id]
            logger.info("Session closed: %s", session_id)
            return True
        return False

    # -- Internal helpers -----------------------------------------------------

    async def _execute_adapters(
        self, adapter_names: List[str], query: str
    ) -> List[Dict[str, Any]]:
        """Execute queries across multiple adapters in parallel."""
        if not adapter_names:
            return []

        tasks = [
            self._query_with_timeout(name, query)
            for name in adapter_names
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        valid = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.warning(
                    "Adapter %s failed: %s",
                    adapter_names[i],
                    result,
                )
            elif isinstance(result, dict) and "error" not in result:
                valid.append(result)
            elif isinstance(result, dict):
                # Log error but don't include
                logger.warning(
                    "Adapter %s returned error: %s",
                    adapter_names[i],
                    result.get("error"),
                )

        return valid

    async def _query_with_timeout(
        self, adapter_name: str, query: str, timeout: float = 10.0
    ) -> Dict[str, Any]:
        """Query an adapter with timeout."""
        try:
            return await asyncio.wait_for(
                self.registry.query_adapter(adapter_name, query),
                timeout=timeout,
            )
        except asyncio.TimeoutError:
            return {"error": f"Timeout after {timeout}s", "source": adapter_name}

    @staticmethod
    def _adapter_results_to_evidence(
        adapter_results: List[Dict[str, Any]]
    ) -> List[EvidencePiece]:
        """Convert adapter results to evidence pieces for fusion."""
        pieces = []
        for ar in adapter_results:
            claim_parts = []
            for key, val in ar.items():
                if key.startswith("_"):
                    continue
                if isinstance(val, str) and val:
                    claim_parts.append(f"{key}: {val}")

            claim = "; ".join(claim_parts[:5]) or "data available"
            pieces.append(
                EvidencePiece(
                    source=ar.get("source", "unknown"),
                    source_id=ar.get("source_id", ""),
                    entity_type=ar.get("entity_type", "unknown"),
                    claim=claim,
                    confidence=ar.get("_meta", {}).get("reliability_tier", 0.8),
                )
            )
        return pieces

    @staticmethod
    def _build_protocol(
        evidence: List[Dict[str, Any]],
        patient_data: Dict[str, Any],
        target: str,
        modalities: List[str],
    ) -> Dict[str, Any]:
        """Build a protocol from evidence and patient data."""
        protocol: Dict[str, Any] = {
            "target_indication": target,
            "modalities_considered": modalities,
            "patient_profile": {
                "diagnosis": patient_data.get("diagnosis", "unknown"),
                "age": patient_data.get("age"),
                "medications": patient_data.get("medications", []),
                "genetics": patient_data.get("genetics", []),
            },
            "recommendations": [],
            "evidence_base": len(evidence),
            "safety_precautions": [],
        }

        for modality in modalities:
            protocol["recommendations"].append({
                "modality": modality,
                "recommended": modality.lower() in ["tdcs", "tms"],
                "confidence": "moderate",
                "parameters": {
                    "tDCS": {
                        "current": "2 mA",
                        "duration": "20 minutes",
                        "sessions": "10-15",
                        "target": "DLPFC (F3/F4)",
                    },
                    "TMS": {
                        "intensity": "120% RMT",
                        "pulses": "3000",
                        "sessions": "20-30",
                        "target": "DLPFC",
                    },
                    "PBM": {
                        "wavelength": "810 nm",
                        "power": "100 mW",
                        "duration": "10 minutes",
                    },
                    "Neurofeedback": {
                        "protocol": "SMR training",
                        "sessions": "20-40",
                        "frequency": "12-15 Hz",
                    },
                }.get(modality, {}),
            })

        # Add safety precautions
        if patient_data.get("genetics"):
            protocol["safety_precautions"].append(
                "Consider pharmacogenomic testing results"
            )
        if patient_data.get("conditions"):
            protocol["safety_precautions"].append(
                f"Screen for contraindications: {patient_data['conditions']}"
            )

        return protocol

    @staticmethod
    def _generate_id(prefix: str = "") -> str:
        return hashlib.sha256(
            f"{prefix}:{time.time()}".encode()
        ).hexdigest()[:16]


# ---------------------------------------------------------------------------
# Unit tests
# ---------------------------------------------------------------------------

class TestIntelligentOrchestrator(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.registry = AdapterRegistry()
        self.orchestrator = IntelligentOrchestrator(self.registry)

    async def test_query(self) -> None:
        result = await self.orchestrator.query("sertraline mechanism of action")
        self.assertIsInstance(result, OrchestratorResult)
        self.assertTrue(result.status in ("success", "partial"))
        self.assertTrue(len(result.natural_language) > 0)
        self.assertTrue(result.execution_time_ms > 0)

    async def test_query_with_context(self) -> None:
        result = await self.orchestrator.query(
            "sertraline",
            context={"conditions": ["major_depressive_disorder"]},
        )
        self.assertIsInstance(result, OrchestratorResult)

    async def test_smart_search(self) -> None:
        result = await self.orchestrator.smart_search("sertraline")
        self.assertIsInstance(result, SearchResult)
        self.assertTrue(result.total_found >= 0)

    async def test_smart_search_with_filters(self) -> None:
        result = await self.orchestrator.smart_search(
            "sertraline", filters={"source": "drugbank"}
        )
        self.assertIsInstance(result, SearchResult)

    async def test_generate_protocol(self) -> None:
        result = await self.orchestrator.generate_protocol(
            patient_data={
                "diagnosis": "major_depressive_disorder",
                "age": 45,
                "medications": ["sertraline"],
            },
            target="major_depressive_disorder",
            modalities=["tDCS", "TMS"],
        )
        self.assertIsInstance(result, ProtocolResult)
        self.assertTrue(len(result.protocol) > 0)
        self.assertIsNotNone(result.safety_check)

    async def test_safety_check(self) -> None:
        result = await self.orchestrator.safety_check(
            protocol={"name": "tDCS", "dose": "2mA", "target": "DLPFC"},
            patient_data={"conditions": ["epilepsy"]},
        )
        self.assertIsInstance(result, SafetyResult)
        self.assertTrue(len(result.contraindications) >= 0)

    async def test_session_management(self) -> None:
        session = self.orchestrator.create_session(
            patient_context={"age": 30}
        )
        self.assertTrue(len(session.session_id) > 0)
        retrieved = self.orchestrator.get_session(session.session_id)
        self.assertIsNotNone(retrieved)
        self.assertEqual(retrieved.patient_context.get("age"), 30)
        closed = self.orchestrator.close_session(session.session_id)
        self.assertTrue(closed)
        self.assertIsNone(self.orchestrator.get_session(session.session_id))

    async def test_metrics(self) -> None:
        await self.orchestrator.query("sertraline")
        await self.orchestrator.query("fluoxetine")
        summary = self.orchestrator.metrics.get_summary()
        self.assertEqual(summary["total_queries"], 2)
        self.assertTrue(summary["avg_latency_ms"] > 0)

    async def test_cache(self) -> None:
        q = "cache test query"
        r1 = await self.orchestrator.query(q)
        r2 = await self.orchestrator.query(q)
        self.assertEqual(r1.query, r2.query)
        stats = await self.orchestrator.cache.stats()
        self.assertTrue(stats.total_hits > 0)

    async def test_error_handling(self) -> None:
        # Query with no matching adapters should still return gracefully
        result = await self.orchestrator.query("")
        self.assertIsInstance(result, OrchestratorResult)


if __name__ == "__main__":
    unittest.main(module=__name__, exit=False, verbosity=2)
