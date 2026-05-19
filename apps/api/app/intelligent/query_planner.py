"""
query_planner.py — Intelligent Synaps v4
==========================================
Adaptive query planning across 66 database adapters.

Determines which adapters to query, estimates costs, optimises execution
order (cheap first, expensive last), and enforces budget constraints.

Workflow:
1. Parse natural-language query → extract intent + entities
2. Map intent to adapter capabilities
3. Estimate per-adapter cost (latency, rate-limit, $)
4. Order adapters optimally respecting dependencies
5. Generate QueryPlan with budget caps
"""

from __future__ import annotations

import asyncio
import logging
import re
import unittest
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Set, Tuple

from pydantic import BaseModel, Field, validator

logger = logging.getLogger("intelligent_synaps.query_planner")

# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class QueryIntent(Enum):
    """High-level query intents the planner can recognise."""

    DRUG_LOOKUP = "drug_lookup"
    DRUG_INTERACTION = "drug_interaction"
    ADVERSE_EVENT = "adverse_event"
    CLINICAL_TRIAL_SEARCH = "clinical_trial_search"
    GENE_VARIANT = "gene_variant"
    PROTEIN_FUNCTION = "protein_function"
    PATHWAY_ANALYSIS = "pathway_analysis"
    DISEASE_PHENOTYPE = "disease_phenotype"
    GUIDELINE_LOOKUP = "guideline_lookup"
    LITERATURE_SEARCH = "literature_search"
    PROTOCOL_DESIGN = "protocol_design"
    MULTIMODAL_SYNTHESIS = "multimodal_synthesis"
    UNKNOWN = "unknown"


class AdapterCategory(Enum):
    """Adapter categories for cost estimation."""

    DRUG = "drug"
    CLINICAL_TRIAL = "clinical_trial"
    GENOMIC = "genomic"
    LITERATURE = "literature"
    GUIDELINE = "guideline"
    ADVERSE_EVENT = "adverse_event"
    PROTEIN = "protein"
    PATHWAY = "pathway"
    PHENOTYPE = "phenotype"
    ONTOLOGY = "ontology"
    GENERAL = "general"


class CostTier(Enum):
    """Cost tiers for adapter queries."""

    FREE = 0
    CHEAP = 1
    MODERATE = 2
    EXPENSIVE = 3
    PREMIUM = 4


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class AdapterCapability(BaseModel):
    """Capabilities advertised by a single adapter."""

    name: str
    category: str
    intents: List[str] = Field(default_factory=list)
    entity_types: List[str] = Field(default_factory=list)
    cost_tier: str = "CHEAP"
    avg_latency_ms: float = 500.0
    rate_limit_rps: float = 10.0
    supports_async: bool = True
    requires_auth: bool = False
    dependencies: List[str] = Field(default_factory=list)
    description: str = ""


class CostEstimate(BaseModel):
    """Estimated cost for a single adapter query."""

    adapter: str
    latency_ms: float
    rate_limit_cost: float  # fraction of quota consumed
    monetary_cost_usd: float = 0.0
    tier: str
    confidence: float = 0.8  # how confident we are in this estimate

    @property
    def composite_cost(self) -> float:
        """Single composite cost score (higher = more expensive)."""
        # Normalise and weight
        lat_score = min(self.latency_ms / 5000.0, 1.0) * 0.35
        rl_score = min(self.rate_limit_cost * 10, 1.0) * 0.35
        money_score = min(self.monetary_cost_usd * 100, 1.0) * 0.30
        return round(lat_score + rl_score + money_score, 4)


class BudgetConstraint(BaseModel):
    """Budget constraints for query execution."""

    max_adapters: int = 10
    max_total_latency_ms: float = 15_000.0
    max_rate_limit_fraction: float = 0.5
    max_monetary_cost_usd: float = 5.0
    min_confidence_threshold: float = 0.6


class PlannedQuery(BaseModel):
    """A single planned adapter query."""

    adapter: str
    query: str
    cost: CostEstimate
    priority: int = 5  # 1 = highest
    depends_on: List[str] = Field(default_factory=list)
    estimated_rows: int = 10
    intent: str = ""


class QueryPlan(BaseModel):
    """Complete execution plan for a user query."""

    original_query: str
    intent: QueryIntent
    entities: List[str] = Field(default_factory=list)
    adapters: List[str] = Field(default_factory=list)
    planned_queries: List[PlannedQuery] = Field(default_factory=list)
    execution_order: List[str] = Field(default_factory=list)
    budget: BudgetConstraint
    estimated_total_latency_ms: float = 0.0
    estimated_total_cost_usd: float = 0.0
    strategy: str = "parallel"
    fallback_adapters: List[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Intent → adapter mapping
# ---------------------------------------------------------------------------

INTENT_ADAPTERS: Dict[QueryIntent, List[str]] = {
    QueryIntent.DRUG_LOOKUP: [
        "drugbank", "rxnorm", "chembl", "pubchem", "pharmgkb",
    ],
    QueryIntent.DRUG_INTERACTION: [
        "drugbank", "pharmgkb", "drug_interaction_checker", "kegg_drug",
    ],
    QueryIntent.ADVERSE_EVENT: [
        "fda_faers", "sider", "offsides", "twosides", "vigiaccess",
    ],
    QueryIntent.CLINICAL_TRIAL_SEARCH: [
        "clinicaltrials_gov", "eu_ctr", "who_ictrp", "pubmed",
    ],
    QueryIntent.GENE_VARIANT: [
        "ensembl", "clinvar", "gnomad", "dbsnp", "pharmgkb",
    ],
    QueryIntent.PROTEIN_FUNCTION: [
        "uniprot", "interpro", "pfam", "string_db",
    ],
    QueryIntent.PATHWAY_ANALYSIS: [
        "kegg", "reactome", "wikipathways", "biocyc",
    ],
    QueryIntent.DISEASE_PHENOTYPE: [
        "mondo", "hpo", "doid", "omim", "orphanet",
    ],
    QueryIntent.GUIDELINE_LOOKUP: [
        "nice_guidelines", "who_guidelines", "apa_guidelines", "guideline_db",
    ],
    QueryIntent.LITERATURE_SEARCH: [
        "pubmed", "google_scholar", "semantic_scholar", "europepmc",
    ],
    QueryIntent.PROTOCOL_DESIGN: [
        "protocol_db", "pubmed", "clinicaltrials_gov", "guideline_db",
    ],
    QueryIntent.MULTIMODAL_SYNTHESIS: [
        "pubmed", "drugbank", "ensembl", "clinvar", "mondo",
    ],
    QueryIntent.UNKNOWN: [
        "pubmed", "drugbank", "mondo", "uniprot",
    ],
}

# Adapter metadata (name → capabilities)
ADAPTER_REGISTRY: Dict[str, AdapterCapability] = {
    "drugbank": AdapterCapability(
        name="drugbank",
        category="drug",
        intents=["drug_lookup", "drug_interaction"],
        entity_types=["drug", "compound"],
        cost_tier="MODERATE",
        avg_latency_ms=800.0,
        rate_limit_rps=5.0,
        description="Comprehensive drug and drug target database",
    ),
    "rxnorm": AdapterCapability(
        name="rxnorm",
        category="drug",
        intents=["drug_lookup"],
        entity_types=["drug"],
        cost_tier="FREE",
        avg_latency_ms=200.0,
        rate_limit_rps=20.0,
        description="Normalized drug nomenclature from NLM",
    ),
    "chembl": AdapterCapability(
        name="chembl",
        category="drug",
        intents=["drug_lookup"],
        entity_types=["compound", "bioactivity"],
        cost_tier="FREE",
        avg_latency_ms=600.0,
        rate_limit_rps=10.0,
        description="Bioactivity data for drug-like compounds",
    ),
    "pubchem": AdapterCapability(
        name="pubchem",
        category="drug",
        intents=["drug_lookup"],
        entity_types=["compound", "substance"],
        cost_tier="FREE",
        avg_latency_ms=500.0,
        rate_limit_rps=5.0,
        description="Chemical information from NCBI",
    ),
    "pharmgkb": AdapterCapability(
        name="pharmgkb",
        category="drug",
        intents=["drug_lookup", "drug_interaction", "gene_variant"],
        entity_types=["drug", "gene", "variant"],
        cost_tier="MODERATE",
        avg_latency_ms=700.0,
        rate_limit_rps=5.0,
        description="Pharmacogenomics knowledge base",
    ),
    "pubmed": AdapterCapability(
        name="pubmed",
        category="literature",
        intents=["literature_search", "clinical_trial_search", "protocol_design"],
        entity_types=["publication", "abstract"],
        cost_tier="FREE",
        avg_latency_ms=1200.0,
        rate_limit_rps=3.0,
        description="Biomedical literature from NCBI",
    ),
    "clinicaltrials_gov": AdapterCapability(
        name="clinicaltrials_gov",
        category="clinical_trial",
        intents=["clinical_trial_search", "protocol_design"],
        entity_types=["clinical_trial"],
        cost_tier="FREE",
        avg_latency_ms=1500.0,
        rate_limit_rps=2.0,
        description="Clinical trial registry",
    ),
    "ensembl": AdapterCapability(
        name="ensembl",
        category="genomic",
        intents=["gene_variant"],
        entity_types=["gene", "transcript", "variant"],
        cost_tier="FREE",
        avg_latency_ms=600.0,
        rate_limit_rps=15.0,
        description="Genome annotation database",
    ),
    "clinvar": AdapterCapability(
        name="clinvar",
        category="genomic",
        intents=["gene_variant"],
        entity_types=["variant", "disease"],
        cost_tier="FREE",
        avg_latency_ms=800.0,
        rate_limit_rps=3.0,
        description="Clinical variant interpretations",
    ),
    "mondo": AdapterCapability(
        name="mondo",
        category="phenotype",
        intents=["disease_phenotype"],
        entity_types=["disease"],
        cost_tier="FREE",
        avg_latency_ms=300.0,
        rate_limit_rps=20.0,
        description="Disease ontology",
    ),
    "uniprot": AdapterCapability(
        name="uniprot",
        category="protein",
        intents=["protein_function"],
        entity_types=["protein"],
        cost_tier="FREE",
        avg_latency_ms=500.0,
        rate_limit_rps=10.0,
        description="Protein sequence and function",
    ),
}

# Cost tier → base cost mapping
TIER_LATENCY_MS: Dict[str, float] = {
    "FREE": 300.0,
    "CHEAP": 500.0,
    "MODERATE": 1000.0,
    "EXPENSIVE": 2500.0,
    "PREMIUM": 5000.0,
}

TIER_RATE_LIMIT_FACTOR: Dict[str, float] = {
    "FREE": 0.02,
    "CHEAP": 0.05,
    "MODERATE": 0.10,
    "EXPENSIVE": 0.20,
    "PREMIUM": 0.30,
}


# ---------------------------------------------------------------------------
# QueryPlanner
# ---------------------------------------------------------------------------

class QueryPlanner:
    """Plans optimal query execution across adapters.

    Usage:
        planner = QueryPlanner()
        plan = await planner.plan("sertraline mechanism of action")
        for adapter_name in plan.execution_order:
            ...  # execute queries in this order
    """

    # Intent detection patterns
    INTENT_PATTERNS: List[Tuple[QueryIntent, List[str]]] = [
        (QueryIntent.DRUG_INTERACTION, [
            "interaction", "interact", "combine", "contraindicated",
            "co-administration", "drug-drug",
        ]),
        (QueryIntent.DRUG_LOOKUP, [
            "drug", "medication", "pharmaceutical", "sertraline", "fluoxetine",
            "dose", "dosage", "administration", "pharmacokinetic",
        ]),
        (QueryIntent.ADVERSE_EVENT, [
            "side effect", "adverse", "toxicity", "safety", "risk",
            "contraindication", "warning",
        ]),
        (QueryIntent.CLINICAL_TRIAL_SEARCH, [
            "clinical trial", "trial", "study", "phase", "efficacy",
            "randomized", "rct",
        ]),
        (QueryIntent.GENE_VARIANT, [
            "gene", "variant", "snp", "mutation", "genotype", "allele",
            "polymorphism", "cyp2d6", "cyp2c19",
        ]),
        (QueryIntent.PROTEIN_FUNCTION, [
            "protein", "enzyme", "receptor", "transporter", "kinase",
        ]),
        (QueryIntent.PATHWAY_ANALYSIS, [
            "pathway", "signaling", "cascade", "metabolism", "network",
        ]),
        (QueryIntent.DISEASE_PHENOTYPE, [
            "disease", "disorder", "syndrome", "phenotype", "diagnosis",
            "mdd", "depression", "anxiety", "bipolar",
        ]),
        (QueryIntent.GUIDELINE_LOOKUP, [
            "guideline", "recommendation", "consensus", "standard",
        ]),
        (QueryIntent.PROTOCOL_DESIGN, [
            "protocol", "treatment", "neuromodulation", "tdcs", "tms",
            "neurofeedback", "pbm", "protocol_design",
        ]),
        (QueryIntent.LITERATURE_SEARCH, [
            "literature", "paper", "article", "review", "meta-analysis",
            "systematic review",
        ]),
    ]

    def __init__(
        self,
        adapter_registry: Optional[Dict[str, AdapterCapability]] = None,
        default_budget: Optional[BudgetConstraint] = None,
    ) -> None:
        self.adapters = adapter_registry or dict(ADAPTER_REGISTRY)
        self.default_budget = default_budget or BudgetConstraint()
        self._plan_history: List[QueryPlan] = []
        logger.info("QueryPlanner initialised (%d adapters)", len(self.adapters))

    # -- Main API -------------------------------------------------------------

    async def plan(
        self,
        query: str,
        intent: Optional[QueryIntent] = None,
        budget: Optional[BudgetConstraint] = None,
        context: Optional[Dict[str, Any]] = None,
    ) -> QueryPlan:
        """Plan optimal query execution.

        Parameters
        ----------
        query:
            Natural language query string.
        intent:
            Optional pre-detected intent. If None, intent is inferred
            from the query text.
        budget:
            Optional budget constraints. Uses defaults if None.
        context:
            Optional context dict with keys like 'patient_age',
            'preferred_language', etc.

        Returns
        -------
        QueryPlan with ordered adapter list and per-adapter cost estimates.
        """
        effective_budget = budget or self.default_budget

        # 1. Detect intent
        detected_intent = intent or self._detect_intent(query)

        # 2. Extract entities
        entities = self._extract_entities(query)

        # 3. Select adapters
        candidate_adapters = self._select_adapters(detected_intent, entities)

        # 4. Estimate costs
        planned_queries = [
            PlannedQuery(
                adapter=adapter_name,
                query=query,
                cost=self.estimate_cost(adapter_name, query),
                priority=self._priority_for(adapter_name, detected_intent),
                intent=detected_intent.value,
            )
            for adapter_name in candidate_adapters
            if adapter_name in self.adapters
        ]

        # 5. Apply budget constraints
        planned_queries = self._apply_budget(
            planned_queries, effective_budget
        )

        # 6. Optimise order
        execution_order = self.optimize_order(
            [pq.adapter for pq in planned_queries]
        )

        # 7. Calculate totals
        total_latency = sum(pq.cost.latency_ms for pq in planned_queries)
        total_cost = sum(pq.cost.monetary_cost_usd for pq in planned_queries)

        # 8. Determine strategy
        strategy = (
            "sequential"
            if total_latency > effective_budget.max_total_latency_ms / 2
            else "parallel"
        )

        plan = QueryPlan(
            original_query=query,
            intent=detected_intent,
            entities=entities,
            adapters=[pq.adapter for pq in planned_queries],
            planned_queries=planned_queries,
            execution_order=execution_order,
            budget=effective_budget,
            estimated_total_latency_ms=round(total_latency, 1),
            estimated_total_cost_usd=round(total_cost, 4),
            strategy=strategy,
            fallback_adapters=self._fallback_adapters(detected_intent),
        )

        self._plan_history.append(plan)
        logger.info(
            "Plan for '%s...': intent=%s, adapters=%d, est_latency=%.0fms",
            query[:40],
            detected_intent.value,
            len(plan.adapters),
            total_latency,
        )
        return plan

    def estimate_cost(self, adapter: str, query: str) -> CostEstimate:
        """Estimate query cost for a given adapter.

        Parameters
        ----------
        adapter:
            Adapter name.
        query:
            Query string (length may affect cost).

        Returns
        -------
        CostEstimate with latency, rate-limit, and monetary estimates.
        """
        meta = self.adapters.get(adapter)
        if meta is None:
            return CostEstimate(
                adapter=adapter,
                latency_ms=1000.0,
                rate_limit_cost=0.1,
                tier="UNKNOWN",
                confidence=0.3,
            )

        base_latency = TIER_LATENCY_MS.get(meta.cost_tier, 500.0)
        # Adjust for query length (longer = more data)
        length_factor = 1.0 + (len(query) / 500.0) * 0.3
        latency = base_latency * length_factor

        rate_cost = TIER_RATE_LIMIT_FACTOR.get(meta.cost_tier, 0.05)

        # Monetary cost (mainly for premium APIs)
        monetary = 0.0
        if meta.cost_tier == "PREMIUM":
            monetary = 0.05
        elif meta.cost_tier == "EXPENSIVE":
            monetary = 0.01

        return CostEstimate(
            adapter=adapter,
            latency_ms=round(latency, 1),
            rate_limit_cost=round(rate_cost, 4),
            monetary_cost_usd=round(monetary, 4),
            tier=meta.cost_tier,
            confidence=0.8,
        )

    def optimize_order(self, adapters: List[str]) -> List[str]:
        """Order adapters: cheap first, expensive last, dependencies respected.

        Uses a topological sort that prioritises by cost tier.
        """
        if not adapters:
            return []

        # Build dependency graph
        in_degree: Dict[str, int] = {a: 0 for a in adapters}
        adj: Dict[str, List[str]] = {a: [] for a in adapters}

        for adapter_name in adapters:
            meta = self.adapters.get(adapter_name)
            if not meta:
                continue
            for dep in meta.dependencies:
                if dep in adapters and dep != adapter_name:
                    adj[dep].append(adapter_name)
                    in_degree[adapter_name] = in_degree.get(adapter_name, 0) + 1

        # Cost-based priority: lower cost first
        def cost_rank(a: str) -> float:
            meta = self.adapters.get(a)
            if not meta:
                return 999.0
            return TIER_LATENCY_MS.get(meta.cost_tier, 500.0)

        # Kahn's algorithm with cost priority
        queue = sorted(
            [a for a in adapters if in_degree[a] == 0],
            key=cost_rank,
        )
        order: List[str] = []
        visited = set()

        while queue:
            current = queue.pop(0)
            if current in visited:
                continue
            visited.add(current)
            order.append(current)

            for neighbor in adj.get(current, []):
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0 and neighbor not in visited:
                    # Insert sorted by cost
                    rank = cost_rank(neighbor)
                    inserted = False
                    for i, existing in enumerate(queue):
                        if cost_rank(existing) > rank:
                            queue.insert(i, neighbor)
                            inserted = True
                            break
                    if not inserted:
                        queue.append(neighbor)

        # Append any that weren't reached (cycle safety)
        for a in adapters:
            if a not in visited:
                order.append(a)

        return order

    # -- Internal helpers -----------------------------------------------------

    def _detect_intent(self, query: str) -> QueryIntent:
        """Detect query intent from text using keyword matching."""
        q_lower = query.lower()
        scores: Dict[QueryIntent, int] = {}
        for intent, keywords in self.INTENT_PATTERNS:
            score = sum(1 for kw in keywords if kw.lower() in q_lower)
            if score > 0:
                scores[intent] = score

        if not scores:
            return QueryIntent.UNKNOWN

        best = max(scores, key=scores.get)  # type: ignore[arg-type]
        logger.debug("Intent detected: %s (score=%d)", best.value, scores[best])
        return best

    def _extract_entities(self, query: str) -> List[str]:
        """Extract potential entity names from query.

        Uses a simple regex-based approach. In production, this would
        use a named-entity recognition model.
        """
        entities: List[str] = []
        # Capitalised words or words in quotes
        quoted = re.findall(r'"([^"]+)"', query)
        entities.extend(quoted)
        # Potential drug names (capitals + lowercase)
        druglike = re.findall(r'\b[A-Z][a-z]+(?:\s+[a-z]+){0,2}\b', query)
        entities.extend(druglike)
        # Genes (e.g., CYP2D6, BDNF)
        genes = re.findall(r'\b[A-Z]{2,6}\d+[A-Z]*\b', query)
        entities.extend(genes)
        # Deduplicate preserving order
        seen: Set[str] = set()
        unique = []
        for e in entities:
            el = e.lower()
            if el not in seen and len(el) > 2:
                seen.add(el)
                unique.append(e)
        return unique

    def _select_adapters(
        self, intent: QueryIntent, entities: List[str]
    ) -> List[str]:
        """Select candidate adapters for the intent."""
        candidates = INTENT_ADAPTERS.get(intent, INTENT_ADAPTERS[QueryIntent.UNKNOWN])
        # Filter to registered adapters
        registered = [a for a in candidates if a in self.adapters]
        if not registered:
            # Fallback to general adapters
            registered = [a for a in INTENT_ADAPTERS[QueryIntent.UNKNOWN] if a in self.adapters]
        return registered

    def _priority_for(
        self, adapter_name: str, intent: QueryIntent
    ) -> int:
        """Assign priority (1=highest) based on adapter relevance."""
        meta = self.adapters.get(adapter_name)
        if not meta:
            return 5
        if intent.value in meta.intents:
            return 1
        if any(i in meta.intents for i in ["literature_search"]):
            return 3
        return 5

    def _apply_budget(
        self,
        queries: List[PlannedQuery],
        budget: BudgetConstraint,
    ) -> List[PlannedQuery]:
        """Filter planned queries to fit within budget."""
        # Sort by priority then cost
        sorted_queries = sorted(
            queries,
            key=lambda q: (q.priority, q.cost.composite_cost),
        )

        selected: List[PlannedQuery] = []
        total_latency = 0.0
        total_rate = 0.0
        total_money = 0.0

        for pq in sorted_queries:
            if len(selected) >= budget.max_adapters:
                break
            new_latency = total_latency + pq.cost.latency_ms
            new_rate = total_rate + pq.cost.rate_limit_cost
            new_money = total_money + pq.cost.monetary_cost_usd

            if new_latency > budget.max_total_latency_ms:
                continue
            if new_rate > budget.max_rate_limit_fraction:
                continue
            if new_money > budget.max_monetary_cost_usd:
                continue

            selected.append(pq)
            total_latency = new_latency
            total_rate = new_rate
            total_money = new_money

        # Re-sort selected by priority
        selected.sort(key=lambda q: q.priority)
        return selected

    def _fallback_adapters(self, intent: QueryIntent) -> List[str]:
        """Get fallback adapters if primary ones fail."""
        all_candidates = INTENT_ADAPTERS.get(
            intent, INTENT_ADAPTERS[QueryIntent.UNKNOWN]
        )
        # Return general-purpose adapters as fallback
        fallbacks = [a for a in INTENT_ADAPTERS[QueryIntent.UNKNOWN] if a in self.adapters]
        return [a for a in fallbacks if a not in all_candidates]

    def get_history(self) -> List[QueryPlan]:
        """Return history of generated plans."""
        return list(self._plan_history)

    def clear_history(self) -> None:
        """Clear plan history."""
        self._plan_history.clear()


# ---------------------------------------------------------------------------
# Unit tests
# ---------------------------------------------------------------------------

class TestQueryPlanner(unittest.IsolatedAsyncioTestCase):
    async def test_detect_intent_drug(self) -> None:
        planner = QueryPlanner()
        intent = planner._detect_intent("sertraline dosage for depression")
        self.assertEqual(intent, QueryIntent.DRUG_LOOKUP)

    async def test_detect_intent_interaction(self) -> None:
        planner = QueryPlanner()
        intent = planner._detect_intent("sertraline interaction with warfarin")
        self.assertEqual(intent, QueryIntent.DRUG_INTERACTION)

    async def test_detect_intent_gene(self) -> None:
        planner = QueryPlanner()
        intent = planner._detect_intent("CYP2D6 polymorphism")
        self.assertEqual(intent, QueryIntent.GENE_VARIANT)

    async def test_detect_intent_unknown(self) -> None:
        planner = QueryPlanner()
        intent = planner._detect_intent("the weather today")
        self.assertEqual(intent, QueryIntent.UNKNOWN)

    async def test_extract_entities(self) -> None:
        planner = QueryPlanner()
        entities = planner._extract_entities(
            'What is the dosage of "Sertraline" for MDD patients with CYP2D6 poor metabolism?'
        )
        self.assertTrue(any("Sertraline" in e for e in entities))
        self.assertTrue(any("CYP2D6" in e for e in entities))

    async def test_estimate_cost(self) -> None:
        planner = QueryPlanner()
        cost = planner.estimate_cost("drugbank", "sertraline")
        self.assertTrue(cost.latency_ms > 0)
        self.assertTrue(cost.rate_limit_cost > 0)
        self.assertEqual(cost.tier, "MODERATE")

    async def test_estimate_cost_unknown(self) -> None:
        planner = QueryPlanner()
        cost = planner.estimate_cost("nonexistent", "query")
        self.assertEqual(cost.tier, "UNKNOWN")
        self.assertTrue(cost.confidence < 0.5)

    async def test_plan_basic(self) -> None:
        planner = QueryPlanner()
        plan = await planner.plan("sertraline mechanism of action")
        self.assertIsInstance(plan, QueryPlan)
        self.assertTrue(len(plan.adapters) > 0)
        self.assertEqual(plan.intent, QueryIntent.DRUG_LOOKUP)

    async def test_plan_with_budget(self) -> None:
        planner = QueryPlanner()
        budget = BudgetConstraint(max_adapters=2, max_total_latency_ms=2000)
        plan = await planner.plan("sertraline mechanism of action", budget=budget)
        self.assertTrue(len(plan.adapters) <= 2)
        self.assertTrue(plan.estimated_total_latency_ms <= 2000)

    async def test_plan_with_explicit_intent(self) -> None:
        planner = QueryPlanner()
        plan = await planner.plan(
            "some query", intent=QueryIntent.GENE_VARIANT
        )
        self.assertEqual(plan.intent, QueryIntent.GENE_VARIANT)

    async def test_optimize_order(self) -> None:
        planner = QueryPlanner()
        adapters = ["pubmed", "drugbank", "rxnorm"]
        order = planner.optimize_order(adapters)
        # rxnorm should be first (FREE tier, lowest latency)
        self.assertEqual(order[0], "rxnorm")

    async def test_fallback_adapters(self) -> None:
        planner = QueryPlanner()
        fallbacks = planner._fallback_adapters(QueryIntent.DRUG_LOOKUP)
        self.assertIsInstance(fallbacks, list)

    async def test_plan_strategy(self) -> None:
        planner = QueryPlanner()
        plan = await planner.plan("sertraline")
        self.assertIn(plan.strategy, ["parallel", "sequential"])

    async def test_history(self) -> None:
        planner = QueryPlanner()
        await planner.plan("query1")
        await planner.plan("query2")
        history = planner.get_history()
        self.assertEqual(len(history), 2)
        planner.clear_history()
        self.assertEqual(len(planner.get_history()), 0)

    async def test_cost_estimate_composite(self) -> None:
        ce = CostEstimate(
            adapter="test", latency_ms=5000, rate_limit_cost=0.1,
            monetary_cost_usd=0.05, tier="MODERATE",
        )
        self.assertTrue(0.0 <= ce.composite_cost <= 1.0)


if __name__ == "__main__":
    unittest.main(module=__name__, exit=False, verbosity=2)
