# Hermes-OpenClaw Integration Plan for Clinical AI Systems
## A Comprehensive Research Report on Governed Multi-Agent Orchestration for Healthcare

**Version:** 1.0  
**Date:** January 2025  
**Classification:** Technical Research & Architecture Design  
**Target Domain:** Clinical AI / Healthcare Technology  
**Document Type:** Integration Specification with Implementation Guidance  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Hermes-Style Agent Routing](#2-hermes-style-agent-routing)
3. [OpenClaw Agent Gateway](#3-openclaw-agent-gateway)
4. [Telegram Integration](#4-telegram-integration)
5. [Tool Manifest System](#5-tool-manifest-system)
6. [Human Approval Workflows](#6-human-approval-workflows)
7. [Agent Memory & Profiles](#7-agent-memory--profiles)
8. [Governance Bridge](#8-governance-bridge)
9. [Implementation Architecture](#9-implementation-architecture)
10. [Code Examples & Reference Implementations](#10-code-examples--reference-implementations)
11. [Compliance, Security & Governance](#11-compliance-security--governance)
12. [Implementation Roadmap & Milestones](#12-implementation-roadmap--milestones)
13. [Appendices](#13-appendices)

---

## 1. Executive Summary

### 1.1 Overview

This report presents a comprehensive integration plan for combining **Hermes** (an agent routing, orchestration, and memory management framework) with **OpenClaw** (a governed agent gateway with tool execution control) to create a robust, compliant, and scalable clinical AI system. The architecture is designed specifically for healthcare environments where patient safety, data privacy, regulatory compliance, and human oversight are non-negotiable requirements.

### 1.2 Key Objectives

| Objective | Priority | Description |
|-----------|----------|-------------|
| Multi-Agent Orchestration | Critical | Route clinical requests to specialized AI agents based on intent, context, and patient needs |
| Governed Tool Access | Critical | Every tool invocation requires permission checks, audit logging, and optional human approval |
| Human-in-the-Loop | Critical | Clinicians retain final authority over all clinical decisions and tool executions |
| Regulatory Compliance | Critical | Full HIPAA, GDPR, and clinical governance compliance with audit trails |
| Real-Time Communication | High | Telegram bot integration for immediate clinical alerts and approvals |
| Memory & Context | High | Persistent, privacy-preserving memory across conversations and sessions |
| Scalability | Medium | Support multiple clinics, departments, and agent types simultaneously |

### 1.3 Architecture at a Glance

```
+------------------------------------------------------------------+
|                        TELEGRAM BOT LAYER                         |
|  (Webhook/Polling --> Message Router --> Intent Classifier)      |
+----------------------------+-------------------------------------+
                             |
+---------------------------v--------------------------------------+
|                     HERMES ORCHESTRATION CORE                     |
|  +-------------+  +-------------+  +-------------------------+  |
|  |   Router    |  |  Dispatcher |  |   Memory Manager        |  |
|  |  (Intent)   |  |  (Context)  |  |  (Short/Long/Clinic)    |  |
|  +-------------+  +-------------+  +-------------------------+  |
|  +-------------+  +-------------+  +-------------------------+  |
|  |   Profile   |  |   Session   |  |   Cross-Agent Context   |  |
|  |   Registry  |  |   Manager   |  |   Sharing Bus           |  |
|  +-------------+  +-------------+  +-------------------------+  |
+----------------------------+-------------------------------------+
                             |
+---------------------------v--------------------------------------+
|                     OPENCLAW AGENT GATEWAY                        |
|  +-------------+  +-------------+  +-------------------------+  |
|  |   Tool      |  | Permission  |  |   Human Approval        |  |
|  |   Manifest  |  |   Engine    |  |   Workflow Manager      |  |
|  +-------------+  +-------------+  +-------------------------+  |
|  +-------------+  +-------------+  +-------------------------+  |
|  |  Execution  |  |    Audit    |  |   Rate Limiter /        |  |
|  |  Sandbox    |  |    Logger   |  |   Circuit Breaker       |  |
|  +-------------+  +-------------+  +-------------------------+  |
+----------------------------+-------------------------------------+
                             |
+---------------------------v--------------------------------------+
|                     GOVERNANCE BRIDGE                             |
|  +-------------+  +-------------+  +-------------------------+  |
|  | Role-to-Perm|  | Clinic Scope|  |   Consent Verification  |  |
|  |   Mapping   |  |   Isolation |  |   & Access Logging      |  |
|  +-------------+  +-------------+  +-------------------------+  |
+---------------------+-------------------------------------------+
                      |
+---------------------v-------------------------------------------+
|                   BACKEND SERVICES                                |
|  +-------------+  +-------------+  +-------------------------+  |
|  |  EHR/EMR    |  | Scheduling  |  |   Lab Results /         |  |
|  |   APIs      |  |    APIs     |  |   Clinical Data         |  |
|  +-------------+  +-------------+  +-------------------------+  |
+------------------------------------------------------------------+
```

### 1.4 Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Bot Interface | python-telegram-bot / aiogram | Telegram integration |
| Orchestration | Custom (Hermes-inspired) | Agent routing, profiles, memory |
| Gateway | Custom (OpenClaw-inspired) | Tool governance, approvals, audit |
| Message Queue | Redis / RabbitMQ | Async communication, events |
| Persistence | PostgreSQL + Redis | Structured data + cache/session |
| Event Store | PostgreSQL (append-only) | Audit log, event sourcing |
| WebSocket | FastAPI WebSocket | Real-time approvals |
| Sandbox | Docker / gVisor | Tool execution isolation |
| LLM Backend | OpenAI / Claude / Local | Agent reasoning engine |

---

## 2. Hermes-Style Agent Routing

### 2.1 Design Philosophy

Hermes (inspired by the Greek messenger god) serves as the intelligent routing and orchestration layer for the clinical AI system. Its core design principles are:

1. **Intent-Driven Dispatch**: Every incoming request is analyzed for intent and routed to the most appropriate specialized agent
2. **Context Preservation**: Conversation context, patient history, and clinic protocols are preserved across interactions
3. **Agent Specialization**: Agents are specialized by clinical domain (scheduling, triage, results, admin)
4. **Failover & Recovery**: Built-in fallback mechanisms when agents are unavailable or confidence is low
5. **Human Escalation**: Automatic escalation to human clinicians when uncertainty exceeds thresholds

### 2.2 Agent Profile Registry

The Agent Profile Registry is a centralized, queryable catalog of all available agents in the system.

#### Architecture

```
+------------------------------------------------------------------+
|                    AGENT PROFILE REGISTRY                         |
|                                                                   |
|  +------------------+  +------------------+  +-----------------+ |
|  |  Agent Profile   |  |  Capability Map  |  |  Health Monitor | |
|  |  Database        |  |  (Intent->Agent) |  |  (Status/Load)  | |
|  +------------------+  +------------------+  +-----------------+ |
|                                                                   |
|  Agent Profile Structure:                                         |
|  {                                                                |
|    id: "scheduling-agent-v2",                                     |
|    name: "Appointment Scheduler",                                 |
|    version: "2.1.0",                                              |
|    domain: "scheduling",                                          |
|    capabilities: ["book_appointment", "cancel_appointment",       |
|                   "reschedule", "check_availability"],            |
|    intents: ["schedule", "booking", "appointment", "calendar"],   |
|    required_context: ["patient_id", "clinic_id"],                 |
|    confidence_threshold: 0.75,                                    |
|    max_concurrent_sessions: 50,                                   |
|    fallback_agent: "general-triage-agent",                        |
|    human_escalation_threshold: 0.60,                              |
|    tools: ["appointments.book", "appointments.cancel",            |
|           "appointments.reschedule", "appointments.query"],       |
|    clinic_scopes: ["clinic-001", "clinic-002"],                   |
|    role_restrictions: ["clinician", "admin", "receptionist"],     |
|    memory_enabled: true,                                          |
|    response_templates: {...},                                     |
|    sla_ms: 5000,                                                  |
|    tags: ["production", "scheduling", "patient-facing"]           |
|  }                                                                |
+------------------------------------------------------------------+
```

#### Implementation

```python
# agent_profile_registry.py
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Set
from enum import Enum
import json
import hashlib
from datetime import datetime

class AgentStatus(Enum):
    ACTIVE = "active"
    DEGRADED = "degraded"
    MAINTENANCE = "maintenance"
    OFFLINE = "offline"
    DEPRECATED = "deprecated"

@dataclass
class AgentCapability:
    """A single capability that an agent can perform."""
    name: str
    description: str
    required_parameters: List[str] = field(default_factory=list)
    optional_parameters: List[str] = field(default_factory=list)
    confidence_weight: float = 1.0
    examples: List[str] = field(default_factory=list)

@dataclass
class AgentProfile:
    """Complete profile for a clinical AI agent."""
    id: str
    name: str
    version: str
    domain: str
    description: str
    capabilities: List[AgentCapability]
    intents: List[str]  # Natural language intents this agent handles
    required_context: List[str]
    confidence_threshold: float = 0.75
    human_escalation_threshold: float = 0.60
    max_concurrent_sessions: int = 50
    current_sessions: int = 0
    fallback_agent_id: Optional[str] = None
    tool_ids: List[str] = field(default_factory=list)
    clinic_scopes: List[str] = field(default_factory=list)
    role_restrictions: List[str] = field(default_factory=list)
    memory_enabled: bool = True
    memory_types: List[str] = field(default_factory=lambda: ["short_term"])
    status: AgentStatus = AgentStatus.ACTIVE
    sla_ms: int = 5000
    tags: List[str] = field(default_factory=list)
    metadata: Dict = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)

    @property
    def is_available(self) -> bool:
        return (
            self.status == AgentStatus.ACTIVE
            and self.current_sessions < self.max_concurrent_sessions
        )

    @property
    def session_utilization(self) -> float:
        return self.current_sessions / self.max_concurrent_sessions

    @property
    def fingerprint(self) -> str:
        """Generate a unique fingerprint for cache invalidation."""
        data = f"{self.id}:{self.version}:{self.updated_at.isoformat()}"
        return hashlib.sha256(data.encode()).hexdigest()[:16]


class AgentProfileRegistry:
    """
    Central registry for all agent profiles in the clinical AI system.
    Supports CRUD operations, intent-based lookup, and health monitoring.
    """

    def __init__(self, storage_backend, cache_backend=None):
        self._profiles: Dict[str, AgentProfile] = {}
        self._intent_index: Dict[str, List[str]] = {}  # intent -> agent_ids
        self._domain_index: Dict[str, List[str]] = {}  # domain -> agent_ids
        self._tool_index: Dict[str, List[str]] = {}    # tool_id -> agent_ids
        self._storage = storage_backend
        self._cache = cache_backend
        self._version_counter = 0

    async def register(self, profile: AgentProfile) -> None:
        """Register a new agent profile."""
        if profile.id in self._profiles:
            raise ValueError(f"Agent {profile.id} already registered")

        self._profiles[profile.id] = profile
        self._index_profile(profile)
        self._version_counter += 1

        # Persist to storage
        await self._storage.save_profile(profile)

        # Invalidate caches
        if self._cache:
            await self._cache.invalidate(f"intent:*")
            await self._cache.invalidate(f"domain:{profile.domain}")

    async def update(self, profile: AgentProfile) -> None:
        """Update an existing agent profile."""
        if profile.id not in self._profiles:
            raise KeyError(f"Agent {profile.id} not found")

        # Remove old indexes
        self._deindex_profile(self._profiles[profile.id])

        # Update profile
        profile.updated_at = datetime.utcnow()
        self._profiles[profile.id] = profile
        self._index_profile(profile)
        self._version_counter += 1

        await self._storage.update_profile(profile)

    async def unregister(self, agent_id: str) -> None:
        """Soft-unregister an agent (mark as deprecated)."""
        if agent_id not in self._profiles:
            return

        profile = self._profiles[agent_id]
        profile.status = AgentStatus.DEPRECATED
        self._deindex_profile(profile)
        await self._storage.update_profile(profile)

    async def find_by_intent(
        self,
        intent: str,
        clinic_scope: Optional[str] = None,
        required_role: Optional[str] = None,
        min_confidence: float = 0.0
    ) -> List[AgentProfile]:
        """
        Find agents that can handle a given intent.
        Filters by clinic scope and role requirements.
        """
        agent_ids = self._intent_index.get(intent, [])
        candidates = []

        for aid in agent_ids:
            profile = self._profiles.get(aid)
            if not profile or not profile.is_available:
                continue

            # Clinic scope filter
            if clinic_scope and clinic_scope not in profile.clinic_scopes:
                continue

            # Role filter
            if required_role and required_role not in profile.role_restrictions:
                continue

            candidates.append(profile)

        # Sort by confidence weight and availability
        candidates.sort(
            key=lambda p: (p.session_utilization, -p.confidence_threshold)
        )
        return candidates

    async def find_by_tool(
        self,
        tool_id: str,
        clinic_scope: Optional[str] = None
    ) -> List[AgentProfile]:
        """Find agents that have access to a specific tool."""
        agent_ids = self._tool_index.get(tool_id, [])
        return [
            self._profiles[aid] for aid in agent_ids
            if (profile := self._profiles.get(aid))
            and profile.is_available
            and (not clinic_scope or clinic_scope in profile.clinic_scopes)
        ]

    def _index_profile(self, profile: AgentProfile) -> None:
        """Add profile to all search indexes."""
        for intent in profile.intents:
            self._intent_index.setdefault(intent, []).append(profile.id)

        self._domain_index.setdefault(profile.domain, []).append(profile.id)

        for tool_id in profile.tool_ids:
            self._tool_index.setdefault(tool_id, []).append(profile.id)

    def _deindex_profile(self, profile: AgentProfile) -> None:
        """Remove profile from all search indexes."""
        for intent in profile.intents:
            if intent in self._intent_index:
                self._intent_index[intent] = [
                    aid for aid in self._intent_index[intent]
                    if aid != profile.id
                ]

        if profile.domain in self._domain_index:
            self._domain_index[profile.domain] = [
                aid for aid in self._domain_index[profile.domain]
                if aid != profile.id
            ]

    async def get_health_report(self) -> Dict:
        """Generate system health report for all registered agents."""
        total = len(self._profiles)
        active = sum(1 for p in self._profiles.values() if p.status == AgentStatus.ACTIVE)
        degraded = sum(1 for p in self._profiles.values() if p.status == AgentStatus.DEGRADED)
        offline = sum(1 for p in self._profiles.values() if p.status == AgentStatus.OFFLINE)

        overloaded = [
            {"id": p.id, "utilization": f"{p.session_utilization:.1%}"}
            for p in self._profiles.values()
            if p.session_utilization > 0.85
        ]

        return {
            "timestamp": datetime.utcnow().isoformat(),
            "registry_version": self._version_counter,
            "total_agents": total,
            "status_breakdown": {
                "active": active,
                "degraded": degraded,
                "offline": offline,
            },
            "overloaded_agents": overloaded,
            "domains": list(self._domain_index.keys()),
            "total_intents": len(self._intent_index),
            "total_tools_mapped": len(self._tool_index),
        }
```

### 2.3 Intent-Based Routing

The intent-based routing engine classifies incoming messages and routes them to the appropriate agent.

#### Architecture

```
  INCOMING MESSAGE
       |
       v
  +-------------------+
  | Message Preproc   |  (Normalize, tokenize, PII redaction)
  +--------+----------+
           |
           v
  +-------------------+
  | Intent Classifier |  (LLM + Rules + History)
  |                   |
  |  Primary Intent   |  -> 80% confidence
  |  Secondary Intent |  -> 60% confidence
  |  Escalate?        |  -> < 60% -> Human
  +--------+----------+
           |
           v
  +-------------------+
  | Context Enricher  |  (Patient data, session history, clinic context)
  +--------+----------+
           |
           v
  +-------------------+
  | Agent Selector    |  (Score agents by intent match + availability + SLA)
  +--------+----------+
           |
           v
  +-------------------+
  | Dispatch Queue    |  (Route to selected agent)
  +-------------------+
```

#### Implementation

```python
# intent_router.py
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple
from enum import Enum
import re
import json
from datetime import datetime

class IntentType(Enum):
    SCHEDULE_APPOINTMENT = "schedule_appointment"
    CANCEL_APPOINTMENT = "cancel_appointment"
    RESCHEDULE = "reschedule"
    CHECK_RESULTS = "check_results"
    TRIAGE_SYMPTOM = "triage_symptom"
    MEDICATION_QUERY = "medication_query"
    GENERAL_INQUIRY = "general_inquiry"
    EMERGENCY = "emergency"
    ADMIN_TASK = "admin_task"
    UNKNOWN = "unknown"

class RoutingDecision(Enum):
    ROUTE_TO_AGENT = "route_to_agent"
    HUMAN_ESCALATION = "human_escalation"
    CLARIFICATION_NEEDED = "clarification_needed"
    FALLBACK_AGENT = "fallback_agent"

@dataclass
class ClassifiedIntent:
    """Result of intent classification."""
    primary_intent: IntentType
    confidence: float
    secondary_intents: List[Tuple[IntentType, float]] = field(default_factory=list)
    extracted_entities: Dict[str, str] = field(default_factory=dict)
    raw_message: str = ""
    classification_method: str = ""  # "llm", "rule", "hybrid"
    timestamp: datetime = field(default_factory=datetime.utcnow)

@dataclass
class RoutingResult:
    """Final routing decision."""
    decision: RoutingDecision
    target_agent_id: Optional[str] = None
    fallback_agent_id: Optional[str] = None
    confidence: float = 0.0
    routing_reason: str = ""
    estimated_wait_ms: int = 0
    human_escalation_reason: Optional[str] = None
    context_snapshot: Dict = field(default_factory=dict)


class IntentClassifier:
    """
    Multi-layer intent classifier combining rule-based, LLM-based,
    and history-aware classification for clinical messages.
    """

    # Rule-based intent patterns for fast classification
    RULE_PATTERNS = {
        IntentType.SCHEDULE_APPOINTMENT: [
            r"\b(book|schedule|make)\s+(?:an?\s+)?(?:appointment|visit|consultation)",
            r"\b(need|want)\s+(?:to\s+)?see\s+(?:a\s+)?doctor",
            r"\b(can\s+I\s+)?(book|schedule)",
        ],
        IntentType.CANCEL_APPOINTMENT: [
            r"\b(cancel|delete|remove)\s+(?:my\s+)?(?:appointment|booking)",
            r"\b(can'?t|cannot)\s+(?:make|attend)\s+(?:my\s+)?appointment",
        ],
        IntentType.RESCHEDULE: [
            r"\b(reschedule|move|change)\s+(?:my\s+)?(?:appointment|booking)",
            r"\b(different|another)\s+(?:time|date|day)",
        ],
        IntentType.CHECK_RESULTS: [
            r"\b(check|view|see|get)\s+(?:my\s+)?(?:results?|lab|test|blood\s+work)",
            r"\b(results?|lab\s+work|blood\s+test)\s+(?:are\s+)?(?:ready|in|back)",
        ],
        IntentType.TRIAGE_SYMPTOM: [
            r"\b(I\s+(?:have|feel|am\s+experiencing))\s+.*(?:pain|fever|nausea|dizzy)",
            r"\b(symptom|hurts|ache|swelling|rash)",
        ],
        IntentType.EMERGENCY: [
            r"\b(urgent|emergency|911|ambulance|chest\s+pain|can'?t\s+breathe|unconscious)",
            r"\b(severe|critical|life.?threatening)",
        ],
        IntentType.MEDICATION_QUERY: [
            r"\b(medication|medicine|prescription|drug|pill|dosage|refill)",
            r"\b(should\s+I\s+take|how\s+to\s+take|side\s+effects?)",
        ],
    }

    def __init__(self, llm_client=None, config=None):
        self.llm_client = llm_client
        self.config = config or {}
        self._rule_cache = self._compile_rules()
        self._classification_history: List[ClassifiedIntent] = []

    def _compile_rules(self) -> Dict[IntentType, List[re.Pattern]]:
        """Compile regex patterns for rule-based classification."""
        compiled = {}
        for intent, patterns in self.RULE_PATTERNS.items():
            compiled[intent] = [re.compile(p, re.IGNORECASE) for p in patterns]
        return compiled

    async def classify(
        self,
        message: str,
        session_context: Optional[Dict] = None,
        use_llm: bool = True
    ) -> ClassifiedIntent:
        """
        Classify message intent using hybrid approach:
        1. Rule-based fast classification
        2. LLM-based semantic classification (if needed)
        3. History-aware correction
        """
        # Step 1: Rule-based classification
        rule_result = self._classify_by_rules(message)

        if rule_result and rule_result.confidence >= 0.85:
            # High-confidence rule match - use directly
            return rule_result

        # Step 2: LLM classification
        if use_llm and self.llm_client:
            llm_result = await self._classify_by_llm(message, session_context)

            # Merge results if both methods return something
            if rule_result:
                final = self._merge_classifications(rule_result, llm_result)
            else:
                final = llm_result
        else:
            final = rule_result or ClassifiedIntent(
                primary_intent=IntentType.UNKNOWN,
                confidence=0.0,
                raw_message=message,
                classification_method="rule_fallback"
            )

        # Step 3: History-aware correction
        if session_context:
            final = self._apply_history_correction(final, session_context)

        # Store in history
        self._classification_history.append(final)
        return final

    def _classify_by_rules(self, message: str) -> Optional[ClassifiedIntent]:
        """Fast rule-based classification using regex patterns."""
        scores: Dict[IntentType, float] = {}
        entities = self._extract_entities(message)

        for intent, patterns in self._rule_cache.items():
            for pattern in patterns:
                if pattern.search(message):
                    scores[intent] = scores.get(intent, 0) + 1.0 / len(patterns)

        if not scores:
            return None

        # Normalize and rank
        total_score = sum(scores.values())
        ranked = sorted(
            [(intent, score / total_score) for intent, score in scores.items()],
            key=lambda x: x[1],
            reverse=True
        )

        primary, primary_conf = ranked[0]
        secondary = [(intent, conf) for intent, conf in ranked[1:3]]

        return ClassifiedIntent(
            primary_intent=primary,
            confidence=primary_conf,
            secondary_intents=secondary,
            extracted_entities=entities,
            raw_message=message,
            classification_method="rule"
        )

    async def _classify_by_llm(
        self,
        message: str,
        context: Optional[Dict] = None
    ) -> ClassifiedIntent:
        """LLM-based semantic classification."""
        prompt = f"""Classify the following clinical message into one of these intents:
- schedule_appointment
- cancel_appointment  
- reschedule
- check_results
- triage_symptom
- medication_query
- general_inquiry
- emergency

Message: "{message}"

Respond in JSON format:
{{"intent": "<intent_name>", "confidence": 0.0-1.0, "entities": {{"key": "value"}}, "reasoning": "brief explanation"}}
"""

        try:
            response = await self.llm_client.complete(prompt, max_tokens=200)
            result = json.loads(response)

            intent = IntentType(result.get("intent", "unknown"))
            confidence = result.get("confidence", 0.5)
            entities = result.get("entities", {})

            return ClassifiedIntent(
                primary_intent=intent,
                confidence=confidence,
                extracted_entities=entities,
                raw_message=message,
                classification_method="llm"
            )
        except Exception as e:
            # Fallback to unknown on LLM failure
            return ClassifiedIntent(
                primary_intent=IntentType.UNKNOWN,
                confidence=0.0,
                raw_message=message,
                classification_method="llm_error"
            )

    def _merge_classifications(
        self,
        rule: ClassifiedIntent,
        llm: ClassifiedIntent
    ) -> ClassifiedIntent:
        """Merge rule-based and LLM classifications with weighted confidence."""
        # Weight: LLM 0.6, Rules 0.4
        if rule.primary_intent == llm.primary_intent:
            confidence = 0.4 * rule.confidence + 0.6 * llm.confidence
            return ClassifiedIntent(
                primary_intent=rule.primary_intent,
                confidence=min(confidence * 1.1, 1.0),  # Boost agreement
                secondary_intents=llm.secondary_intents,
                extracted_entities={**rule.extracted_entities, **llm.extracted_entities},
                raw_message=rule.raw_message,
                classification_method="hybrid_agree"
            )
        else:
            # Disagreement - take LLM with rule as secondary
            return ClassifiedIntent(
                primary_intent=llm.primary_intent,
                confidence=llm.confidence * 0.9,  # Reduce confidence on disagreement
                secondary_intents=[(rule.primary_intent, rule.confidence * 0.4)],
                extracted_entities={**rule.extracted_entities, **llm.extracted_entities},
                raw_message=rule.raw_message,
                classification_method="hybrid_disagree"
            )

    def _extract_entities(self, message: str) -> Dict[str, str]:
        """Extract key entities from message (dates, times, names, etc)."""
        entities = {}

        # Date extraction (simple patterns)
        date_patterns = [
            r"\b(tomorrow|today|next\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday))\b",
            r"\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b",
        ]
        for pattern in date_patterns:
            match = re.search(pattern, message, re.IGNORECASE)
            if match:
                entities["date"] = match.group(1)
                break

        # Time extraction
        time_pattern = r"\b(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)\b"
        match = re.search(time_pattern, message)
        if match:
            entities["time"] = match.group(1)

        # Doctor name
        doctor_pattern = r"\b(?:Dr\.?\s+|doctor\s+)([A-Za-z]+)\b"
        match = re.search(doctor_pattern, message, re.IGNORECASE)
        if match:
            entities["doctor_name"] = match.group(1)

        return entities

    def _apply_history_correction(
        self,
        intent: ClassifiedIntent,
        context: Dict
    ) -> ClassifiedIntent:
        """Apply session history corrections to classification."""
        # If previous messages had similar context, boost continuity
        previous_intent = context.get("last_intent")
        if previous_intent and intent.confidence < 0.6:
            # Low confidence - consider continuing previous topic
            if intent.primary_intent == IntentType.UNKNOWN:
                try:
                    intent.primary_intent = IntentType(previous_intent)
                    intent.confidence = 0.55  # Marked as uncertain
                    intent.classification_method = "history_corrected"
                except ValueError:
                    pass
        return intent


class Router:
    """
    Main routing engine that combines intent classification with
    agent profile registry to make optimal routing decisions.
    """

    def __init__(
        self,
        registry: AgentProfileRegistry,
        classifier: IntentClassifier,
        config: Optional[Dict] = None
    ):
        self.registry = registry
        self.classifier = classifier
        self.config = config or {}
        self._routing_history: List[RoutingResult] = []
        self._escalation_threshold = config.get("escalation_threshold", 0.60)

    async def route(
        self,
        message: str,
        session_id: str,
        user_context: Dict,
        clinic_id: Optional[str] = None,
        user_role: Optional[str] = None,
        priority: str = "normal"
    ) -> RoutingResult:
        """
        Route a message to the appropriate agent.

        Full routing pipeline with safety checks and audit logging.
        """
        start_time = datetime.utcnow()

        # 1. Classify intent
        session_context = user_context.get("session", {})
        classified = await self.classifier.classify(
            message, session_context=session_context
        )

        # 2. Emergency check - always escalate emergencies
        if classified.primary_intent == IntentType.EMERGENCY:
            return RoutingResult(
                decision=RoutingDecision.HUMAN_ESCALATION,
                confidence=1.0,
                routing_reason="EMERGENCY: Immediate human intervention required",
                human_escalation_reason="Emergency intent detected - direct to clinician",
                context_snapshot={"intent": classified.primary_intent.value}
            )

        # 3. Low confidence check
        if classified.confidence < self._escalation_threshold:
            return RoutingResult(
                decision=RoutingDecision.CLARIFICATION_NEEDED,
                confidence=classified.confidence,
                routing_reason=f"Intent confidence ({classified.confidence:.2f}) below threshold",
                context_snapshot={"classified_intent": classified.to_dict()}
            )

        # 4. Find candidate agents
        intent_str = classified.primary_intent.value
        candidates = await self.registry.find_by_intent(
            intent=intent_str,
            clinic_scope=clinic_id,
            required_role=user_role
        )

        if not candidates:
            # Try fallback agents
            fallback = await self._find_fallback_agent(intent_str, clinic_id)
            if fallback:
                return RoutingResult(
                    decision=RoutingDecision.FALLBACK_AGENT,
                    target_agent_id=fallback.id,
                    confidence=classified.confidence * 0.7,
                    routing_reason=f"No direct agent for {intent_str}, using fallback",
                    context_snapshot={"original_intent": intent_str}
                )
            else:
                return RoutingResult(
                    decision=RoutingDecision.HUMAN_ESCALATION,
                    confidence=classified.confidence,
                    routing_reason=f"No agent available for intent: {intent_str}",
                    human_escalation_reason="No matching agent found",
                    context_snapshot={"intent": intent_str}
                )

        # 5. Score and select best agent
        best_agent = self._score_agents(candidates, classified, priority)

        # 6. Build routing result
        elapsed_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
        result = RoutingResult(
            decision=RoutingDecision.ROUTE_TO_AGENT,
            target_agent_id=best_agent.id,
            confidence=classified.confidence,
            routing_reason=f"Routed to {best_agent.name} for {intent_str}",
            estimated_wait_ms=elapsed_ms,
            context_snapshot={
                "intent": classified.to_dict(),
                "selected_agent": best_agent.id,
                "candidates_considered": len(candidates)
            }
        )

        self._routing_history.append(result)
        return result

    def _score_agents(
        self,
        candidates: List[AgentProfile],
        intent: ClassifiedIntent,
        priority: str
    ) -> AgentProfile:
        """Score and rank candidate agents."""
        scored = []
        for agent in candidates:
            score = 0.0

            # Confidence match weight
            intent_match = 1.0 if intent.primary_intent.value in agent.intents else 0.5
            score += intent_match * 0.35

            # Availability weight (prefer less loaded)
            availability = 1.0 - agent.session_utilization
            score += availability * 0.25

            # SLA compliance weight
            sla_score = 1.0 if agent.sla_ms < 3000 else 0.7
            score += sla_score * 0.20

            # Priority weight
            if priority == "urgent" and agent.tags and "urgent" in agent.tags:
                score += 0.20
            else:
                score += 0.10

            # Clinic-specific weight
            if intent.extracted_entities.get("clinic_id") in agent.clinic_scopes:
                score += 0.10

            scored.append((agent, score))

        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[0][0]

    async def _find_fallback_agent(
        self,
        intent: str,
        clinic_id: Optional[str]
    ) -> Optional[AgentProfile]:
        """Find a general-purpose fallback agent."""
        candidates = await self.registry.find_by_intent(
            intent="general_inquiry",
            clinic_scope=clinic_id
        )
        return candidates[0] if candidates else None
```

### 2.4 Context-Aware Dispatch

The dispatch layer enriches routing decisions with full conversation context.

```python
# context_dispatcher.py
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any
from datetime import datetime
import json

@dataclass
class ConversationContext:
    """Rich context for a conversation session."""
    session_id: str
    clinic_id: str
    user_id: str
    user_role: str
    patient_id: Optional[str] = None
    language: str = "en"
    message_history: List[Dict] = field(default_factory=list)
    extracted_entities: Dict[str, Any] = field(default_factory=dict)
    agent_assignments: List[str] = field(default_factory=list)
    pending_approvals: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.utcnow)
    last_activity: datetime = field(default_factory=datetime.utcnow)

    @property
    def is_stale(self, timeout_seconds: int = 1800) -> bool:
        """Check if session has been inactive."""
        elapsed = (datetime.utcnow() - self.last_activity).total_seconds()
        return elapsed > timeout_seconds

    @property
    def message_count(self) -> int:
        return len(self.message_history)

    @property
    def last_intent(self) -> Optional[str]:
        if self.message_history:
            return self.message_history[-1].get("intent")
        return None

    def to_dict(self) -> Dict:
        return {
            "session_id": self.session_id,
            "clinic_id": self.clinic_id,
            "user_id": self.user_id,
            "user_role": self.user_role,
            "patient_id": self.patient_id,
            "language": self.language,
            "message_count": self.message_count,
            "last_intent": self.last_intent,
            "agent_assignments": self.agent_assignments,
            "pending_approvals_count": len(self.pending_approvals),
            "metadata": self.metadata,
        }


class ContextDispatcher:
    """
    Dispatches routed messages to agents with full context enrichment.
    Manages session state and cross-agent context sharing.
    """

    def __init__(self, memory_manager, event_bus, registry):
        self.memory = memory_manager
        self.event_bus = event_bus
        self.registry = registry
        self._active_sessions: Dict[str, ConversationContext] = {}

    async def dispatch(
        self,
        routing_result: RoutingResult,
        original_message: str,
        user_context: Dict
    ) -> Dict:
        """
        Dispatch a message to the target agent with full context.
        """
        session_id = user_context["session_id"]
        clinic_id = user_context.get("clinic_id")
        user_id = user_context["user_id"]
        user_role = user_context.get("role", "patient")

        # 1. Get or create session context
        session = await self._get_or_create_session(
            session_id=session_id,
            clinic_id=clinic_id,
            user_id=user_id,
            user_role=user_role,
            patient_id=user_context.get("patient_id")
        )

        # 2. Enrich with memory
        enriched_context = await self._enrich_context(session, user_context)

        # 3. Build dispatch payload
        payload = {
            "message": original_message,
            "session": session.to_dict(),
            "enriched_context": enriched_context,
            "routing": {
                "agent_id": routing_result.target_agent_id,
                "confidence": routing_result.confidence,
                "reason": routing_result.routing_reason,
            },
            "user": {
                "id": user_id,
                "role": user_role,
                "clinic_id": clinic_id,
            },
            "timestamp": datetime.utcnow().isoformat(),
        }

        # 4. Publish dispatch event
        await self.event_bus.publish("agent.dispatch", payload)

        # 5. Update session
        session.message_history.append({
            "role": "user",
            "content": original_message,
            "timestamp": datetime.utcnow().isoformat(),
            "routed_to": routing_result.target_agent_id,
        })
        session.agent_assignments.append(routing_result.target_agent_id)
        session.last_activity = datetime.utcnow()

        # 6. Persist session
        await self.memory.save_session(session)

        return payload

    async def _get_or_create_session(
        self,
        session_id: str,
        clinic_id: str,
        user_id: str,
        user_role: str,
        patient_id: Optional[str] = None
    ) -> ConversationContext:
        """Get existing session or create new one."""
        if session_id in self._active_sessions:
            session = self._active_sessions[session_id]
            if not session.is_stale:
                return session

        # Try to load from persistent storage
        session = await self.memory.load_session(session_id)
        if session:
            self._active_sessions[session_id] = session
            return session

        # Create new session
        session = ConversationContext(
            session_id=session_id,
            clinic_id=clinic_id,
            user_id=user_id,
            user_role=user_role,
            patient_id=patient_id
        )
        self._active_sessions[session_id] = session
        return session

    async def _enrich_context(
        self,
        session: ConversationContext,
        user_context: Dict
    ) -> Dict:
        """Enrich session context with long-term memory and clinic data."""
        enriched = {}

        # Patient preferences (if patient context)
        if session.patient_id:
            patient_memory = await self.memory.get_patient_memory(
                patient_id=session.patient_id,
                clinic_id=session.clinic_id
            )
            enriched["patient_memory"] = patient_memory

        # Clinic protocols
        clinic_memory = await self.memory.get_clinic_memory(
            clinic_id=session.clinic_id
        )
        enriched["clinic_context"] = clinic_memory

        # Recent conversation summary
        if len(session.message_history) > 5:
            enriched["conversation_summary"] = await self._summarize_conversation(
                session.message_history
            )

        # Active approvals pending
        if session.pending_approvals:
            enriched["pending_approvals"] = session.pending_approvals

        return enriched

    async def _summarize_conversation(self, messages: List[Dict]) -> str:
        """Generate a summary of recent conversation for context."""
        recent = messages[-10:]  # Last 10 messages
        # In production, use LLM for summarization
        topics = set()
        for msg in recent:
            if "intent" in msg:
                topics.add(msg["intent"])
        return f"Recent topics: {', '.join(topics)}"
```

### 2.5 Multi-Agent Orchestration

Orchestration manages complex workflows requiring multiple agents.

```
+------------------------------------------------------------------+
|                  MULTI-AGENT ORCHESTRATION                        |
|                                                                   |
|   Coordinator Agent manages sequential and parallel execution:    |
|                                                                   |
|   Sequential Pattern (Booking Flow):                              |
|   +----------------+    +----------------+    +--------------+   |
|   | Triage Agent   |--->| Scheduler Agent|--->| Confirm Agent|   |
|   | (Check urgency)|    | (Find slot)    |    | (Send conf)  |   |
|   +----------------+    +----------------+    +--------------+   |
|                                                                   |
|   Parallel Pattern (Results + Scheduling):                        |
|   +----------------+    +----------------+                        |
|   | Results Agent  |--->| Merge Agent    |                       |
|   | (Fetch labs)   |    | (Combine     |                       |
|   +----------------+    |  responses)  |                       |
|   +----------------+    |              |                       |
|   | Schedule Agent |--->|              |                       |
|   | (Check avail)  |    +--------------+                       |
|   +----------------+                                             |
|                                                                   |
|   Human-in-the-Loop Pattern:                                      |
|   +----------------+    +----------------+    +--------------+   |
|   | Agent Action   |--->| Human Approval |--->| Execute Tool |   |
|   | (Proposes)     |    | (Review/Decide)|    | (If approved)|   |
|   +----------------+    +----------------+    +--------------+   |
|                                                                   |
+------------------------------------------------------------------+
```

```python
# orchestrator.py
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Callable, Any
from enum import Enum
from datetime import datetime
import asyncio

class OrchestrationPattern(Enum):
    SEQUENTIAL = "sequential"
    PARALLEL = "parallel"
    CONDITIONAL = "conditional"
    HUMAN_IN_THE_LOOP = "human_in_the_loop"
    RETRY = "retry"

class StepStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    AWAITING_APPROVAL = "awaiting_approval"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"
    TIMED_OUT = "timed_out"

@dataclass
class OrchestrationStep:
    """A single step in an orchestration workflow."""
    id: str
    name: str
    agent_id: str
    description: str
    pattern: OrchestrationPattern
    depends_on: List[str] = field(default_factory=list)
    inputs: Dict[str, Any] = field(default_factory=dict)
    outputs: Dict[str, Any] = field(default_factory=dict)
    status: StepStatus = StepStatus.PENDING
    approval_required: bool = False
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    result: Optional[Any] = None
    error: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    timeout_seconds: int = 300
    retry_count: int = 0
    max_retries: int = 3

@dataclass
class OrchestrationWorkflow:
    """A complete multi-agent workflow definition."""
    id: str
    name: str
    description: str
    clinic_id: str
    steps: List[OrchestrationStep]
    created_by: str
    status: str = "active"  # active, paused, completed, failed
    current_step_id: Optional[str] = None
    context: Dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None


class WorkflowOrchestrator:
    """
    Orchestrates multi-agent workflows with support for
    sequential, parallel, conditional, and human-in-the-loop patterns.
    """

    def __init__(self, registry, dispatcher, approval_service, event_bus):
        self.registry = registry
        self.dispatcher = dispatcher
        self.approval_service = approval_service
        self.event_bus = event_bus
        self._active_workflows: Dict[str, OrchestrationWorkflow] = {}

    async def execute_workflow(
        self,
        workflow: OrchestrationWorkflow,
        initial_context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Execute a multi-agent workflow.
        Handles dependencies, approvals, retries, and error recovery.
        """
        workflow.context.update(initial_context)
        self._active_workflows[workflow.id] = workflow

        try:
            # Build dependency graph
            dependency_graph = self._build_dependency_graph(workflow.steps)
            completed_steps = set()

            while len(completed_steps) < len(workflow.steps):
                # Find ready steps (all dependencies completed)
                ready_steps = [
                    step for step in workflow.steps
                    if step.id not in completed_steps
                    and step.status == StepStatus.PENDING
                    and all(d in completed_steps for d in step.depends_on)
                ]

                if not ready_steps:
                    # Check for stuck steps
                    running = [s for s in workflow.steps if s.status == StepStatus.RUNNING]
                    awaiting = [s for s in workflow.steps if s.status == StepStatus.AWAITING_APPROVAL]
                    if not running and not awaiting:
                        break  # Nothing more to do
                    await asyncio.sleep(0.5)
                    continue

                # Execute ready steps (parallel where possible)
                tasks = [self._execute_step(step, workflow) for step in ready_steps]
                results = await asyncio.gather(*tasks, return_exceptions=True)

                for step, result in zip(ready_steps, results):
                    completed_steps.add(step.id)
                    if isinstance(result, Exception):
                        step.status = StepStatus.FAILED
                        step.error = str(result)
                        # Check if workflow should fail or continue
                        if not await self._handle_step_failure(step, workflow):
                            workflow.status = "failed"
                            return {"status": "failed", "error": str(result)}

            workflow.status = "completed"
            workflow.completed_at = datetime.utcnow()
            return {
                "status": "completed",
                "workflow_id": workflow.id,
                "steps_completed": len(completed_steps),
                "context": workflow.context
            }

        except Exception as e:
            workflow.status = "failed"
            await self.event_bus.publish("workflow.failed", {
                "workflow_id": workflow.id,
                "error": str(e)
            })
            raise

    async def _execute_step(
        self,
        step: OrchestrationStep,
        workflow: OrchestrationWorkflow
    ) -> Any:
        """Execute a single workflow step."""
        step.status = StepStatus.RUNNING
        step.started_at = datetime.utcnow()
        workflow.current_step_id = step.id

        # Publish step started event
        await self.event_bus.publish("workflow.step.started", {
            "workflow_id": workflow.id,
            "step_id": step.id,
            "agent_id": step.agent_id,
            "timestamp": datetime.utcnow().isoformat()
        })

        # Check if approval is required
        if step.approval_required:
            step.status = StepStatus.AWAITING_APPROVAL
            approval_id = await self.approval_service.request_approval(
                workflow_id=workflow.id,
                step_id=step.id,
                agent_id=step.agent_id,
                description=step.description,
                context=workflow.context,
                timeout_seconds=step.timeout_seconds
            )

            # Wait for approval
            approved = await self.approval_service.wait_for_approval(
                approval_id,
                timeout=step.timeout_seconds
            )

            if not approved:
                step.status = StepStatus.FAILED
                step.error = "Approval denied or timed out"
                raise TimeoutError(f"Step {step.id} approval timeout")

            step.approved_by = approved.get("approved_by")
            step.approved_at = datetime.utcnow()

        # Execute step
        try:
            agent = await self.registry.get_agent(step.agent_id)
            if not agent:
                raise ValueError(f"Agent {step.agent_id} not found")

            result = await self.dispatcher.execute_agent_action(
                agent_id=step.agent_id,
                action=step.inputs,
                context=workflow.context
            )

            step.result = result
            step.status = StepStatus.COMPLETED
            step.completed_at = datetime.utcnow()

            # Update workflow context with outputs
            workflow.context.update(step.outputs)
            workflow.context[f"step_{step.id}_result"] = result

            await self.event_bus.publish("workflow.step.completed", {
                "workflow_id": workflow.id,
                "step_id": step.id,
                "status": "completed"
            })

            return result

        except Exception as e:
            step.retry_count += 1
            if step.retry_count <= step.max_retries:
                step.status = StepStatus.PENDING
                await asyncio.sleep(2 ** step.retry_count)  # Exponential backoff
                return await self._execute_step(step, workflow)
            raise

    def _build_dependency_graph(self, steps: List[OrchestrationStep]) -> Dict[str, List[str]]:
        """Build a dependency graph for workflow steps."""
        return {step.id: step.depends_on for step in steps}

    async def _handle_step_failure(
        self,
        step: OrchestrationStep,
        workflow: OrchestrationWorkflow
    ) -> bool:
        """
        Handle step failure. Returns True if workflow should continue,
        False if workflow should fail.
        """
        # Always escalate clinical steps to human
        if step.approval_required:
            await self.event_bus.publish("workflow.step.failed.clinical", {
                "workflow_id": workflow.id,
                "step_id": step.id,
                "error": step.error,
                "requires_human_review": True
            })
            return False  # Fail workflow - human review needed

        # Non-critical steps can be skipped
        return True
```

### 2.6 Conversation Memory Management

```python
# memory_manager.py
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
from enum import Enum
import json
import hashlib

class MemoryType(Enum):
    SHORT_TERM = "short_term"      # Current conversation
    LONG_TERM = "long_term"        # Patient preferences, history
    CLINIC = "clinic"              # Clinic-level protocols
    AGENT = "agent"                # Agent-specific learned patterns
    EPISODIC = "episodic"          # Specific past events

class MemoryPrivacyLevel(Enum):
    PUBLIC = "public"              # Shared across all clinics
    CLINIC_SCOPED = "clinic_scoped"  # Isolated to one clinic
    PATIENT_PRIVATE = "patient_private"  # Patient-only access
    ADMIN_ONLY = "admin_only"      # Administrative access only

@dataclass
class MemoryEntry:
    """A single memory entry with metadata."""
    id: str
    memory_type: MemoryType
    key: str
    value: Any
    clinic_id: Optional[str] = None
    patient_id: Optional[str] = None
    agent_id: Optional[str] = None
    privacy_level: MemoryPrivacyLevel = MemoryPrivacyLevel.CLINIC_SCOPED
    created_at: datetime = field(default_factory=datetime.utcnow)
    expires_at: Optional[datetime] = None
    access_count: int = 0
    last_accessed: Optional[datetime] = None
    source: str = "agent"  # agent, human, system, integration
    confidence: float = 1.0
    tags: List[str] = field(default_factory=list)

    @property
    def is_expired(self) -> bool:
        if self.expires_at is None:
            return False
        return datetime.utcnow() > self.expires_at

    def touch(self):
        """Update access metadata."""
        self.access_count += 1
        self.last_accessed = datetime.utcnow()


class MemoryManager:
    """
    Comprehensive memory management for clinical AI agents.
    Supports multiple memory types with privacy isolation.
    """

    def __init__(self, storage, cache, config=None):
        self.storage = storage  # Persistent storage (PostgreSQL)
        self.cache = cache      # Fast cache (Redis)
        self.config = config or {}

        # TTL configuration
        self._ttl = {
            MemoryType.SHORT_TERM: timedelta(hours=24),
            MemoryType.LONG_TERM: timedelta(days=365),
            MemoryType.CLINIC: timedelta(days=30),
            MemoryType.AGENT: timedelta(days=90),
            MemoryType.EPISODIC: timedelta(days=180),
        }

    async def store(
        self,
        memory_type: MemoryType,
        key: str,
        value: Any,
        clinic_id: Optional[str] = None,
        patient_id: Optional[str] = None,
        agent_id: Optional[str] = None,
        privacy_level: MemoryPrivacyLevel = MemoryPrivacyLevel.CLINIC_SCOPED,
        tags: Optional[List[str]] = None,
        source: str = "agent",
        confidence: float = 1.0,
        custom_ttl: Optional[timedelta] = None
    ) -> MemoryEntry:
        """
        Store a memory entry with proper isolation and privacy.
        """
        # Generate unique ID
        entry_id = hashlib.sha256(
            f"{memory_type.value}:{clinic_id}:{patient_id}:{key}:{datetime.utcnow().isoformat()}"
            .encode()
        ).hexdigest()[:16]

        # Calculate expiration
        ttl = custom_ttl or self._ttl.get(memory_type, timedelta(days=7))
        expires_at = datetime.utcnow() + ttl

        entry = MemoryEntry(
            id=entry_id,
            memory_type=memory_type,
            key=key,
            value=value,
            clinic_id=clinic_id,
            patient_id=patient_id,
            agent_id=agent_id,
            privacy_level=privacy_level,
            expires_at=expires_at,
            source=source,
            confidence=confidence,
            tags=tags or []
        )

        # Store in persistent storage
        await self.storage.save_memory(entry)

        # Cache short-term and frequently accessed memories
        if memory_type == MemoryType.SHORT_TERM:
            cache_key = self._cache_key(entry)
            await self.cache.set(cache_key, json.dumps(value), ex=int(ttl.total_seconds()))

        return entry

    async def retrieve(
        self,
        memory_type: MemoryType,
        key: str,
        clinic_id: Optional[str] = None,
        patient_id: Optional[str] = None,
        agent_id: Optional[str] = None,
        requesting_role: str = "clinician"
    ) -> Optional[Any]:
        """
        Retrieve a memory entry with privacy and scope checks.
        """
        # Check cache first for short-term memories
        if memory_type == MemoryType.SHORT_TERM:
            cache_key = self._cache_key_from_params(
                memory_type, key, clinic_id, patient_id
            )
            cached = await self.cache.get(cache_key)
            if cached:
                return json.loads(cached)

        # Query persistent storage
        entry = await self.storage.get_memory(
            memory_type=memory_type,
            key=key,
            clinic_id=clinic_id,
            patient_id=patient_id,
            agent_id=agent_id
        )

        if not entry or entry.is_expired:
            return None

        # Privacy check
        if not self._check_privacy_access(entry, requesting_role):
            raise PermissionError(
                f"Access denied to memory {key} with privacy level {entry.privacy_level.value}"
            )

        # Clinic isolation check
        if entry.clinic_id and entry.clinic_id != clinic_id:
            if entry.privacy_level != MemoryPrivacyLevel.PUBLIC:
                raise PermissionError(
                    f"Memory {key} is scoped to clinic {entry.clinic_id}"
                )

        entry.touch()
        await self.storage.update_memory_access(entry)

        return entry.value

    async def get_patient_memory(
        self,
        patient_id: str,
        clinic_id: str
    ) -> Dict[str, Any]:
        """
        Retrieve all relevant memory for a patient.
        Includes preferences, history, and recent context.
        """
        memories = {}

        # Patient preferences (long-term)
        prefs = await self.storage.query_memories(
            memory_type=MemoryType.LONG_TERM,
            clinic_id=clinic_id,
            patient_id=patient_id
        )
        memories["preferences"] = {m.key: m.value for m in prefs}

        # Recent episodic memories
        episodes = await self.storage.query_memories(
            memory_type=MemoryType.EPISODIC,
            clinic_id=clinic_id,
            patient_id=patient_id,
            limit=10
        )
        memories["recent_events"] = [
            {"key": m.key, "value": m.value, "date": m.created_at.isoformat()}
            for m in episodes
        ]

        return memories

    async def get_clinic_memory(self, clinic_id: str) -> Dict[str, Any]:
        """Retrieve clinic-level memory (protocols, schedules, etc)."""
        memories = await self.storage.query_memories(
            memory_type=MemoryType.CLINIC,
            clinic_id=clinic_id
        )
        return {m.key: m.value for m in memories if not m.is_expired}

    async def save_session(self, session: ConversationContext) -> None:
        """Save a conversation session to memory."""
        await self.storage.save_session(session)

    async def load_session(self, session_id: str) -> Optional[ConversationContext]:
        """Load a conversation session from memory."""
        return await self.storage.load_session(session_id)

    def _cache_key(self, entry: MemoryEntry) -> str:
        """Generate cache key for a memory entry."""
        parts = ["memory", entry.memory_type.value, entry.key]
        if entry.clinic_id:
            parts.append(entry.clinic_id)
        if entry.patient_id:
            parts.append(entry.patient_id)
        return ":".join(parts)

    def _cache_key_from_params(
        self,
        memory_type: MemoryType,
        key: str,
        clinic_id: Optional[str],
        patient_id: Optional[str]
    ) -> str:
        parts = ["memory", memory_type.value, key]
        if clinic_id:
            parts.append(clinic_id)
        if patient_id:
            parts.append(patient_id)
        return ":".join(parts)

    def _check_privacy_access(
        self,
        entry: MemoryEntry,
        requesting_role: str
    ) -> bool:
        """Check if the requesting role can access this memory."""
        if entry.privacy_level == MemoryPrivacyLevel.PUBLIC:
            return True

        if entry.privacy_level == MemoryPrivacyLevel.ADMIN_ONLY:
            return requesting_role in ["admin", "system"]

        if entry.privacy_level == MemoryPrivacyLevel.PATIENT_PRIVATE:
            return requesting_role in ["patient", "admin", "system"]

        # CLINIC_SCOPED - any clinic role can access
        return requesting_role in ["clinician", "admin", "receptionist", "system"]

    async def cleanup_expired(self) -> int:
        """Remove expired memory entries. Returns count removed."""
        return await self.storage.delete_expired_memories()
```

### 2.7 Session State Persistence

```python
# session_manager.py
import uuid
from dataclasses import dataclass, field, asdict
from typing import Dict, Optional, List, Any
from datetime import datetime
import json

@dataclass
class SessionState:
    """Complete state for a user session."""
    session_id: str
    user_id: str
    clinic_id: str
    user_role: str
    patient_id: Optional[str] = None
    current_agent_id: Optional[str] = None
    conversation_history: List[Dict] = field(default_factory=list)
    pending_tool_calls: List[Dict] = field(default_factory=list)
    context_variables: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.utcnow)
    last_activity: datetime = field(default_factory=datetime.utcnow)
    expires_at: Optional[datetime] = None

    def to_dict(self) -> Dict:
        return {
            "session_id": self.session_id,
            "user_id": self.user_id,
            "clinic_id": self.clinic_id,
            "user_role": self.user_role,
            "patient_id": self.patient_id,
            "current_agent_id": self.current_agent_id,
            "conversation_length": len(self.conversation_history),
            "pending_calls": len(self.pending_tool_calls),
            "context_keys": list(self.context_variables.keys()),
            "created_at": self.created_at.isoformat(),
            "last_activity": self.last_activity.isoformat(),
        }


class SessionManager:
    """
    Manages session lifecycle with Redis-backed state persistence.
    Supports session recovery, migration, and graceful expiration.
    """

    def __init__(self, redis_client, postgres_client, config=None):
        self.redis = redis_client
        self.postgres = postgres_client
        self.config = config or {}
        self._session_ttl = config.get("session_ttl_seconds", 1800)  # 30 min
        self._max_history = config.get("max_history_messages", 100)

    async def create_session(
        self,
        user_id: str,
        clinic_id: str,
        user_role: str = "patient",
        patient_id: Optional[str] = None
    ) -> SessionState:
        """Create a new session."""
        session_id = str(uuid.uuid4())
        session = SessionState(
            session_id=session_id,
            user_id=user_id,
            clinic_id=clinic_id,
            user_role=user_role,
            patient_id=patient_id,
            expires_at=datetime.utcnow() + timedelta(seconds=self._session_ttl)
        )

        # Store in Redis (hot path)
        await self._save_to_redis(session)

        # Store in PostgreSQL (persistent)
        await self._save_to_postgres(session)

        return session

    async def get_session(self, session_id: str) -> Optional[SessionState]:
        """Get session from cache or persistent storage."""
        # Try Redis first
        session = await self._load_from_redis(session_id)
        if session:
            return session

        # Fallback to PostgreSQL
        session = await self._load_from_postgres(session_id)
        if session:
            # Restore to Redis
            await self._save_to_redis(session)
            return session

        return None

    async def update_session(
        self,
        session_id: str,
        updates: Dict[str, Any]
    ) -> Optional[SessionState]:
        """Update session state."""
        session = await self.get_session(session_id)
        if not session:
            return None

        for key, value in updates.items():
            if hasattr(session, key):
                setattr(session, key, value)

        session.last_activity = datetime.utcnow()

        await self._save_to_redis(session)
        await self._save_to_postgres(session)

        return session

    async def add_message(
        self,
        session_id: str,
        role: str,
        content: str,
        metadata: Optional[Dict] = None
    ) -> None:
        """Add a message to session conversation history."""
        session = await self.get_session(session_id)
        if not session:
            return

        message = {
            "role": role,
            "content": content,
            "timestamp": datetime.utcnow().isoformat(),
            "metadata": metadata or {}
        }

        session.conversation_history.append(message)

        # Trim if exceeds max
        if len(session.conversation_history) > self._max_history:
            session.conversation_history = session.conversation_history[-self._max_history:]

        session.last_activity = datetime.utcnow()
        await self._save_to_redis(session)

    async def end_session(self, session_id: str) -> None:
        """Gracefully end a session."""
        session = await self.get_session(session_id)
        if not session:
            return

        # Archive conversation to PostgreSQL
        await self._archive_conversation(session)

        # Remove from Redis
        await self.redis.delete(f"session:{session_id}")

        # Mark as ended in PostgreSQL
        await self.postgres.execute(
            "UPDATE sessions SET status = 'ended', ended_at = NOW() WHERE session_id = $1",
            session_id
        )

    async def _save_to_redis(self, session: SessionState) -> None:
        """Save session to Redis with TTL."""
        key = f"session:{session.session_id}"
        data = json.dumps({
            **asdict(session),
            "created_at": session.created_at.isoformat(),
            "last_activity": session.last_activity.isoformat(),
            "expires_at": session.expires_at.isoformat() if session.expires_at else None,
        }, default=str)
        await self.redis.setex(key, self._session_ttl, data)

    async def _load_from_redis(self, session_id: str) -> Optional[SessionState]:
        """Load session from Redis."""
        data = await self.redis.get(f"session:{session_id}")
        if not data:
            return None
        # Parse and return
        parsed = json.loads(data)
        return SessionState(**parsed)

    async def _save_to_postgres(self, session: SessionState) -> None:
        """Persist session to PostgreSQL."""
        await self.postgres.execute(
            """
            INSERT INTO sessions (session_id, user_id, clinic_id, user_role, patient_id,
                                current_agent_id, context_variables, metadata, status,
                                created_at, last_activity, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9, $10, $11)
            ON CONFLICT (session_id) DO UPDATE SET
                current_agent_id = EXCLUDED.current_agent_id,
                context_variables = EXCLUDED.context_variables,
                metadata = EXCLUDED.metadata,
                last_activity = EXCLUDED.last_activity
            """,
            session.session_id, session.user_id, session.clinic_id,
            session.user_role, session.patient_id, session.current_agent_id,
            json.dumps(session.context_variables), json.dumps(session.metadata),
            session.created_at, session.last_activity, session.expires_at
        )

    async def _archive_conversation(self, session: SessionState) -> None:
        """Archive conversation history for audit and analysis."""
        await self.postgres.execute(
            """
            INSERT INTO conversation_archives (session_id, clinic_id, user_id,
                conversation_history, archived_at)
            VALUES ($1, $2, $3, $4, NOW())
            """,
            session.session_id, session.clinic_id, session.user_id,
            json.dumps(session.conversation_history)
        )

    async def list_active_sessions(
        self,
        clinic_id: Optional[str] = None
    ) -> List[Dict]:
        """List all active sessions."""
        if clinic_id:
            rows = await self.postgres.fetch(
                "SELECT session_id, user_id, current_agent_id, last_activity "
                "FROM sessions WHERE clinic_id = $1 AND status = 'active'",
                clinic_id
            )
        else:
            rows = await self.postgres.fetch(
                "SELECT session_id, user_id, current_agent_id, last_activity "
                "FROM sessions WHERE status = 'active'"
            )
        return [dict(row) for row in rows]
```

---

## 3. OpenClaw Agent Gateway

### 3.1 Design Philosophy

OpenClaw serves as the governed gateway between AI agents and the tools they can execute. Inspired by the concept of a "claw" that carefully grasps and controls, OpenClaw provides:

1. **Tool Manifest Authority**: Every tool must be explicitly defined, documented, and approved
2. **Permission-Driven Access**: Role-based and context-aware permission system
3. **Human Oversight**: Pre-execution approvals for sensitive operations
4. **Complete Audit Trail**: Every tool call is logged immutably
5. **Resilience**: Rate limiting and circuit breakers prevent system overload
6. **Sandboxed Execution**: Tools run in isolated environments

### 3.2 Architecture Overview

```
+------------------------------------------------------------------+
|                     OPENCLAW AGENT GATEWAY                        |
|                                                                   |
|  +---------------+   +---------------+   +---------------------+ |
|  |  Tool Manifest |   |  Permission  |   |  Human Approval    | |
|  |  Registry      |-->|  Engine      |-->|  Workflow Manager  | |
|  |  (Definitions) |   |  (RBAC+ABAC) |   |  (Pre/Post/Emerg)  | |
|  +---------------+   +---------------+   +---------------------+ |
|           |                   |                   |              |
|  +--------v----------+ +------v--------+ +-------v-----------+  |
|  |  Execution        | |  Audit        | |  Rate Limiter     |  |
|  |  Sandbox          | |  Logger       | |  /Circuit Breaker |  |
|  |  (Docker/gVisor)  | |  (Immutable)  | |  (Per-tool)       |  |
|  +--------+----------+ +------+--------+ +-------+-----------+  |
|           |                   |                   |              |
+-----------v-------------------v-------------------v--------------+
            |                   |                   |
+-----------v-------------------v-------------------v--------------+
|                        TOOL EXECUTION                             |
|  1. Validate manifest exists and is active                       |
|  2. Check permissions (role + clinic + patient context)          |
|  3. Evaluate approval requirements                               |
|  4. Apply rate limiting                                          |
|  5. Check circuit breaker state                                  |
|  6. Request human approval if required                           |
|  7. Execute in sandboxed environment                             |
|  8. Log result (success/failure/timeout)                         |
|  9. Update circuit breaker metrics                               |
|  10. Return result to agent                                      |
+------------------------------------------------------------------+
```

### 3.3 Tool Manifest Registry

```python
# tool_manifest_registry.py
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any, Callable
from enum import Enum
from datetime import datetime
import json
import yaml

class ToolStatus(Enum):
    ACTIVE = "active"
    DEPRECATED = "deprecated"
    DISABLED = "disabled"
    EXPERIMENTAL = "experimental"

class ParameterType(Enum):
    STRING = "string"
    INTEGER = "integer"
    FLOAT = "float"
    BOOLEAN = "boolean"
    DATE = "date"
    DATETIME = "datetime"
    ARRAY = "array"
    OBJECT = "object"
    ENUM = "enum"
    PATIENT_ID = "patient_id"  # Special: requires patient consent check

class AuditLevel(Enum):
    NONE = "none"              # No logging
    METADATA = "metadata"      # Log call metadata only
    FULL = "full"              # Log full request and response
    VERBOSE = "verbose"        # Log everything including intermediate state

@dataclass
class ToolParameter:
    """Definition of a tool parameter."""
    name: str
    type: ParameterType
    description: str
    required: bool = True
    default: Any = None
    enum_values: Optional[List[str]] = None
    validation_regex: Optional[str] = None
    max_length: Optional[int] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    pii: bool = False  # Whether this parameter contains PII
    example: Any = None

@dataclass
class ToolManifest:
    """
    Complete manifest for a clinical tool.
    Every tool must have a registered manifest before it can be executed.
    """
    id: str                          # Unique tool ID (e.g., "appointments.book")
    name: str                        # Human-readable name
    description: str                 # Detailed description
    version: str                     # Semantic version
    category: str                    # Functional category
    parameters: List[ToolParameter]  # Input parameter definitions
    return_schema: Dict[str, Any]    # JSON schema for return value
    approval_required: bool = False  # Whether human approval is needed
    allowed_roles: List[str] = field(default_factory=list)
    denied_roles: List[str] = field(default_factory=list)
    clinic_scopes: List[str] = field(default_factory=list)  # Empty = all clinics
    audit_level: AuditLevel = AuditLevel.FULL
    rate_limit: Optional[Dict] = None  # {"requests": 10, "per_seconds": 60}
    timeout_seconds: int = 30
    retry_policy: Dict[str, Any] = field(default_factory=lambda: {
        "max_retries": 3,
        "backoff_strategy": "exponential",
        "retry_on": ["timeout", "transient_error"]
    })
    circuit_breaker: Dict[str, Any] = field(default_factory=lambda: {
        "failure_threshold": 5,
        "recovery_timeout_seconds": 60,
        "half_open_max_calls": 2
    })
    sandbox_config: Dict[str, Any] = field(default_factory=lambda: {
        "type": "docker",
        "network_access": False,
        "file_system_access": False,
        "memory_limit_mb": 256,
        "cpu_limit": 0.5
    })
    required_consents: List[str] = field(default_factory=list)
    emergency_bypass_allowed: bool = False
    documentation_url: Optional[str] = None
    owner: Optional[str] = None  # Team/person responsible
    status: ToolStatus = ToolStatus.ACTIVE
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def validate_parameters(self, params: Dict[str, Any]) -> List[str]:
        """Validate provided parameters against manifest definition."""
        errors = []

        # Check required parameters
        param_names = {p.name for p in self.parameters}
        for param in self.parameters:
            if param.required and param.name not in params:
                errors.append(f"Missing required parameter: {param.name}")

        # Check for unknown parameters
        for key in params:
            if key not in param_names:
                errors.append(f"Unknown parameter: {key}")

        # Validate types and constraints
        for param in self.parameters:
            if param.name not in params:
                continue
            value = params[param.name]
            errors.extend(self._validate_parameter(param, value))

        return errors

    def _validate_parameter(self, param: ToolParameter, value: Any) -> List[str]:
        errors = []

        if param.type == ParameterType.STRING:
            if not isinstance(value, str):
                errors.append(f"{param.name}: expected string, got {type(value).__name__}")
            elif param.max_length and len(value) > param.max_length:
                errors.append(f"{param.name}: exceeds max length {param.max_length}")
            elif param.validation_regex and not re.match(param.validation_regex, value):
                errors.append(f"{param.name}: does not match required pattern")

        elif param.type == ParameterType.INTEGER:
            if not isinstance(value, int):
                errors.append(f"{param.name}: expected integer")
            elif param.min_value is not None and value < param.min_value:
                errors.append(f"{param.name}: below minimum {param.min_value}")
            elif param.max_value is not None and value > param.max_value:
                errors.append(f"{param.name}: above maximum {param.max_value}")

        elif param.type == ParameterType.PATIENT_ID:
            if not isinstance(value, str) or not value.startswith("PAT-"):
                errors.append(f"{param.name}: invalid patient ID format")

        elif param.type == ParameterType.ENUM:
            if param.enum_values and value not in param.enum_values:
                errors.append(f"{param.name}: must be one of {param.enum_values}")

        return errors

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "version": self.version,
            "category": self.category,
            "parameters": [
                {
                    "name": p.name,
                    "type": p.type.value,
                    "description": p.description,
                    "required": p.required,
                    "default": p.default,
                    "pii": p.pii,
                    "example": p.example,
                }
                for p in self.parameters
            ],
            "approval_required": self.approval_required,
            "allowed_roles": self.allowed_roles,
            "audit_level": self.audit_level.value,
            "rate_limit": self.rate_limit,
            "timeout_seconds": self.timeout_seconds,
            "status": self.status.value,
        }


class ToolManifestRegistry:
    """
    Central registry for all tool manifests.
    Provides CRUD operations, validation, and discovery.
    """

    def __init__(self, storage, cache=None):
        self.storage = storage
        self.cache = cache
        self._manifests: Dict[str, ToolManifest] = {}
        self._category_index: Dict[str, List[str]] = {}

    async def load_manifest_from_yaml(self, yaml_path: str) -> ToolManifest:
        """Load a tool manifest from YAML file."""
        with open(yaml_path, 'r') as f:
            data = yaml.safe_load(f)
        return self._parse_manifest(data)

    async def register(self, manifest: ToolManifest) -> None:
        """Register a new tool manifest."""
        if manifest.id in self._manifests:
            raise ValueError(f"Tool {manifest.id} already registered")

        self._manifests[manifest.id] = manifest
        self._category_index.setdefault(manifest.category, []).append(manifest.id)

        await self.storage.save_manifest(manifest)

        if self.cache:
            await self.cache.set(f"manifest:{manifest.id}", json.dumps(manifest.to_dict()))

    async def get(self, tool_id: str) -> Optional[ToolManifest]:
        """Get a tool manifest by ID."""
        # Check cache
        if self.cache:
            cached = await self.cache.get(f"manifest:{tool_id}")
            if cached:
                data = json.loads(cached)
                return self._dict_to_manifest(data)

        # Check memory
        if tool_id in self._manifests:
            return self._manifests[tool_id]

        # Load from storage
        manifest = await self.storage.get_manifest(tool_id)
        if manifest:
            self._manifests[tool_id] = manifest
        return manifest

    async def list_by_category(self, category: str) -> List[ToolManifest]:
        """List all tools in a category."""
        tool_ids = self._category_index.get(category, [])
        return [self._manifests[tid] for tid in tool_ids if tid in self._manifests]

    async def list_active(self, clinic_id: Optional[str] = None) -> List[ToolManifest]:
        """List all active tools, optionally filtered by clinic."""
        manifests = [
            m for m in self._manifests.values()
            if m.status == ToolStatus.ACTIVE
        ]
        if clinic_id:
            manifests = [
                m for m in manifests
                if not m.clinic_scopes or clinic_id in m.clinic_scopes
            ]
        return manifests

    async def deprecate(self, tool_id: str) -> None:
        """Mark a tool as deprecated."""
        manifest = await self.get(tool_id)
        if manifest:
            manifest.status = ToolStatus.DEPRECATED
            manifest.updated_at = datetime.utcnow()
            await self.storage.update_manifest(manifest)

    def _parse_manifest(self, data: Dict) -> ToolManifest:
        """Parse manifest from dictionary/YAML."""
        parameters = [
            ToolParameter(
                name=p["name"],
                type=ParameterType(p.get("type", "string")),
                description=p.get("description", ""),
                required=p.get("required", True),
                default=p.get("default"),
                pii=p.get("pii", False),
                example=p.get("example"),
            )
            for p in data.get("parameters", [])
        ]

        return ToolManifest(
            id=data["id"],
            name=data["name"],
            description=data["description"],
            version=data.get("version", "1.0.0"),
            category=data.get("category", "general"),
            parameters=parameters,
            return_schema=data.get("return_schema", {}),
            approval_required=data.get("approval_required", False),
            allowed_roles=data.get("allowed_roles", []),
            denied_roles=data.get("denied_roles", []),
            audit_level=AuditLevel(data.get("audit_level", "full")),
            rate_limit=data.get("rate_limit"),
            timeout_seconds=data.get("timeout_seconds", 30),
            required_consents=data.get("required_consents", []),
            emergency_bypass_allowed=data.get("emergency_bypass_allowed", False),
            status=ToolStatus(data.get("status", "active")),
        )

    def _dict_to_manifest(self, data: Dict) -> ToolManifest:
        """Convert dictionary back to ToolManifest."""
        return self._parse_manifest(data)
```

### 3.4 Permission-Based Tool Access

```python
# permission_engine.py
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set
from enum import Enum
from datetime import datetime

class PermissionDecision(Enum):
    ALLOW = "allow"
    DENY = "deny"
    CONDITIONAL = "conditional"  # Requires additional checks
    ESCALATE = "escalate"        # Requires human review

@dataclass
class AccessContext:
    """Context for permission evaluation."""
    user_id: str
    user_role: str
    clinic_id: str
    patient_id: Optional[str] = None
    session_id: Optional[str] = None
    tool_id: Optional[str] = None
    action: Optional[str] = None
    time_of_day: Optional[str] = None  # "business_hours", "after_hours", "emergency"
    patient_consent_verified: bool = False
    is_emergency: bool = False
    additional_claims: Dict[str, Any] = field(default_factory=dict)

@dataclass
class PermissionResult:
    """Result of a permission check."""
    decision: PermissionDecision
    reason: str
    conditions: List[str] = field(default_factory=list)
    expires_at: Optional[datetime] = None
    audit_required: bool = True


class PermissionEngine:
    """
    Attribute-Based Access Control (ABAC) engine for tool permissions.
    Evaluates roles, clinic scopes, patient consent, time of day,
    and custom policies for each tool access request.
    """

    def __init__(self, policy_store, consent_service):
        self.policy_store = policy_store
        self.consent_service = consent_service

    async def check_access(
        self,
        tool: ToolManifest,
        context: AccessContext
    ) -> PermissionResult:
        """
        Check if the user has permission to execute a tool.

        Evaluation order:
        1. Role-based check (allowed_roles / denied_roles)
        2. Clinic scope check
        3. Patient consent verification (if patient_id involved)
        4. Time-based restrictions
        5. Emergency bypass (if applicable)
        6. Custom policy evaluation
        """

        # 1. Role-based check
        role_result = self._check_role_access(tool, context)
        if role_result.decision == PermissionDecision.DENY:
            return role_result

        # 2. Clinic scope check
        clinic_result = self._check_clinic_scope(tool, context)
        if clinic_result.decision == PermissionDecision.DENY:
            return clinic_result

        # 3. Patient consent check
        if context.patient_id and self._requires_patient_consent(tool):
            consent_result = await self._check_patient_consent(tool, context)
            if consent_result.decision == PermissionDecision.DENY:
                return consent_result
            if consent_result.decision == PermissionDecision.CONDITIONAL:
                return consent_result

        # 4. Emergency bypass
        if context.is_emergency and tool.emergency_bypass_allowed:
            return PermissionResult(
                decision=PermissionDecision.ALLOW,
                reason="Emergency bypass activated with full audit trail",
                audit_required=True
            )

        # 5. Approval requirement
        if tool.approval_required and not context.is_emergency:
            return PermissionResult(
                decision=PermissionDecision.ESCALATE,
                reason=f"Tool {tool.id} requires human approval",
                conditions=["human_approval_required"]
            )

        return PermissionResult(
            decision=PermissionDecision.ALLOW,
            reason="All permission checks passed",
            audit_required=tool.audit_level != AuditLevel.NONE
        )

    def _check_role_access(
        self,
        tool: ToolManifest,
        context: AccessContext
    ) -> PermissionResult:
        """Check role-based access."""
        if tool.denied_roles and context.user_role in tool.denied_roles:
            return PermissionResult(
                decision=PermissionDecision.DENY,
                reason=f"Role '{context.user_role}' is explicitly denied"
            )

        if tool.allowed_roles and context.user_role not in tool.allowed_roles:
            return PermissionResult(
                decision=PermissionDecision.DENY,
                reason=f"Role '{context.user_role}' not in allowed roles: {tool.allowed_roles}"
            )

        return PermissionResult(
            decision=PermissionDecision.ALLOW,
            reason="Role check passed"
        )

    def _check_clinic_scope(
        self,
        tool: ToolManifest,
        context: AccessContext
    ) -> PermissionResult:
        """Check clinic scope access."""
        if not tool.clinic_scopes:
            return PermissionResult(
                decision=PermissionDecision.ALLOW,
                reason="Tool has no clinic restrictions"
            )

        if context.clinic_id in tool.clinic_scopes:
            return PermissionResult(
                decision=PermissionDecision.ALLOW,
                reason="Clinic scope check passed"
            )

        return PermissionResult(
            decision=PermissionDecision.DENY,
            reason=f"Clinic '{context.clinic_id}' not in tool scopes: {tool.clinic_scopes}"
        )

    def _requires_patient_consent(self, tool: ToolManifest) -> bool:
        """Check if tool requires patient consent."""
        if tool.required_consents:
            return True
        for param in tool.parameters:
            if param.type == ParameterType.PATIENT_ID or param.pii:
                return True
        return False

    async def _check_patient_consent(
        self,
        tool: ToolManifest,
        context: AccessContext
    ) -> PermissionResult:
        """Verify patient consent for tool execution."""
        if not context.patient_id:
            return PermissionResult(
                decision=PermissionDecision.DENY,
                reason="Patient consent required but no patient_id provided"
            )

        if context.patient_consent_verified:
            return PermissionResult(
                decision=PermissionDecision.ALLOW,
                reason="Patient consent already verified in session"
            )

        # Check consent service
        has_consent = await self.consent_service.verify_consent(
            patient_id=context.patient_id,
            clinic_id=context.clinic_id,
            consent_types=tool.required_consents,
            tool_id=tool.id
        )

        if has_consent:
            return PermissionResult(
                decision=PermissionDecision.ALLOW,
                reason="Patient consent verified"
            )

        return PermissionResult(
            decision=PermissionDecision.CONDITIONAL,
            reason="Patient consent verification required",
            conditions=["patient_consent_required"]
        )
```

### 3.5 Tool Execution Sandbox

```python
# execution_sandbox.py
import asyncio
import json
import tempfile
import os
from dataclasses import dataclass
from typing import Dict, Any, Optional
from datetime import datetime
from enum import Enum

class ExecutionResult(Enum):
    SUCCESS = "success"
    FAILURE = "failure"
    TIMEOUT = "timeout"
    SANDBOX_ERROR = "sandbox_error"
    VALIDATION_ERROR = "validation_error"

@dataclass
class SandboxResult:
    status: ExecutionResult
    output: Any
    execution_time_ms: int
    logs: str
    error: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


class ExecutionSandbox:
    """
    Sandboxed execution environment for clinical tools.
    Uses Docker containers for isolation with configurable resource limits.
    """

    def __init__(self, docker_client, config=None):
        self.docker = docker_client
        self.config = config or {}
        self._default_image = config.get("sandbox_image", "clinical-tool-runner:latest")
        self._network = config.get("sandbox_network", "none")

    async def execute(
        self,
        tool: ToolManifest,
        parameters: Dict[str, Any],
        context: Dict[str, Any]
    ) -> SandboxResult:
        """
        Execute a tool in a sandboxed environment.
        """
        start_time = datetime.utcnow()

        # Validate parameters against manifest
        validation_errors = tool.validate_parameters(parameters)
        if validation_errors:
            return SandboxResult(
                status=ExecutionResult.VALIDATION_ERROR,
                output=None,
                execution_time_ms=0,
                logs="",
                error=f"Parameter validation failed: {'; '.join(validation_errors)}"
            )

        # Prepare execution payload
        payload = {
            "tool_id": tool.id,
            "parameters": parameters,
            "context": {
                "clinic_id": context.get("clinic_id"),
                "user_id": context.get("user_id"),
                "user_role": context.get("user_role"),
                "session_id": context.get("session_id"),
            }
        }

        # Write payload to temp file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(payload, f)
            payload_path = f.name

        try:
            # Create and run container
            container = await self._run_container(tool, payload_path)

            # Wait for completion with timeout
            try:
                result = await asyncio.wait_for(
                    self._wait_for_container(container),
                    timeout=tool.timeout_seconds
                )
            except asyncio.TimeoutError:
                await self._kill_container(container)
                elapsed = int((datetime.utcnow() - start_time).total_seconds() * 1000)
                return SandboxResult(
                    status=ExecutionResult.TIMEOUT,
                    output=None,
                    execution_time_ms=elapsed,
                    logs="",
                    error=f"Execution timed out after {tool.timeout_seconds}s"
                )

            elapsed = int((datetime.utcnow() - start_time).total_seconds() * 1000)

            # Parse result
            if result["exit_code"] == 0:
                return SandboxResult(
                    status=ExecutionResult.SUCCESS,
                    output=result.get("output"),
                    execution_time_ms=elapsed,
                    logs=result.get("logs", ""),
                    metadata={"container_id": result.get("container_id")}
                )
            else:
                return SandboxResult(
                    status=ExecutionResult.FAILURE,
                    output=None,
                    execution_time_ms=elapsed,
                    logs=result.get("logs", ""),
                    error=result.get("error", "Unknown error")
                )

        except Exception as e:
            elapsed = int((datetime.utcnow() - start_time).total_seconds() * 1000)
            return SandboxResult(
                status=ExecutionResult.SANDBOX_ERROR,
                output=None,
                execution_time_ms=elapsed,
                logs="",
                error=f"Sandbox error: {str(e)}"
            )
        finally:
            # Cleanup
            if os.path.exists(payload_path):
                os.unlink(payload_path)

    async def _run_container(self, tool: ToolManifest, payload_path: str):
        """Create and start a sandboxed container."""
        sandbox_config = tool.sandbox_config

        container_config = {
            "Image": sandbox_config.get("image", self._default_image),
            "NetworkMode": "none" if not sandbox_config.get("network_access") else "bridge",
            "Memory": sandbox_config.get("memory_limit_mb", 256) * 1024 * 1024,
            "CpuQuota": int(sandbox_config.get("cpu_limit", 0.5) * 100000),
            "ReadonlyRootfs": not sandbox_config.get("file_system_access", False),
            "SecurityOpt": ["no-new-privileges:true"],
            "CapDrop": ["ALL"],
            "Binds": [f"{payload_path}:/input.json:ro"],
        }

        # In production, use proper Docker API
        # container = await self.docker.containers.create(config=container_config)
        # await container.start()
        # return container
        return {"container_id": "mock-container-id"}

    async def _wait_for_container(self, container):
        """Wait for container to complete and return results."""
        # In production, use proper Docker API
        # await container.wait()
        # logs = await container.logs(stdout=True, stderr=True)
        # result = await container.read_stdout()
        return {
            "exit_code": 0,
            "output": {"status": "success", "data": {}},
            "logs": "Tool executed successfully",
            "container_id": "mock-container-id"
        }

    async def _kill_container(self, container):
        """Force kill a container."""
        # await container.kill()
        pass
```

### 3.6 Audit Logging

```python
# audit_logger.py
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any
from datetime import datetime
from enum import Enum
import json
import uuid

class AuditEventType(Enum):
    TOOL_CALLED = "tool.called"
    TOOL_EXECUTED = "tool.executed"
    TOOL_FAILED = "tool.failed"
    APPROVAL_REQUESTED = "approval.requested"
    APPROVAL_GRANTED = "approval.granted"
    APPROVAL_DENIED = "approval.denied"
    APPROVAL_ESCALATED = "approval.escalated"
    PERMISSION_DENIED = "permission.denied"
    RATE_LIMITED = "rate.limited"
    CIRCUIT_OPENED = "circuit.opened"
    CIRCUIT_CLOSED = "circuit.closed"
    EMERGENCY_BYPASS = "emergency.bypass"
    CONSENT_VERIFIED = "consent.verified"
    CONSENT_DENIED = "consent.denied"

@dataclass
class AuditEvent:
    """
    Immutable audit event for every action in the system.
    Append-only - events are never modified or deleted.
    """
    event_id: str
    event_type: AuditEventType
    timestamp: datetime
    tool_id: Optional[str]
    session_id: Optional[str]
    user_id: str
    user_role: str
    clinic_id: str
    patient_id: Optional[str]
    request_data: Dict[str, Any] = field(default_factory=dict)
    response_data: Dict[str, Any] = field(default_factory=dict)
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    correlation_id: Optional[str] = None

    @property
    def has_phi(self) -> bool:
        """Check if event contains Protected Health Information."""
        return self.patient_id is not None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "event_id": self.event_id,
            "event_type": self.event_type.value,
            "timestamp": self.timestamp.isoformat(),
            "tool_id": self.tool_id,
            "session_id": self.session_id,
            "user_id": self.user_id,
            "user_role": self.user_role,
            "clinic_id": self.clinic_id,
            "patient_id": self.patient_id,
            "request_data": self.request_data,
            "response_summary": self._summarize_response(),
            "ip_address": self.ip_address,
            "metadata": self.metadata,
            "correlation_id": self.correlation_id,
        }

    def _summarize_response(self) -> Dict:
        """Create a summary of response (may redact PHI)."""
        if not self.response_data:
            return {}
        return {
            "status": self.response_data.get("status"),
            "execution_time_ms": self.response_data.get("execution_time_ms"),
            "has_phi": self.has_phi,
        }


class AuditLogger:
    """
    Immutable audit logging system for clinical tool governance.
    Every action is logged to an append-only event store.
    """

    def __init__(self, event_store, config=None):
        self.event_store = event_store  # PostgreSQL append-only table
        self.config = config or {}
        self._buffer: List[AuditEvent] = []
        self._buffer_size = config.get("buffer_size", 100)
        self._buffer_flush_seconds = config.get("buffer_flush_seconds", 5)

    async def log(
        self,
        event_type: AuditEventType,
        tool_id: Optional[str] = None,
        session_id: Optional[str] = None,
        user_id: str = "",
        user_role: str = "",
        clinic_id: str = "",
        patient_id: Optional[str] = None,
        request_data: Optional[Dict] = None,
        response_data: Optional[Dict] = None,
        metadata: Optional[Dict] = None,
        correlation_id: Optional[str] = None
    ) -> AuditEvent:
        """
        Log an audit event. Events are buffered and flushed asynchronously.
        """
        event = AuditEvent(
            event_id=str(uuid.uuid4()),
            event_type=event_type,
            timestamp=datetime.utcnow(),
            tool_id=tool_id,
            session_id=session_id,
            user_id=user_id,
            user_role=user_role,
            clinic_id=clinic_id,
            patient_id=patient_id,
            request_data=request_data or {},
            response_data=response_data or {},
            metadata=metadata or {},
            correlation_id=correlation_id or str(uuid.uuid4())
        )

        # Add to buffer
        self._buffer.append(event)

        # Flush if buffer is full
        if len(self._buffer) >= self._buffer_size:
            await self._flush_buffer()

        return event

    async def log_tool_call(
        self,
        tool_id: str,
        parameters: Dict[str, Any],
        context: Dict[str, Any],
        result: Dict[str, Any]
    ) -> AuditEvent:
        """Convenience method for logging tool executions."""
        # Redact PII from parameters in the log
        redacted_params = self._redact_pii(parameters)

        return await self.log(
            event_type=AuditEventType.TOOL_EXECUTED,
            tool_id=tool_id,
            session_id=context.get("session_id"),
            user_id=context.get("user_id", "system"),
            user_role=context.get("user_role", "unknown"),
            clinic_id=context.get("clinic_id", "unknown"),
            patient_id=context.get("patient_id"),
            request_data={"parameters": redacted_params},
            response_data=result,
            correlation_id=context.get("correlation_id")
        )

    async def _flush_buffer(self) -> None:
        """Flush buffered events to persistent store."""
        if not self._buffer:
            return

        events = self._buffer[:]
        self._buffer = []

        # Bulk insert to event store
        await self.event_store.bulk_insert_events([
            event.to_dict() for event in events
        ])

    def _redact_pii(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Redact PII from logged parameters."""
        redacted = {}
        pii_keys = {"ssn", "dob", "address", "phone", "email", "name",
                    "patient_name", "guardian_name"}
        for key, value in data.items():
            if any(pii_key in key.lower() for pii_key in pii_keys):
                redacted[key] = "[REDACTED]"
            else:
                redacted[key] = value
        return redacted

    async def query_events(
        self,
        clinic_id: Optional[str] = None,
        user_id: Optional[str] = None,
        tool_id: Optional[str] = None,
        event_type: Optional[AuditEventType] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[Dict]:
        """Query audit events with filters."""
        return await self.event_store.query_events(
            clinic_id=clinic_id,
            user_id=user_id,
            tool_id=tool_id,
            event_type=event_type.value if event_type else None,
            start_time=start_time,
            end_time=end_time,
            limit=limit,
            offset=offset
        )

    async def get_compliance_report(
        self,
        clinic_id: str,
        start_time: datetime,
        end_time: datetime
    ) -> Dict[str, Any]:
        """
        Generate a compliance report for a clinic.
        Includes tool usage, approval rates, emergency bypasses, etc.
        """
        events = await self.query_events(
            clinic_id=clinic_id,
            start_time=start_time,
            end_time=end_time,
            limit=10000
        )

        total_calls = len([e for e in events if e.get("event_type") == "tool.executed"])
        failed_calls = len([e for e in events if e.get("event_type") == "tool.failed"])
        approvals_requested = len([e for e in events if e.get("event_type") == "approval.requested"])
        approvals_granted = len([e for e in events if e.get("event_type") == "approval.granted"])
        emergency_bypasses = len([e for e in events if e.get("event_type") == "emergency.bypass"])
        permission_denials = len([e for e in events if e.get("event_type") == "permission.denied"])

        return {
            "clinic_id": clinic_id,
            "period": {"start": start_time.isoformat(), "end": end_time.isoformat()},
            "total_tool_calls": total_calls,
            "failed_calls": failed_calls,
            "failure_rate": failed_calls / total_calls if total_calls > 0 else 0,
            "approvals_requested": approvals_requested,
            "approvals_granted": approvals_granted,
            "approval_rate": approvals_granted / approvals_requested if approvals_requested > 0 else 0,
            "emergency_bypasses": emergency_bypasses,
            "permission_denials": permission_denials,
            "generated_at": datetime.utcnow().isoformat(),
        }
```

### 3.7 Rate Limiting & Circuit Breakers

```python
# rate_limiter.py
import asyncio
from dataclasses import dataclass
from typing import Dict, Optional
from datetime import datetime, timedelta
from enum import Enum

class CircuitState(Enum):
    CLOSED = "closed"       # Normal operation
    OPEN = "open"           # Failing, rejecting requests
    HALF_OPEN = "half_open"  # Testing if recovered

@dataclass
class RateLimitWindow:
    """Rate limit tracking window."""
    tool_id: str
    user_id: str
    window_start: datetime
    request_count: int = 0

@dataclass
class CircuitBreakerState:
    """Circuit breaker state for a tool."""
    tool_id: str
    state: CircuitState
    failure_count: int = 0
    last_failure_time: Optional[datetime] = None
    success_count_half_open: int = 0
    last_state_change: datetime = field(default_factory=datetime.utcnow)


class RateLimiter:
    """
    Per-tool rate limiting with sliding window algorithm.
    """

    def __init__(self, redis_client, config=None):
        self.redis = redis_client
        self.config = config or {}
        self._default_limit = config.get("default_rate_limit", {
            "requests": 60,
            "per_seconds": 60
        })

    async def check_rate_limit(
        self,
        tool_id: str,
        user_id: str,
        custom_limit: Optional[Dict] = None
    ) -> bool:
        """
        Check if request is within rate limit.
        Returns True if allowed, False if rate limited.
        """
        limit = custom_limit or self._default_limit
        window_size = limit.get("per_seconds", 60)
        max_requests = limit.get("requests", 60)

        key = f"ratelimit:{tool_id}:{user_id}"
        now = datetime.utcnow().timestamp()

        # Use Redis sorted set for sliding window
        pipe = self.redis.pipeline()

        # Remove old entries outside the window
        pipe.zremrangebyscore(key, 0, now - window_size)

        # Count current entries in window
        pipe.zcard(key)

        # Add current request
        pipe.zadd(key, {str(now): now})

        # Set expiry on the key
        pipe.expire(key, window_size)

        results = await pipe.execute()
        current_count = results[1]  # zcard result

        return current_count < max_requests


class CircuitBreaker:
    """
    Circuit breaker pattern for failing tools.
    Prevents cascading failures and allows recovery.
    """

    def __init__(self, redis_client, config=None):
        self.redis = redis_client
        self.config = config or {}
        self._states: Dict[str, CircuitBreakerState] = {}
        self._default_config = {
            "failure_threshold": 5,
            "recovery_timeout_seconds": 60,
            "half_open_max_calls": 2,
            "success_threshold": 2,
        }

    async def can_execute(self, tool_id: str) -> bool:
        """Check if tool can be executed based on circuit state."""
        state = await self._get_state(tool_id)

        if state.state == CircuitState.CLOSED:
            return True

        if state.state == CircuitState.OPEN:
            # Check if recovery timeout has elapsed
            elapsed = (datetime.utcnow() - state.last_state_change).total_seconds()
            if elapsed >= self._default_config["recovery_timeout_seconds"]:
                # Transition to half-open
                state.state = CircuitState.HALF_OPEN
                state.success_count_half_open = 0
                state.last_state_change = datetime.utcnow()
                await self._persist_state(state)
                return True
            return False

        if state.state == CircuitState.HALF_OPEN:
            return state.success_count_half_open < self._default_config["half_open_max_calls"]

        return True

    async def record_success(self, tool_id: str) -> None:
        """Record a successful tool execution."""
        state = await self._get_state(tool_id)

        if state.state == CircuitState.HALF_OPEN:
            state.success_count_half_open += 1
            if state.success_count_half_open >= self._default_config["success_threshold"]:
                # Close the circuit
                state.state = CircuitState.CLOSED
                state.failure_count = 0
                state.last_state_change = datetime.utcnow()

        await self._persist_state(state)

    async def record_failure(self, tool_id: str) -> None:
        """Record a failed tool execution."""
        state = await self._get_state(tool_id)
        state.failure_count += 1
        state.last_failure_time = datetime.utcnow()

        if state.state == CircuitState.HALF_OPEN:
            # Open the circuit again
            state.state = CircuitState.OPEN
            state.last_state_change = datetime.utcnow()
        elif state.state == CircuitState.CLOSED:
            if state.failure_count >= self._default_config["failure_threshold"]:
                state.state = CircuitState.OPEN
                state.last_state_change = datetime.utcnow()

        await self._persist_state(state)

    async def _get_state(self, tool_id: str) -> CircuitBreakerState:
        """Get circuit breaker state for a tool."""
        cached = await self.redis.get(f"circuit:{tool_id}")
        if cached:
            data = json.loads(cached)
            return CircuitBreakerState(
                tool_id=tool_id,
                state=CircuitState(data["state"]),
                failure_count=data.get("failure_count", 0),
                last_failure_time=datetime.fromisoformat(data["last_failure_time"]) if data.get("last_failure_time") else None,
                success_count_half_open=data.get("success_count_half_open", 0),
                last_state_change=datetime.fromisoformat(data["last_state_change"])
            )

        return CircuitBreakerState(
            tool_id=tool_id,
            state=CircuitState.CLOSED
        )

    async def _persist_state(self, state: CircuitBreakerState) -> None:
        """Persist circuit breaker state to Redis."""
        data = {
            "state": state.state.value,
            "failure_count": state.failure_count,
            "last_failure_time": state.last_failure_time.isoformat() if state.last_failure_time else None,
            "success_count_half_open": state.success_count_half_open,
            "last_state_change": state.last_state_change.isoformat(),
        }
        await self.redis.setex(
            f"circuit:{state.tool_id}",
            3600,  # 1 hour expiry
            json.dumps(data)
        )
```

---

## 4. Telegram Integration

### 4.1 Architecture Overview

```
+------------------------------------------------------------------+
|                     TELEGRAM INTEGRATION                          |
|                                                                   |
|  +------------------+  +------------------+  +-----------------+ |
|  |  Telegram API    |  |  Webhook Server  |  |  Polling Loop   | |
|  |  (Bot API)       |  |  (FastAPI)       |  |  (Fallback)     | |
|  +--------+---------+  +--------+---------+  +--------+--------+ |
|           |                     |                      |         |
+-----------v---------------------v----------------------v---------+
            |                     |                      |
+-----------v---------------------v----------------------v---------+
|                    MESSAGE PROCESSING PIPELINE                    |
|                                                                   |
|  +------------------+  +------------------+  +-----------------+ |
|  |  Message Router  |  |  Command Parser  |  |  File Handler   | |
|  |  (Intent-based)  |  |  (/start, /help) |  |  (Documents)    | |
|  +--------+---------+  +--------+---------+  +--------+--------+ |
|           |                     |                      |         |
|           v                     v                      v         |
|  +-----------------------------------------------------------+  |
|  |               HERMES ORCHESTRATION CORE                    |  |
|  |  (Routes to appropriate agent based on message content)    |  |
|  +-----------------------------------------------------------+  |
|           |                                                      |
|  +--------v--------------------------------------------------+   |
|  |              RESPONSE PIPELINE                             |   |
|  |  +----------------+  +----------------+  +-------------+  |   |
|  |  |  Text Response |  |  Inline Keybd  |  |  File Send  |  |   |
|  |  |  (Markdown)    |  |  (Approvals)   |  |  (Results)  |  |   |
|  |  +----------------+  +----------------+  +-------------+  |   |
|  +-----------------------------------------------------------+   |
+------------------------------------------------------------------+
```

### 4.2 Bot API Architecture

```python
# telegram_bot.py
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Callable, Any
from enum import Enum
from datetime import datetime
import asyncio
import json
import logging

logger = logging.getLogger(__name__)

class ChatType(Enum):
    PRIVATE = "private"
    GROUP = "group"
    SUPERGROUP = "supergroup"
    CHANNEL = "channel"

class MessageType(Enum):
    TEXT = "text"
    COMMAND = "command"
    DOCUMENT = "document"
    PHOTO = "photo"
    VOICE = "voice"
    VIDEO = "video"
    LOCATION = "location"
    CONTACT = "contact"
    CALLBACK = "callback_query"

@dataclass
class TelegramMessage:
    """Normalized Telegram message."""
    message_id: int
    chat_id: int
    chat_type: ChatType
    user_id: int
    user_name: str
    user_role: str = "patient"  # Mapped from clinic system
    text: str = ""
    message_type: MessageType = MessageType.TEXT
    command: Optional[str] = None
    command_args: Optional[str] = None
    file_id: Optional[str] = None
    file_name: Optional[str] = None
    mime_type: Optional[str] = None
    callback_data: Optional[str] = None
    timestamp: datetime = field(default_factory=datetime.utcnow)
    metadata: Dict[str, Any] = field(default_factory=dict)

    @property
    def is_private(self) -> bool:
        return self.chat_type == ChatType.PRIVATE

    @property
    def is_group(self) -> bool:
        return self.chat_type in (ChatType.GROUP, ChatType.SUPERGROUP)


class TelegramBot:
    """
    Clinical AI Telegram Bot with Hermes-OpenClaw integration.
    Handles routing, command processing, file handling, and approvals.
    """

    def __init__(
        self,
        token: str,
        router: Router,
        orchestrator: WorkflowOrchestrator,
        session_manager: SessionManager,
        approval_service: Any,
        config: Optional[Dict] = None
    ):
        self.token = token
        self.router = router
        self.orchestrator = orchestrator
        self.session_manager = session_manager
        self.approval_service = approval_service
        self.config = config or {}

        self._command_handlers: Dict[str, Callable] = {}
        self._callback_handlers: Dict[str, Callable] = {}
        self._message_handlers: List[Callable] = []
        self._running = False

        self._register_default_commands()

    def _register_default_commands(self) -> None:
        """Register default bot commands."""
        self._command_handlers["/start"] = self._cmd_start
        self._command_handlers["/help"] = self._cmd_help
        self._command_handlers["/book"] = self._cmd_book
        self._command_handlers["/cancel"] = self._cmd_cancel
        self._command_handlers["/results"] = self._cmd_results
        self._command_handlers["/profile"] = self._cmd_profile
        self._command_handlers["/emergency"] = self._cmd_emergency
        self._command_handlers["/status"] = self._cmd_status
        self._command_handlers["/approve"] = self._cmd_approve
        self._command_handlers["/history"] = self._cmd_history

        # Callback handlers
        self._callback_handlers["approve"] = self._callback_approve
        self._callback_handlers["deny"] = self._callback_deny
        self._callback_handlers["delegate"] = self._callback_delegate
        self._callback_handlers["batch_approve"] = self._callback_batch_approve

    async def handle_update(self, update: Dict[str, Any]) -> None:
        """
        Process a Telegram update.
        Entry point for both webhook and polling modes.
        """
        try:
            # Extract message
            message = self._parse_update(update)
            if not message:
                return

            # Route message
            if message.message_type == MessageType.COMMAND:
                await self._handle_command(message)
            elif message.message_type == MessageType.CALLBACK:
                await self._handle_callback(message)
            elif message.message_type == MessageType.DOCUMENT:
                await self._handle_document(message)
            else:
                await self._handle_text_message(message)

        except Exception as e:
            logger.error(f"Error handling update: {e}", exc_info=True)

    def _parse_update(self, update: Dict[str, Any]) -> Optional[TelegramMessage]:
        """Parse Telegram update into normalized message."""
        if "message" in update:
            msg_data = update["message"]
            return self._parse_message(msg_data)
        elif "callback_query" in update:
            return self._parse_callback(update["callback_query"])
        return None

    def _parse_message(self, msg_data: Dict) -> TelegramMessage:
        """Parse a regular message."""
        chat = msg_data.get("chat", {})
        from_user = msg_data.get("from", {})
        text = msg_data.get("text", "")

        # Detect message type
        msg_type = MessageType.TEXT
        command = None
        command_args = None

        if text.startswith("/"):
            msg_type = MessageType.COMMAND
            parts = text.split(None, 1)
            command = parts[0].split("@")[0]  # Remove bot username
            command_args = parts[1] if len(parts) > 1 else None

        if "document" in msg_data:
            msg_type = MessageType.DOCUMENT

        # Map user to clinic role (in production, query from clinic DB)
        user_role = self._map_user_role(from_user.get("id"))

        return TelegramMessage(
            message_id=msg_data["message_id"],
            chat_id=chat["id"],
            chat_type=ChatType(chat.get("type", "private")),
            user_id=from_user.get("id"),
            user_name=from_user.get("username", from_user.get("first_name", "Unknown")),
            user_role=user_role,
            text=text,
            message_type=msg_type,
            command=command,
            command_args=command_args,
            file_id=msg_data.get("document", {}).get("file_id") if "document" in msg_data else None,
            file_name=msg_data.get("document", {}).get("file_name") if "document" in msg_data else None,
            mime_type=msg_data.get("document", {}).get("mime_type") if "document" in msg_data else None,
        )

    async def _handle_command(self, message: TelegramMessage) -> None:
        """Handle bot commands."""
        handler = self._command_handlers.get(message.command)
        if handler:
            await handler(message)
        else:
            await self._send_message(
                message.chat_id,
                f"Unknown command: {message.command}. Use /help for available commands."
            )

    async def _handle_callback(self, message: TelegramMessage) -> None:
        """Handle inline keyboard callbacks."""
        if not message.callback_data:
            return

        action, *args = message.callback_data.split(":")
        handler = self._callback_handlers.get(action)
        if handler:
            await handler(message, args)

    async def _handle_document(self, message: TelegramMessage) -> None:
        """Handle document uploads (lab results, referrals, etc)."""
        await self._send_message(
            message.chat_id,
            f"Document received: {message.file_name}\nProcessing..."
        )

        # Route to document processing agent
        session = await self._get_or_create_session(message)
        routing = await self.router.route(
            message=f"Document uploaded: {message.file_name} ({message.mime_type})",
            session_id=session.session_id,
            user_context={
                "session_id": session.session_id,
                "user_id": str(message.user_id),
                "clinic_id": session.clinic_id,
                "role": message.user_role,
            }
        )

        # Process document
        await self._send_message(
            message.chat_id,
            "Document has been forwarded to the appropriate agent for processing."
        )

    async def _handle_text_message(self, message: TelegramMessage) -> None:
        """Handle regular text messages - route through Hermes."""
        # Get or create session
        session = await self._get_or_create_session(message)

        # Add message to session
        await self.session_manager.add_message(
            session_id=session.session_id,
            role="user",
            content=message.text
        )

        # Route through Hermes
        routing = await self.router.route(
            message=message.text,
            session_id=session.session_id,
            user_context={
                "session_id": session.session_id,
                "user_id": str(message.user_id),
                "clinic_id": session.clinic_id,
                "role": message.user_role,
            },
            clinic_id=session.clinic_id,
            user_role=message.user_role
        )

        # Handle routing decision
        if routing.decision == RoutingDecision.HUMAN_ESCALATION:
            await self._send_escalation_message(message, routing)
        elif routing.decision == RoutingDecision.CLARIFICATION_NEEDED:
            await self._send_clarification_request(message, routing)
        else:
            await self._send_routing_confirmation(message, routing)

    async def _get_or_create_session(
        self,
        message: TelegramMessage
    ) -> Any:
        """Get existing session or create new one."""
        session_id = f"tg:{message.user_id}"
        session = await self.session_manager.get_session(session_id)

        if not session:
            clinic_id = self._resolve_clinic(message)
            session = await self.session_manager.create_session(
                user_id=str(message.user_id),
                clinic_id=clinic_id,
                user_role=message.user_role
            )

        return session

    def _resolve_clinic(self, message: TelegramMessage) -> str:
        """Resolve clinic from user context."""
        # In production, lookup user's clinic from clinic management system
        # For group chats, clinic may be associated with the group
        if message.is_group:
            return f"group:{message.chat_id}"
        return "default-clinic"

    def _map_user_role(self, user_id: int) -> str:
        """Map Telegram user to clinic role."""
        # In production, query from clinic user management
        # Default to patient
        return "patient"

    # ---- Command Handlers ----

    async def _cmd_start(self, message: TelegramMessage) -> None:
        """Handle /start command."""
        welcome_text = (
            "Welcome to the Clinical AI Assistant!\n\n"
            "I can help you with:\n"
            "- Booking appointments (/book)\n"
            "- Checking lab results (/results)\n"
            "- General health inquiries\n"
            "- Administrative tasks\n\n"
            "In case of emergency, please use /emergency or call 911.\n\n"
            "Your data is handled securely and in compliance with HIPAA regulations.\n"
            "Type /help for more information."
        )
        await self._send_message(message.chat_id, welcome_text)

    async def _cmd_help(self, message: TelegramMessage) -> None:
        """Handle /help command."""
        help_text = (
            "*Available Commands:*\n\n"
            "/start - Start the bot\n"
            "/help - Show this help message\n"
            "/book - Book an appointment\n"
            "/cancel - Cancel an appointment\n"
            "/results - Check lab results\n"
            "/profile - View your profile\n"
            "/emergency - Emergency information\n"
            "/status - Check system status\n"
            "/approve - Approve pending actions\n"
            "/history - View conversation history\n\n"
            "*For Clinicians:*\n"
            "/approve - Review and approve AI actions\n"
            "/batch - Batch approve multiple actions\n\n"
            "All actions requiring approval will be sent to authorized clinicians."
        )
        await self._send_message(message.chat_id, help_text, parse_mode="Markdown")

    async def _cmd_book(self, message: TelegramMessage) -> None:
        """Handle /book command."""
        session = await self._get_or_create_session(message)

        routing = await self.router.route(
            message="Book appointment",
            session_id=session.session_id,
            user_context={"session_id": session.session_id, "user_id": str(message.user_id),
                         "clinic_id": session.clinic_id, "role": message.user_role},
            clinic_id=session.clinic_id,
            user_role=message.user_role
        )

        if routing.decision == RoutingDecision.ROUTE_TO_AGENT:
            await self._send_message(
                message.chat_id,
                "I'll help you book an appointment. What type of appointment do you need?\n\n"
                "Examples:\n"
                "- General checkup\n"
                "- Follow-up visit\n"
                "- Specialist consultation\n"
                "- Lab work"
            )
        else:
            await self._send_message(
                message.chat_id,
                "I'm having trouble connecting to the scheduling system. "
                "Please try again or contact the clinic directly."
            )

    async def _cmd_emergency(self, message: TelegramMessage) -> None:
        """Handle /emergency command."""
        emergency_text = (
            "*If this is a life-threatening emergency, call 911 immediately.*\n\n"
            "*Emergency Contacts:*\n"
            "- Emergency Services: 911\n"
            "- After-Hours Clinic Line: (555) 123-4567\n"
            "- Nurse Triage: (555) 123-HELP\n\n"
            "Your message has been flagged for immediate attention. "
            "A clinician will be notified."
        )

        await self._send_message(message.chat_id, emergency_text, parse_mode="Markdown")

        # Trigger emergency escalation
        await self._escalate_to_clinician(message, reason="Emergency command invoked")

    async def _cmd_approve(self, message: TelegramMessage) -> None:
        """Handle /approve command for clinicians."""
        if message.user_role not in ["clinician", "admin"]:
            await self._send_message(
                message.chat_id,
                "This command is only available to authorized clinicians."
            )
            return

        pending = await self.approval_service.list_pending(
            clinic_id=self._resolve_clinic(message),
            approver_id=str(message.user_id)
        )

        if not pending:
            await self._send_message(message.chat_id, "No pending approvals.")
            return

        # Send approval requests with inline keyboards
        for approval in pending[:5]:  # Show max 5
            keyboard = {
                "inline_keyboard": [
                    [
                        {"text": "Approve", "callback_data": f"approve:{approval['id']}"},
                        {"text": "Deny", "callback_data": f"deny:{approval['id']}"},
                        {"text": "Delegate", "callback_data": f"delegate:{approval['id']}"}
                    ]
                ]
            }

            text = (
                f"*Approval Request #{approval['id']}*\n\n"
                f"Tool: `{approval['tool_id']}`\n"
                f"Requested by: {approval['requester_name']}\n"
                f"Patient: {approval.get('patient_id', 'N/A')}\n"
                f"Description: {approval['description']}\n\n"
                f"Requested: {approval['created_at']}"
            )

            await self._send_message(
                message.chat_id, text,
                parse_mode="Markdown",
                reply_markup=json.dumps(keyboard)
            )

    async def _cmd_status(self, message: TelegramMessage) -> None:
        """Handle /status command."""
        status_text = (
            "*System Status*\n\n"
            "All systems operational\n"
            "Response time: < 2s\n"
            "Agents online: All\n\n"
            "For technical issues, contact IT support."
        )
        await self._send_message(message.chat_id, status_text, parse_mode="Markdown")

    async def _cmd_cancel(self, message: TelegramMessage) -> None:
        await self._send_message(
            message.chat_id,
            "To cancel an appointment, please provide your appointment ID or say 'cancel my appointment'."
        )

    async def _cmd_results(self, message: TelegramMessage) -> None:
        await self._send_message(
            message.chat_id,
            "To check your lab results, please provide your patient ID or request number."
        )

    async def _cmd_profile(self, message: TelegramMessage) -> None:
        await self._send_message(
            message.chat_id,
            "Your profile information can be managed through the patient portal. "
            "Contact the clinic for assistance."
        )

    async def _cmd_history(self, message: TelegramMessage) -> None:
        await self._send_message(
            message.chat_id,
            "Your conversation history is available upon request. "
            "Contact clinic administration for access."
        )

    # ---- Callback Handlers ----

    async def _callback_approve(self, message: TelegramMessage, args: List[str]) -> None:
        """Handle approval callback."""
        if not args:
            return
        approval_id = args[0]

        result = await self.approval_service.approve(
            approval_id=approval_id,
            approver_id=str(message.user_id),
            approver_name=message.user_name
        )

        if result:
            await self._send_message(
                message.chat_id,
                f"Approved request #{approval_id}. The action will be executed."
            )
        else:
            await self._send_message(
                message.chat_id,
                f"Could not approve request #{approval_id}. It may have expired or been handled."
            )

    async def _callback_deny(self, message: TelegramMessage, args: List[str]) -> None:
        """Handle denial callback."""
        if not args:
            return
        approval_id = args[0]

        await self.approval_service.deny(
            approval_id=approval_id,
            approver_id=str(message.user_id)
        )

        await self._send_message(
            message.chat_id,
            f"Denied request #{approval_id}. The action has been cancelled."
        )

    async def _callback_delegate(self, message: TelegramMessage, args: List[str]) -> None:
        """Handle delegation callback."""
        if not args:
            return
        approval_id = args[0]

        # Show delegation options
        keyboard = {
            "inline_keyboard": [
                [{"text": "Dr. Smith", "callback_data": f"delegate_to:{approval_id}:dr_smith"}],
                [{"text": "Dr. Johnson", "callback_data": f"delegate_to:{approval_id}:dr_johnson"}],
                [{"text": "Admin Team", "callback_data": f"delegate_to:{approval_id}:admin"}],
            ]
        }

        await self._send_message(
            message.chat_id,
            "Delegate this approval to:",
            reply_markup=json.dumps(keyboard)
        )

    async def _callback_batch_approve(self, message: TelegramMessage, args: List[str]) -> None:
        """Handle batch approval callback."""
        approval_ids = args
        approved = 0
        for approval_id in approval_ids:
            result = await self.approval_service.approve(
                approval_id=approval_id,
                approver_id=str(message.user_id),
                approver_name=message.user_name
            )
            if result:
                approved += 1

        await self._send_message(
            message.chat_id,
            f"Batch approval complete: {approved}/{len(approval_ids)} approved."
        )

    # ---- Utility Methods ----

    async def _send_message(
        self,
        chat_id: int,
        text: str,
        parse_mode: Optional[str] = None,
        reply_markup: Optional[str] = None
    ) -> None:
        """Send a message via Telegram Bot API."""
        # In production, use python-telegram-bot or aiogram
        logger.info(f"[BOT -> {chat_id}]: {text[:100]}...")

    async def _send_escalation_message(
        self,
        message: TelegramMessage,
        routing: Any
    ) -> None:
        """Send escalation message to user."""
        await self._send_message(
            message.chat_id,
            "Your request has been forwarded to a human clinician for review. "
            "They will assist you shortly.\n\n"
            f"Reason: {routing.human_escalation_reason}"
        )

    async def _send_clarification_request(
        self,
        message: TelegramMessage,
        routing: Any
    ) -> None:
        """Send clarification request to user."""
        await self._send_message(
            message.chat_id,
            "I'm not quite sure what you need. Could you please clarify?\n\n"
            "You can try:\n"
            "- /book - to book an appointment\n"
            "- /results - to check results\n"
            "- /help - to see all options"
        )

    async def _send_routing_confirmation(
        self,
        message: TelegramMessage,
        routing: Any
    ) -> None:
        """Confirm routing to user."""
        await self._send_message(
            message.chat_id,
            f"Processing your request... ({routing.routing_reason})"
        )

    async def _escalate_to_clinician(
        self,
        message: TelegramMessage,
        reason: str
    ) -> None:
        """Escalate to a human clinician."""
        # In production, send to on-call clinician via Telegram
        # or pager/notification system
        logger.warning(f"ESCALATION: {reason} from user {message.user_id}")
```

### 4.3 Webhook vs Polling

```python
# telegram_server.py
from fastapi import FastAPI, Request, HTTPException
from contextlib import asynccontextmanager
import asyncio
import logging

logger = logging.getLogger(__name__)


class TelegramWebhookServer:
    """
    FastAPI-based webhook server for Telegram bot.
    Recommended for production environments.
    """

    def __init__(self, bot: TelegramBot, config: Dict):
        self.bot = bot
        self.config = config
        self.app = FastAPI(title="Clinical AI Bot Webhook")
        self._setup_routes()

    def _setup_routes(self) -> None:
        @self.app.post(f"/webhook/{self.bot.token}")
        async def webhook_handler(request: Request):
            """Handle incoming webhook from Telegram."""
            try:
                update = await request.json()
                await self.bot.handle_update(update)
                return {"status": "ok"}
            except Exception as e:
                logger.error(f"Webhook error: {e}", exc_info=True)
                raise HTTPException(status_code=500, detail="Internal error")

        @self.app.get("/health")
        async def health_check():
            return {"status": "healthy", "bot": "running"}

        @self.app.get("/metrics")
        async def metrics():
            return {"uptime": "ok", "pending_approvals": 0}


class TelegramPollingClient:
    """
    Polling-based client for Telegram bot.
    Fallback for environments without webhook support.
    """

    def __init__(self, bot: TelegramBot, config: Dict):
        self.bot = bot
        self.config = config
        self._running = False
        self._offset = 0
        self._poll_interval = config.get("poll_interval_seconds", 1)

    async def start(self) -> None:
        """Start polling for updates."""
        self._running = True
        logger.info("Starting Telegram polling client...")

        while self._running:
            try:
                updates = await self._get_updates()
                for update in updates:
                    await self.bot.handle_update(update)
                    self._offset = update["update_id"] + 1
            except Exception as e:
                logger.error(f"Polling error: {e}", exc_info=True)
                await asyncio.sleep(5)  # Back off on error

            await asyncio.sleep(self._poll_interval)

    async def stop(self) -> None:
        """Stop polling."""
        self._running = False
        logger.info("Polling client stopped")

    async def _get_updates(self) -> List[Dict]:
        """Fetch updates from Telegram API."""
        # In production, use proper Telegram API client
        return []
```

---

## 5. Tool Manifest System

### 5.1 YAML Manifest Specification

The tool manifest system uses YAML for human-readable, version-controlled tool definitions.

```yaml
# tools/scheduling.yaml
api_version: "1.0"
clinic_id: "*"  # All clinics

# ============================================================
# APPOINTMENT TOOLS
# ============================================================
tools:
  - id: appointments.book
    name: Book Appointment
    description: Book a patient appointment with a specific provider at a clinic.
    version: "2.1.0"
    category: scheduling
    owner: "scheduling-team@clinic.com"
    documentation_url: "https://docs.clinic.internal/tools/appointments.book"

    parameters:
      - name: patient_id
        type: patient_id
        description: Unique patient identifier
        required: true
        pii: true
        example: "PAT-001234"

      - name: date
        type: date
        description: Appointment date in ISO format (YYYY-MM-DD)
        required: true
        validation_regex: "^\\d{4}-\\d{2}-\\d{2}$"
        example: "2025-02-15"

      - name: time
        type: string
        description: Appointment time in HH:MM format (24h)
        required: true
        validation_regex: "^([01]?[0-9]|2[0-3]):[0-5][0-9]$"
        example: "14:30"

      - name: provider_id
        type: string
        description: Healthcare provider ID (optional - auto-assign if omitted)
        required: false
        example: "PROV-5678"

      - name: appointment_type
        type: enum
        description: Type of appointment
        required: true
        enum_values: ["general_checkup", "follow_up", "consultation", "lab_work", "urgent"]
        example: "general_checkup"

      - name: notes
        type: string
        description: Additional notes for the appointment
        required: false
        max_length: 500
        pii: true
        example: "Patient requested morning slot"

    return_schema:
      type: object
      properties:
        appointment_id:
          type: string
          description: "Generated appointment ID"
        status:
          type: string
          enum: ["confirmed", "pending", "waitlisted"]
        provider_name:
          type: string
        scheduled_time:
          type: string
          format: "date-time"
        instructions:
          type: string
      required: ["appointment_id", "status", "scheduled_time"]

    approval_required: true
    allowed_roles: ["clinician", "admin", "receptionist"]
    denied_roles: []
    audit_level: full

    rate_limit:
      requests: 30
      per_seconds: 60
      per_user: true

    timeout_seconds: 15
    retry_policy:
      max_retries: 3
      backoff_strategy: exponential
      retry_on: ["timeout", "transient_error", "rate_limit"]

    circuit_breaker:
      failure_threshold: 5
      recovery_timeout_seconds: 60
      half_open_max_calls: 2

    sandbox_config:
      type: docker
      image: "clinic-tools/scheduling:latest"
      network_access: true  # Needs to reach EHR API
      allowed_hosts: ["ehr-api.clinic.internal"]
      file_system_access: false
      memory_limit_mb: 512
      cpu_limit: 1.0

    required_consents:
      - "appointment_scheduling"

    emergency_bypass_allowed: false

    # Human approval workflow configuration
    approval_config:
      type: pre_execution          # pre_execution | post_execution | conditional
      approver_roles: ["clinician", "admin"]
      auto_approve_if:
        - condition: "requester_role == 'receptionist' AND appointment_type == 'general_checkup'"
          action: auto_approve
        - condition: "patient_risk_score == 'low' AND appointment_type == 'follow_up'"
          action: auto_approve
      timeout_minutes: 30
      escalation_chain:
        - level: 1
          timeout_minutes: 15
          notify: ["primary_clinician"]
        - level: 2
          timeout_minutes: 15
          notify: ["department_head"]
        - level: 3
          action: "auto_cancel"

---
  - id: appointments.cancel
    name: Cancel Appointment
    description: Cancel an existing patient appointment.
    version: "1.5.0"
    category: scheduling

    parameters:
      - name: appointment_id
        type: string
        description: The appointment ID to cancel
        required: true
        example: "APT-20250215-001"

      - name: reason
        type: string
        description: Reason for cancellation
        required: false
        max_length: 200
        example: "Patient request"

      - name: notify_patient
        type: boolean
        description: Whether to notify the patient of cancellation
        required: false
        default: true

    return_schema:
      type: object
      properties:
        status:
          type: string
          enum: ["cancelled", "not_found", "already_cancelled"]
        refund_eligible:
          type: boolean
        cancellation_fee:
          type: number

    approval_required: true
    allowed_roles: ["clinician", "admin", "receptionist"]
    audit_level: full

    rate_limit:
      requests: 20
      per_seconds: 60

---
  - id: appointments.query
    name: Query Appointments
    description: Search and query appointment schedules.
    version: "1.2.0"
    category: scheduling

    parameters:
      - name: patient_id
        type: patient_id
        description: Filter by patient
        required: false
        pii: true

      - name: date_from
        type: date
        description: Start date range
        required: false

      - name: date_to
        type: date
        description: End date range
        required: false

      - name: provider_id
        type: string
        description: Filter by provider
        required: false

      - name: status
        type: enum
        description: Filter by appointment status
        required: false
        enum_values: ["scheduled", "completed", "cancelled", "no_show", "all"]

    return_schema:
      type: object
      properties:
        appointments:
          type: array
          items:
            type: object
            properties:
              appointment_id: {type: string}
              patient_id: {type: string}
              date: {type: string, format: date}
              time: {type: string}
              provider: {type: string}
              status: {type: string}
              type: {type: string}

    approval_required: false
    allowed_roles: ["clinician", "admin", "receptionist"]
    audit_level: metadata          # Less sensitive - metadata only

    rate_limit:
      requests: 100
      per_seconds: 60
```

### 5.2 Manifest Validation & Loading

```python
# manifest_loader.py
import yaml
import os
import jsonschema
from pathlib import Path
from typing import Dict, List, Optional

MANIFEST_SCHEMA = {
    "type": "object",
    "required": ["tools"],
    "properties": {
        "api_version": {"type": "string"},
        "clinic_id": {"type": "string"},
        "tools": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["id", "name", "description", "version", "category", "parameters"],
                "properties": {
                    "id": {"type": "string", "pattern": "^[a-z][a-z0-9_]*\\.[a-z][a-z0-9_]*$"},
                    "name": {"type": "string", "minLength": 1, "maxLength": 100},
                    "description": {"type": "string", "minLength": 10},
                    "version": {"type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$"},
                    "category": {"type": "string"},
                    "parameters": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["name", "type", "description"],
                            "properties": {
                                "name": {"type": "string", "pattern": "^[a-z][a-z0-9_]*$"},
                                "type": {"type": "string", "enum": [
                                    "string", "integer", "float", "boolean",
                                    "date", "datetime", "array", "object", "enum", "patient_id"
                                ]},
                                "description": {"type": "string"},
                                "required": {"type": "boolean"},
                                "pii": {"type": "boolean"},
                                "example": {},
                            }
                        }
                    },
                    "approval_required": {"type": "boolean"},
                    "allowed_roles": {"type": "array", "items": {"type": "string"}},
                    "audit_level": {"type": "string", "enum": ["none", "metadata", "full", "verbose"]},
                    "rate_limit": {
                        "type": "object",
                        "properties": {
                            "requests": {"type": "integer", "minimum": 1},
                            "per_seconds": {"type": "integer", "minimum": 1},
                        }
                    },
                    "timeout_seconds": {"type": "integer", "minimum": 1, "maximum": 300},
                    "required_consents": {"type": "array", "items": {"type": "string"}},
                    "emergency_bypass_allowed": {"type": "boolean"},
                }
            }
        }
    }
}


class ManifestLoader:
    """
    Loads and validates tool manifests from YAML files.
    Supports hot-reloading and manifest versioning.
    """

    def __init__(self, manifest_dir: str, registry: ToolManifestRegistry):
        self.manifest_dir = Path(manifest_dir)
        self.registry = registry
        self._loaded_files: Dict[str, float] = {}  # file -> last modified

    async def load_all(self) -> int:
        """Load all manifest files from directory."""
        count = 0
        for yaml_file in self.manifest_dir.glob("**/*.yaml"):
            try:
                tools = await self.load_file(str(yaml_file))
                count += len(tools)
            except Exception as e:
                logger.error(f"Failed to load manifest {yaml_file}: {e}")
        return count

    async def load_file(self, file_path: str) -> List[ToolManifest]:
        """Load and validate a single manifest file."""
        with open(file_path, 'r') as f:
            data = yaml.safe_load(f)

        # Validate against schema
        jsonschema.validate(instance=data, schema=MANIFEST_SCHEMA)

        # Convert to ToolManifest objects and register
        manifests = []
        for tool_data in data.get("tools", []):
            manifest = self._convert_to_manifest(tool_data)
            await self.registry.register(manifest)
            manifests.append(manifest)

        self._loaded_files[file_path] = os.path.getmtime(file_path)
        return manifests

    def _convert_to_manifest(self, data: Dict) -> ToolManifest:
        """Convert YAML data to ToolManifest."""
        parameters = [
            ToolParameter(
                name=p["name"],
                type=ParameterType(p.get("type", "string")),
                description=p.get("description", ""),
                required=p.get("required", True),
                default=p.get("default"),
                enum_values=p.get("enum_values"),
                validation_regex=p.get("validation_regex"),
                max_length=p.get("max_length"),
                min_value=p.get("min_value"),
                max_value=p.get("max_value"),
                pii=p.get("pii", False),
                example=p.get("example"),
            )
            for p in data.get("parameters", [])
        ]

        rate_limit = data.get("rate_limit")
        if rate_limit:
            rate_limit = {
                "requests": rate_limit.get("requests", 60),
                "per_seconds": rate_limit.get("per_seconds", 60),
            }

        return ToolManifest(
            id=data["id"],
            name=data["name"],
            description=data["description"],
            version=data.get("version", "1.0.0"),
            category=data.get("category", "general"),
            parameters=parameters,
            return_schema=data.get("return_schema", {}),
            approval_required=data.get("approval_required", False),
            allowed_roles=data.get("allowed_roles", []),
            denied_roles=data.get("denied_roles", []),
            audit_level=AuditLevel(data.get("audit_level", "full")),
            rate_limit=rate_limit,
            timeout_seconds=data.get("timeout_seconds", 30),
            retry_policy=data.get("retry_policy", {
                "max_retries": 3,
                "backoff_strategy": "exponential",
                "retry_on": ["timeout", "transient_error"]
            }),
            circuit_breaker=data.get("circuit_breaker", {
                "failure_threshold": 5,
                "recovery_timeout_seconds": 60,
                "half_open_max_calls": 2
            }),
            sandbox_config=data.get("sandbox_config", {
                "type": "docker",
                "network_access": False,
                "file_system_access": False,
                "memory_limit_mb": 256,
                "cpu_limit": 0.5
            }),
            required_consents=data.get("required_consents", []),
            emergency_bypass_allowed=data.get("emergency_bypass_allowed", False),
            documentation_url=data.get("documentation_url"),
            owner=data.get("owner"),
            status=ToolStatus(data.get("status", "active")),
        )

    async def check_for_updates(self) -> List[str]:
        """Check for modified manifest files and reload."""
        updated = []
        for file_path, last_mtime in self._loaded_files.items():
            if os.path.exists(file_path):
                current_mtime = os.path.getmtime(file_path)
                if current_mtime > last_mtime:
                    await self.load_file(file_path)
                    updated.append(file_path)
        return updated
```

---

## 6. Human Approval Workflows

### 6.1 Approval Workflow Architecture

```
+------------------------------------------------------------------+
|                   HUMAN APPROVAL WORKFLOWS                        |
|                                                                   |
|  +------------------+  +------------------+  +-----------------+ |
|  |  Pre-Execution   |  |  Post-Execution  |  |  Emergency     | |
|  |  Approval        |  |  Review          |  |  Bypass        | |
|  |  (Gate before    |  |  (Review after   |  |  (Audit only)  | |
|  |   execution)     |  |   execution)     |  |                | |
|  +--------+---------+  +--------+---------+  +--------+--------+ |
|           |                     |                      |         |
+-----------v---------------------v----------------------v---------+
            |                     |                      |
+-----------v---------------------v----------------------v---------+
|                  APPROVAL STATE MACHINE                           |
|                                                                   |
|   PENDING --> NOTIFIED --> [APPROVED / DENIED / ESCALATED]       |
|      |           |                                              |
|      v           v                                              |
|   TIMEOUT    DELEGATED --> PENDING (new approver)                |
|      |                                                         |
|      v                                                         |
|   AUTO_CANCEL / ESCALATE                                       |
|                                                                   |
|  States:                                                          |
|  - PENDING:     Approval request created, awaiting notification  |
|  - NOTIFIED:    Approver has been notified                       |
|  - APPROVED:    Tool execution authorized                        |
|  - DENIED:      Tool execution rejected                          |
|  - DELEGATED:   Forwarded to another approver                    |
|  - TIMED_OUT:   Approval window expired                          |
|  - ESCALATED:   Escalated to higher authority                    |
|  - BYPASSED:    Emergency bypass (full audit)                    |
+------------------------------------------------------------------+
```

### 6.2 Approval Service Implementation

```python
# approval_service.py
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any
from enum import Enum
from datetime import datetime, timedelta
import uuid
import asyncio

class ApprovalType(Enum):
    PRE_EXECUTION = "pre_execution"
    POST_EXECUTION = "post_execution"
    EMERGENCY_BYPASS = "emergency_bypass"
    CONDITIONAL = "conditional"

class ApprovalStatus(Enum):
    PENDING = "pending"
    NOTIFIED = "notified"
    APPROVED = "approved"
    DENIED = "denied"
    DELEGATED = "delegated"
    TIMED_OUT = "timed_out"
    ESCALATED = "escalated"
    BYPASSED = "bypassed"
    CANCELLED = "cancelled"

@dataclass
class ApprovalRequest:
    """A request for human approval of a tool execution."""
    id: str
    tool_id: str
    tool_name: str
    approval_type: ApprovalType
    status: ApprovalStatus
    requester_id: str
    requester_name: str
    requester_role: str
    approver_id: Optional[str]
    approver_role: str
    clinic_id: str
    patient_id: Optional[str]
    description: str
    tool_parameters: Dict[str, Any]
    tool_context: Dict[str, Any]
    requested_at: datetime
    timeout_at: datetime
    approved_at: Optional[datetime] = None
    approved_by: Optional[str] = None
    denied_at: Optional[datetime] = None
    denied_reason: Optional[str] = None
    escalation_level: int = 0
    escalation_chain: List[Dict] = field(default_factory=list)
    delegated_to: Optional[str] = None
    delegated_by: Optional[str] = None
    batch_id: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    correlation_id: str = ""

    @property
    def is_pending(self) -> bool:
        return self.status in (ApprovalStatus.PENDING, ApprovalStatus.NOTIFIED, ApprovalStatus.DELEGATED)

    @property
    def is_resolved(self) -> bool:
        return self.status in (ApprovalStatus.APPROVED, ApprovalStatus.DENIED,
                               ApprovalStatus.TIMED_OUT, ApprovalStatus.BYPASSED)

    @property
    def time_remaining_seconds(self) -> float:
        remaining = (self.timeout_at - datetime.utcnow()).total_seconds()
        return max(remaining, 0)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "tool_id": self.tool_id,
            "tool_name": self.tool_name,
            "approval_type": self.approval_type.value,
            "status": self.status.value,
            "requester_name": self.requester_name,
            "approver_id": self.approver_id,
            "description": self.description,
            "requested_at": self.requested_at.isoformat(),
            "timeout_at": self.timeout_at.isoformat(),
            "time_remaining_seconds": self.time_remaining_seconds,
            "escalation_level": self.escalation_level,
            "batch_id": self.batch_id,
        }


@dataclass
class BatchApproval:
    """A batch of approval requests for bulk processing."""
    id: str
    clinic_id: str
    requests: List[str]  # Approval request IDs
    status: str  # pending, partially_approved, fully_approved, denied
    created_at: datetime = field(default_factory=datetime.utcnow)
    approved_count: int = 0
    denied_count: int = 0
    pending_count: int = 0


class ApprovalService:
    """
    Complete approval workflow management for clinical tool execution.
    Supports pre-execution, post-execution, emergency bypass, delegation,
    timeout handling, and batch approvals.
    """

    def __init__(
        self,
        storage,
        notification_service,
        audit_logger: AuditLogger,
        config: Optional[Dict] = None
    ):
        self.storage = storage
        self.notifications = notification_service
        self.audit = audit_logger
        self.config = config or {}
        self._default_timeout = config.get("default_timeout_minutes", 30)
        self._pending_approvals: Dict[str, ApprovalRequest] = {}
        self._approval_resolvers: Dict[str, asyncio.Future] = {}

    async def request_approval(
        self,
        tool_id: str,
        tool_name: str,
        approval_type: ApprovalType,
        requester_id: str,
        requester_name: str,
        requester_role: str,
        approver_id: Optional[str],
        approver_role: str,
        clinic_id: str,
        patient_id: Optional[str],
        description: str,
        tool_parameters: Dict[str, Any],
        tool_context: Dict[str, Any],
        timeout_minutes: Optional[int] = None,
        escalation_chain: Optional[List[Dict]] = None,
        correlation_id: str = "",
        batch_id: Optional[str] = None
    ) -> str:
        """
        Create a new approval request.

        Returns the approval request ID.
        """
        approval_id = str(uuid.uuid4())[:12]
        timeout = timeout_minutes or self._default_timeout

        request = ApprovalRequest(
            id=approval_id,
            tool_id=tool_id,
            tool_name=tool_name,
            approval_type=approval_type,
            status=ApprovalStatus.PENDING,
            requester_id=requester_id,
            requester_name=requester_name,
            requester_role=requester_role,
            approver_id=approver_id,
            approver_role=approver_role,
            clinic_id=clinic_id,
            patient_id=patient_id,
            description=description,
            tool_parameters=tool_parameters,
            tool_context=tool_context,
            requested_at=datetime.utcnow(),
            timeout_at=datetime.utcnow() + timedelta(minutes=timeout),
            escalation_chain=escalation_chain or [],
            batch_id=batch_id,
            correlation_id=correlation_id
        )

        # Store approval
        self._pending_approvals[approval_id] = request
        await self.storage.save_approval(request)

        # Log
        await self.audit.log(
            event_type=AuditEventType.APPROVAL_REQUESTED,
            tool_id=tool_id,
            session_id=tool_context.get("session_id"),
            user_id=requester_id,
            user_role=requester_role,
            clinic_id=clinic_id,
            patient_id=patient_id,
            request_data={"approval_id": approval_id, "description": description},
            correlation_id=correlation_id
        )

        # Notify approver
        await self._notify_approver(request)

        # Start timeout watcher
        asyncio.create_task(self._timeout_watcher(request))

        return approval_id

    async def approve(
        self,
        approval_id: str,
        approver_id: str,
        approver_name: str,
        notes: Optional[str] = None
    ) -> bool:
        """
        Approve a pending request.

        Returns True if approval was successful.
        """
        request = self._pending_approvals.get(approval_id)
        if not request or not request.is_pending:
            return False

        request.status = ApprovalStatus.APPROVED
        request.approved_at = datetime.utcnow()
        request.approved_by = approver_id

        # Persist
        await self.storage.update_approval(request)

        # Log
        await self.audit.log(
            event_type=AuditEventType.APPROVAL_GRANTED,
            tool_id=request.tool_id,
            session_id=request.tool_context.get("session_id"),
            user_id=approver_id,
            user_role=request.approver_role,
            clinic_id=request.clinic_id,
            patient_id=request.patient_id,
            request_data={"approval_id": approval_id, "notes": notes},
            correlation_id=request.correlation_id
        )

        # Notify original requester
        await self._notify_requester(request, approved=True)

        # Resolve any waiting futures
        if approval_id in self._approval_resolvers:
            self._approval_resolvers[approval_id].set_result({
                "approved": True,
                "approved_by": approver_id,
                "approved_at": request.approved_at.isoformat()
            })

        return True

    async def deny(
        self,
        approval_id: str,
        approver_id: str,
        reason: Optional[str] = None
    ) -> bool:
        """Deny a pending approval request."""
        request = self._pending_approvals.get(approval_id)
        if not request or not request.is_pending:
            return False

        request.status = ApprovalStatus.DENIED
        request.denied_at = datetime.utcnow()
        request.denied_reason = reason

        await self.storage.update_approval(request)

        await self.audit.log(
            event_type=AuditEventType.APPROVAL_DENIED,
            tool_id=request.tool_id,
            session_id=request.tool_context.get("session_id"),
            user_id=approver_id,
            user_role=request.approver_role,
            clinic_id=request.clinic_id,
            patient_id=request.patient_id,
            request_data={"approval_id": approval_id, "reason": reason},
            correlation_id=request.correlation_id
        )

        await self._notify_requester(request, approved=False)

        if approval_id in self._approval_resolvers:
            self._approval_resolvers[approval_id].set_result({
                "approved": False,
                "denied_by": approver_id,
                "reason": reason
            })

        return True

    async def delegate(
        self,
        approval_id: str,
        delegated_by: str,
        new_approver_id: str,
        reason: Optional[str] = None
    ) -> bool:
        """Delegate an approval to another approver."""
        request = self._pending_approvals.get(approval_id)
        if not request or not request.is_pending:
            return False

        request.delegated_by = delegated_by
        request.delegated_to = new_approver_id
        request.status = ApprovalStatus.DELEGATED

        await self.storage.update_approval(request)

        # Notify new approver
        await self._notify_approver(request, is_delegated=True)

        return True

    async def emergency_bypass(
        self,
        approval_id: str,
        bypassed_by: str,
        justification: str
    ) -> bool:
        """
        Emergency bypass an approval requirement.
        Full audit trail is preserved.
        """
        request = self._pending_approvals.get(approval_id)
        if not request:
            return False

        request.status = ApprovalStatus.BYPASSED
        request.approved_at = datetime.utcnow()
        request.approved_by = bypassed_by
        request.metadata["bypass_justification"] = justification

        await self.storage.update_approval(request)

        # Critical audit log
        await self.audit.log(
            event_type=AuditEventType.EMERGENCY_BYPASS,
            tool_id=request.tool_id,
            session_id=request.tool_context.get("session_id"),
            user_id=bypassed_by,
            user_role="emergency",
            clinic_id=request.clinic_id,
            patient_id=request.patient_id,
            request_data={
                "approval_id": approval_id,
                "justification": justification,
                "tool_id": request.tool_id,
                "patient_id": request.patient_id
            },
            correlation_id=request.correlation_id
        )

        # Notify administrators
        await self._notify_administrators(
            request,
            f"EMERGENCY BYPASS: {bypassed_by} bypassed approval for {request.tool_id}"
        )

        if approval_id in self._approval_resolvers:
            self._approval_resolvers[approval_id].set_result({
                "approved": True,
                "bypassed": True,
                "bypassed_by": bypassed_by
            })

        return True

    async def wait_for_approval(
        self,
        approval_id: str,
        timeout: int = 300
    ) -> Optional[Dict]:
        """
        Wait for an approval to be resolved.
        Returns the approval result or None on timeout.
        """
        request = self._pending_approvals.get(approval_id)
        if not request:
            return None

        if request.is_resolved:
            return {
                "approved": request.status == ApprovalStatus.APPROVED,
                "status": request.status.value
            }

        # Create future to wait on
        future = asyncio.get_event_loop().create_future()
        self._approval_resolvers[approval_id] = future

        try:
            result = await asyncio.wait_for(future, timeout=timeout)
            return result
        except asyncio.TimeoutError:
            return None
        finally:
            if approval_id in self._approval_resolvers:
                del self._approval_resolvers[approval_id]

    async def create_batch(
        self,
        approval_ids: List[str],
        clinic_id: str
    ) -> str:
        """Create a batch approval group."""
        batch_id = str(uuid.uuid4())[:12]

        batch = BatchApproval(
            id=batch_id,
            clinic_id=clinic_id,
            requests=approval_ids,
            status="pending",
            pending_count=len(approval_ids)
        )

        # Link requests to batch
        for req_id in approval_ids:
            request = self._pending_approvals.get(req_id)
            if request:
                request.batch_id = batch_id
                await self.storage.update_approval(request)

        await self.storage.save_batch(batch)
        return batch_id

    async def approve_batch(
        self,
        batch_id: str,
        approver_id: str,
        approver_name: str
    ) -> Dict:
        """Approve all pending requests in a batch."""
        batch = await self.storage.get_batch(batch_id)
        if not batch:
            return {"error": "Batch not found"}

        approved = 0
        failed = 0

        for req_id in batch.requests:
            success = await self.approve(req_id, approver_id, approver_name)
            if success:
                approved += 1
            else:
                failed += 1

        batch.approved_count = approved
        batch.status = "fully_approved" if failed == 0 else "partially_approved"
        await self.storage.update_batch(batch)

        return {
            "batch_id": batch_id,
            "approved": approved,
            "failed": failed,
            "status": batch.status
        }

    async def list_pending(
        self,
        clinic_id: Optional[str] = None,
        approver_id: Optional[str] = None,
        tool_id: Optional[str] = None,
        limit: int = 50
    ) -> List[Dict]:
        """List pending approval requests."""
        pending = [
            req for req in self._pending_approvals.values()
            if req.is_pending
            and (not clinic_id or req.clinic_id == clinic_id)
            and (not approver_id or req.approver_id == approver_id)
            and (not tool_id or req.tool_id == tool_id)
        ]
        return [req.to_dict() for req in pending[:limit]]

    async def _timeout_watcher(self, request: ApprovalRequest) -> None:
        """Watch for approval timeout and escalate."""
        while request.is_pending:
            remaining = request.time_remaining_seconds
            if remaining <= 0:
                # Timeout reached
                await self._handle_timeout(request)
                break
            # Check every 10 seconds
            await asyncio.sleep(min(10, remaining))

    async def _handle_timeout(self, request: ApprovalRequest) -> None:
        """Handle approval timeout - escalate or cancel."""
        request.escalation_level += 1

        if request.escalation_level <= len(request.escalation_chain):
            # Escalate to next level
            escalation = request.escalation_chain[request.escalation_level - 1]
            request.status = ApprovalStatus.ESCALATED
            request.timeout_at = datetime.utcnow() + timedelta(
                minutes=escalation.get("timeout_minutes", 15)
            )

            await self.audit.log(
                event_type=AuditEventType.APPROVAL_ESCALATED,
                tool_id=request.tool_id,
                user_id="system",
                user_role="system",
                clinic_id=request.clinic_id,
                request_data={
                    "approval_id": request.id,
                    "escalation_level": request.escalation_level,
                    "notify": escalation.get("notify", [])
                }
            )

            # Notify next level
            for notify_target in escalation.get("notify", []):
                await self._notify_escalation(request, notify_target)
        else:
            # Final timeout - cancel or take default action
            request.status = ApprovalStatus.TIMED_OUT
            if request.escalation_chain:
                final_action = request.escalation_chain[-1].get("action", "auto_cancel")
                if final_action == "auto_cancel":
                    request.status = ApprovalStatus.CANCELLED

        await self.storage.update_approval(request)

        if request.id in self._approval_resolvers:
            self._approval_resolvers[request.id].set_result({
                "approved": False,
                "status": request.status.value,
                "reason": "timeout"
            })

    async def _notify_approver(
        self,
        request: ApprovalRequest,
        is_delegated: bool = False
    ) -> None:
        """Send notification to approver."""
        prefix = "[DELEGATED] " if is_delegated else ""
        message = (
            f"{prefix}Approval Request #{request.id}\n\n"
            f"Tool: {request.tool_name}\n"
            f"Requested by: {request.requester_name} ({request.requester_role})\n"
            f"Description: {request.description}\n"
            f"Timeout: {request.timeout_at.isoformat()}"
        )

        await self.notifications.send(
            recipient_id=request.approver_id or "default_approver",
            message=message,
            urgency="high" if request.approval_type == ApprovalType.EMERGENCY_BYPASS else "normal"
        )

    async def _notify_requester(
        self,
        request: ApprovalRequest,
        approved: bool
    ) -> None:
        """Notify the original requester of the decision."""
        status = "APPROVED" if approved else "DENIED"
        message = (
            f"Your request for {request.tool_name} has been {status}.\n\n"
            f"Approval ID: {request.id}"
        )
        if not approved and request.denied_reason:
            message += f"\nReason: {request.denied_reason}"

        await self.notifications.send(
            recipient_id=request.requester_id,
            message=message
        )

    async def _notify_administrators(self, request: ApprovalRequest, alert: str) -> None:
        """Send alert to administrators."""
        await self.notifications.send_to_admins(
            clinic_id=request.clinic_id,
            message=alert,
            urgency="critical"
        )

    async def _notify_escalation(self, request: ApprovalRequest, target: str) -> None:
        """Notify escalation target."""
        await self.notifications.send(
            recipient_id=target,
            message=f"ESCALATED Approval #{request.id}: {request.tool_name} - Level {request.escalation_level}",
            urgency="high"
        )
```

---

## 7. Agent Memory & Profiles

### 7.1 Memory Architecture

```
+------------------------------------------------------------------+
|                     MEMORY ARCHITECTURE                           |
|                                                                   |
|  +------------------+  +------------------+  +-----------------+ |
|  |  Short-Term      |  |  Long-Term       |  |  Clinic-Level   | |
|  |  Memory          |  |  Memory          |  |  Memory         | |
|  |                  |  |                  |  |                 | |
|  |  - Conversation  |  |  - Patient       |  |  - Protocols    | |
|  |    history       |  |    preferences   |  |  - Schedules    | |
|  |  - Session       |  |  - Medical       |  |  - Templates    | |
|  |    context       |  |    history       |  |  - Guidelines   | |
|  |  - Current       |  |  - Allergies     |  |  - Policies     | |
|  |    entities      |  |  - Medications   |  |  - Staff info   | |
|  |  - Pending       |  |  - Contact       |  |                 | |
|  |    actions       |  |    preferences   |  |                 | |
|  +--------+---------+  +--------+---------+  +--------+--------+ |
|           |                     |                      |         |
|           v                     v                      v         |
|  +-----------------------------------------------------------+  |
|  |                    PRIVACY ISOLATION                       |  |
|  |                                                            |  |
|  |  Clinic A <--|isolated|-->| Clinic B (no cross-access)    |  |
|  |                                                            |  |
|  |  Patient P1 @ Clinic A  <--|isolated|-->|  Patient P1 @    |  |
|  |                                            Clinic B        |  |
|  |                                                            |  |
|  |  Enforcement:                                              |  |
|  |  - Every query includes clinic_id filter                   |  |
|  |  - Clinic-scoped encryption keys                           |  |
|  |  - Access denied if clinic_id mismatch                     |  |
|  |  - Audit log of all cross-clinic access attempts           |  |
|  +-----------------------------------------------------------+  |
+------------------------------------------------------------------+
```

### 7.2 Memory Configuration

```yaml
# memory_config.yaml
memory:
  short_term:
    storage: redis
    ttl_hours: 24
    max_messages: 100
    compression: true
    include_in_context: true

  long_term:
    storage: postgresql
    encryption: aes256
    clinic_isolation: strict
    patient_consent_required: true
    retention_years: 7
    categories:
      - patient_preferences
      - medical_history
      - communication_preferences
      - appointment_patterns

  clinic:
    storage: postgresql
    encryption: aes256
    access_roles: [clinician, admin, receptionist]
    categories:
      - protocols
      - scheduling_rules
      - provider_availability
      - staff_directory
      - emergency_procedures

  agent:
    storage: postgresql
    encryption: aes256
    per_agent_isolation: true
    categories:
      - learned_patterns
      - correction_history
      - effectiveness_metrics

  episodic:
    storage: postgresql
    encryption: aes256
    ttl_days: 180
    categories:
      - significant_events
      - escalations
      - outcomes

privacy:
  clinic_isolation_mode: strict
  cross_clinic_access: denied
  encryption_at_rest: true
  encryption_in_transit: true
  field_level_encryption:
    - ssn
    - full_name
    - address
    - phone
    - email
    - insurance_id
  audit_all_access: true
  patient_right_to_deletion: true
```

---

## 8. Governance Bridge

### 8.1 Role-to-Permission Mapping

```python
# governance_bridge.py
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set
from enum import Enum
from datetime import datetime

class ClinicRole(Enum):
    PATIENT = "patient"
    RECEPTIONIST = "receptionist"
    NURSE = "nurse"
    CLINICIAN = "clinician"
    SPECIALIST = "specialist"
    ADMIN = "admin"
    SYSTEM = "system"

class ConsentType(Enum):
    APPOINTMENT_SCHEDULING = "appointment_scheduling"
    MEDICAL_RECORDS_ACCESS = "medical_records_access"
    LAB_RESULTS_ACCESS = "lab_results_access"
    COMMUNICATION = "communication"
    DATA_SHARING = "data_sharing"
    RESEARCH_PARTICIPATION = "research_participation"

@dataclass
class GovernancePolicy:
    """A governance policy for clinical AI operations."""
    id: str
    name: str
    description: str
    clinic_id: Optional[str]  # None = global policy
    applies_to_roles: List[str]
    tool_permissions: Dict[str, str]  # tool_id -> "allow" | "deny" | "approval_required"
    max_requests_per_hour: int = 100
    requires_dual_approval: bool = False
    data_retention_days: int = 2555  # 7 years
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)


class GovernanceBridge:
    """
    Central governance layer connecting clinic roles, permissions,
    patient consent, and audit requirements.
    """

    ROLE_PERMISSIONS = {
        ClinicRole.PATIENT: {
            "allowed_tools": [
                "appointments.book",
                "appointments.cancel",
                "appointments.query",
                "results.query_own",
                "profile.view_own",
            ],
            "max_requests_per_hour": 20,
            "requires_approval_for": ["appointments.book"],
            "can_view_own_only": True,
        },
        ClinicRole.RECEPTIONIST: {
            "allowed_tools": [
                "appointments.book",
                "appointments.cancel",
                "appointments.query",
                "appointments.reschedule",
                "patients.search",
                "patients.check_in",
            ],
            "max_requests_per_hour": 200,
            "requires_approval_for": ["appointments.cancel"],
            "can_view_own_only": False,
            "clinic_scoped": True,
        },
        ClinicRole.NURSE: {
            "allowed_tools": [
                "appointments.book",
                "appointments.query",
                "vitals.record",
                "medications.query",
                "patients.view",
                "notes.add",
                "triage.assess",
            ],
            "max_requests_per_hour": 300,
            "requires_approval_for": ["medications.administer"],
            "can_view_own_only": False,
            "clinic_scoped": True,
        },
        ClinicRole.CLINICIAN: {
            "allowed_tools": [
                "*",  # All tools
            ],
            "max_requests_per_hour": 500,
            "requires_approval_for": [
                "patients.delete",
                "records.delete",
                "emergency.override",
            ],
            "can_approve_for_roles": ["receptionist", "nurse"],
            "can_view_own_only": False,
            "clinic_scoped": True,
        },
        ClinicRole.ADMIN: {
            "allowed_tools": ["*"],
            "max_requests_per_hour": 1000,
            "requires_approval_for": [],
            "can_approve_for_roles": ["*"],
            "can_view_own_only": False,
            "clinic_scoped": False,  # Cross-clinic access
        },
    }

    def __init__(self, policy_store, consent_service, audit_logger):
        self.policy_store = policy_store
        self.consent_service = consent_service
        self.audit = audit_logger

    async def check_governance(
        self,
        tool_id: str,
        user_role: str,
        clinic_id: str,
        patient_id: Optional[str] = None,
        action: str = "execute"
    ) -> Dict[str, Any]:
        """
        Comprehensive governance check combining role permissions,
        clinic scoping, and patient consent.
        """
        result = {
            "allowed": False,
            "reason": "",
            "requires_approval": False,
            "requires_consent": False,
            "missing_consents": [],
            "audit_required": True,
        }

        try:
            role = ClinicRole(user_role)
        except ValueError:
            result["reason"] = f"Unknown role: {user_role}"
            return result

        role_config = self.ROLE_PERMISSIONS.get(role)
        if not role_config:
            result["reason"] = f"No permissions configured for role: {user_role}"
            return result

        # Check tool permission
        allowed_tools = role_config["allowed_tools"]
        if "*" not in allowed_tools and tool_id not in allowed_tools:
            result["reason"] = f"Tool '{tool_id}' not allowed for role '{user_role}'"
            return result

        # Check approval requirement
        approval_tools = role_config.get("requires_approval_for", [])
        if tool_id in approval_tools or "*" in approval_tools:
            result["requires_approval"] = True

        # Check patient consent
        if patient_id:
            consent_check = await self._verify_patient_consent(
                patient_id=patient_id,
                clinic_id=clinic_id,
                tool_id=tool_id,
                user_role=user_role
            )
            if not consent_check["has_consent"]:
                result["requires_consent"] = True
                result["missing_consents"] = consent_check["missing"]
                result["reason"] = "Patient consent required"
                return result

        # All checks passed
        result["allowed"] = True
        result["reason"] = "All governance checks passed"
        return result

    async def _verify_patient_consent(
        self,
        patient_id: str,
        clinic_id: str,
        tool_id: str,
        user_role: str
    ) -> Dict[str, Any]:
        """Verify patient consent for a tool operation."""
        # Map tool to required consent types
        tool_consent_map = {
            "appointments.book": [ConsentType.APPOINTMENT_SCHEDULING],
            "appointments.cancel": [ConsentType.APPOINTMENT_SCHEDULING],
            "results.query": [ConsentType.LAB_RESULTS_ACCESS],
            "results.query_own": [ConsentType.LAB_RESULTS_ACCESS],
            "patients.view": [ConsentType.MEDICAL_RECORDS_ACCESS],
            "patients.search": [ConsentType.MEDICAL_RECORDS_ACCESS],
        }

        required_consents = tool_consent_map.get(tool_id, [])

        # Admin can bypass consent check for operational needs
        if user_role == "admin":
            return {"has_consent": True, "missing": []}

        missing = []
        for consent_type in required_consents:
            has_consent = await self.consent_service.verify_consent(
                patient_id=patient_id,
                clinic_id=clinic_id,
                consent_type=consent_type.value
            )
            if not has_consent:
                missing.append(consent_type.value)

        return {
            "has_consent": len(missing) == 0,
            "missing": missing
        }

    async def generate_compliance_report(
        self,
        clinic_id: str,
        start_date: datetime,
        end_date: datetime
    ) -> Dict[str, Any]:
        """Generate a compliance report for a clinic."""
        report = await self.audit.get_compliance_report(
            clinic_id=clinic_id,
            start_time=start_date,
            end_time=end_date
        )

        report["governance_checks"] = {
            "role_policy_count": len(self.ROLE_PERMISSIONS),
            "consent_verification_rate": report.get("approval_rate", 0),
            "emergency_bypasses": report.get("emergency_bypasses", 0),
        }

        return report
```

---

## 9. Implementation Architecture

### 9.1 System Architecture

```
+==================================================================+
|                      SYSTEM ARCHITECTURE                          |
+==================================================================+

+------------------------------------------------------------------+
|                        CLIENT LAYER                               |
|  +-------------+  +-------------+  +-------------------------+  |
|  |  Telegram   |  |  Web App    |  |  Clinic Management UI   |  |
|  |  Bot        |  |  (React)    |  |  (Admin Dashboard)      |  |
|  +-------------+  +-------------+  +-------------------------+  |
+----------------------------+-------------------------------------+
                             |
+----------------------------v-------------------------------------+
|                      API GATEWAY                                  |
|  +------------------+  +------------------+  +-----------------+ |
|  |  FastAPI         |  |  Auth (JWT/OAuth2)|  |  Rate Limiter   | |
|  |  REST API        |  |  Clinic-scoped   |  |  (Redis)        | |
|  +------------------+  +------------------+  +-----------------+ |
+----------------------------+-------------------------------------+
                             |
+----------------------------v-------------------------------------+
|                   HERMES-OPENCLAW CORE                            |
|  +------------------+  +------------------+  +-----------------+ |
|  |  Router          |  |  Orchestrator    |  |  Memory         | |
|  |  (Intent-based)  |  |  (Workflows)     |  |  Manager        | |
|  +------------------+  +------------------+  +-----------------+ |
|  +------------------+  +------------------+  +-----------------+ |
|  |  Tool Registry   |  |  Approval        |  |  Governance     | |
|  |  (Manifests)     |  |  Service         |  |  Bridge         | |
|  +------------------+  +------------------+  +-----------------+ |
|  +------------------+  +------------------+  +-----------------+ |
|  |  Permission      |  |  Sandbox         |  |  Audit Logger   | |
|  |  Engine          |  |  (Docker)        |  |  (Event Store)  | |
|  +------------------+  +------------------+  +-----------------+ |
+----------------------------+-------------------------------------+
                             |
+----------------------------v-------------------------------------+
|                     MESSAGING LAYER                               |
|  +------------------+  +------------------+  +-----------------+ |
|  |  Redis           |  |  RabbitMQ        |  |  WebSocket      | |
|  |  (Pub/Sub, Cache)|  |  (Task Queue)    |  |  (Real-time)    | |
|  +------------------+  +------------------+  +-----------------+ |
+----------------------------+-------------------------------------+
                             |
+----------------------------v-------------------------------------+
|                     STORAGE LAYER                                 |
|  +------------------+  +------------------+  +-----------------+ |
|  |  PostgreSQL      |  |  Redis           |  |  Event Store    | |
|  |  (Primary DB)    |  |  (Cache/Sessions)|  |  (Append-only)  | |
|  +------------------+  +------------------+  +-----------------+ |
+----------------------------+-------------------------------------+
                             |
+----------------------------v-------------------------------------+
|                   BACKEND INTEGRATIONS                            |
|  +------------------+  +------------------+  +-----------------+ |
|  |  EHR/EMR API     |  |  Scheduling      |  |  Lab Systems    | |
|  |  (HL7/FHIR)      |  |  API             |  |  API            | |
|  +------------------+  +------------------+  +-----------------+ |
|  +------------------+  +------------------+  +-----------------+ |
|  |  Billing API     |  |  Notification    |  |  External       | |
|  |                  |  |  (Email/SMS/TG)  |  |  AI (LLM)       | |
|  +------------------+  +------------------+  +-----------------+ |
+------------------------------------------------------------------+
```

### 9.2 Message Queue Patterns

```python
# messaging.py
import json
import asyncio
from typing import Dict, Any, Optional, Callable
from datetime import datetime

class EventBus:
    """
    Event bus using Redis Pub/Sub for inter-service communication.
    Supports event sourcing for audit trail.
    """

    def __init__(self, redis_client, config=None):
        self.redis = redis_client
        self.config = config or {}
        self._subscribers: Dict[str, list] = {}
        self._event_counter = 0

    async def publish(self, channel: str, event: Dict[str, Any]) -> None:
        """Publish an event to a channel."""
        self._event_counter += 1

        envelope = {
            "event_id": f"evt-{self._event_counter}",
            "channel": channel,
            "timestamp": datetime.utcnow().isoformat(),
            "payload": event,
        }

        await self.redis.publish(channel, json.dumps(envelope))

        # Also persist to event store
        await self.redis.xadd(
            f"stream:{channel}",
            {"data": json.dumps(envelope)},
            maxlen=10000
        )

    async def subscribe(self, channel: str, handler: Callable) -> None:
        """Subscribe to a channel."""
        if channel not in self._subscribers:
            self._subscribers[channel] = []
        self._subscribers[channel].append(handler)

    async def start_listening(self) -> None:
        """Start listening for events (background task)."""
        pubsub = self.redis.pubsub()

        channels = list(self._subscribers.keys())
        if channels:
            await pubsub.subscribe(*channels)

        async for message in pubsub.listen():
            if message["type"] == "message":
                channel = message["channel"]
                handlers = self._subscribers.get(channel, [])
                data = json.loads(message["data"])

                for handler in handlers:
                    try:
                        await handler(data["payload"])
                    except Exception as e:
                        print(f"Handler error: {e}")


class TaskQueue:
    """
    Task queue using Redis Streams for reliable async processing.
    Supports retry, dead-letter, and priority queues.
    """

    def __init__(self, redis_client, config=None):
        self.redis = redis_client
        self.config = config or {}
        self._max_retries = config.get("max_retries", 3)
        self._dead_letter_stream = "queue:dead_letter"

    async def enqueue(
        self,
        queue_name: str,
        task: Dict[str, Any],
        priority: int = 5
    ) -> str:
        """Enqueue a task with priority."""
        task_id = f"task-{datetime.utcnow().timestamp()}-{hash(str(task)) & 0xFFFFFF}"

        message = {
            "id": task_id,
            "payload": json.dumps(task),
            "priority": priority,
            "retries": 0,
            "max_retries": self._max_retries,
            "created_at": datetime.utcnow().isoformat(),
            "status": "pending"
        }

        # Use priority-based queue
        score = priority * 1000000 + int(datetime.utcnow().timestamp())
        await self.redis.zadd(f"queue:{queue_name}", {task_id: score})
        await self.redis.hset(f"task:{task_id}", mapping=message)

        return task_id

    async def dequeue(self, queue_name: str, timeout: int = 5) -> Optional[Dict]:
        """Dequeue a task (blocking with timeout)."""
        # Get highest priority task
        result = await self.redis.zpopmin(f"queue:{queue_name}")

        if not result:
            return None

        task_id, _ = result[0]
        task_data = await self.redis.hgetall(f"task:{task_id}")

        if task_data:
            await self.redis.hset(f"task:{task_id}", "status", "processing")
            return {
                "id": task_id,
                **{k: v for k, v in task_data.items()}
            }

        return None

    async def ack(self, task_id: str) -> None:
        """Acknowledge successful task completion."""
        await self.redis.hset(f"task:{task_id}", "status", "completed")

    async def nack(self, task_id: str, requeue: bool = True) -> None:
        """Negative acknowledge - retry or dead letter."""
        task_data = await self.redis.hgetall(f"task:{task_id}")
        retries = int(task_data.get("retries", 0)) + 1
        max_retries = int(task_data.get("max_retries", self._max_retries))

        if retries >= max_retries:
            # Move to dead letter queue
            await self.redis.hset(f"task:{task_id}", "status", "failed")
            await self.redis.xadd(
                self._dead_letter_stream,
                {"task_id": task_id, "data": json.dumps(task_data)}
            )
        elif requeue:
            # Requeue with incremented retry count
            await self.redis.hset(f"task:{task_id}", "retries", retries)
            await self.redis.hset(f"task:{task_id}", "status", "pending")
            queue_name = task_data.get("queue", "default")
            score = int(datetime.utcnow().timestamp()) + (retries * 60)  # Exponential backoff
            await self.redis.zadd(f"queue:{queue_name}", {task_id: score})
```

### 9.3 WebSocket for Real-Time Approvals

```python
# websocket_server.py
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from typing import Dict, Set
import json
import asyncio

class ApprovalWebSocketManager:
    """
    WebSocket manager for real-time approval notifications.
    Clinicians receive instant notifications when approval is needed.
    """

    def __init__(self):
        self._connections: Dict[str, Set[WebSocket]] = {}  # user_id -> websockets
        self._clinic_connections: Dict[str, Set[str]] = {}  # clinic_id -> user_ids

    async def connect(self, websocket: WebSocket, user_id: str, clinic_id: str, role: str):
        """Handle new WebSocket connection."""
        await websocket.accept()

        if user_id not in self._connections:
            self._connections[user_id] = set()
        self._connections[user_id].add(websocket)

        if clinic_id not in self._clinic_connections:
            self._clinic_connections[clinic_id] = set()
        self._clinic_connections[clinic_id].add(user_id)

        # Send welcome message
        await websocket.send_json({
            "type": "connected",
            "user_id": user_id,
            "clinic_id": clinic_id,
            "role": role,
            "message": "Connected to approval notification service"
        })

    async def disconnect(self, websocket: WebSocket, user_id: str, clinic_id: str):
        """Handle WebSocket disconnection."""
        if user_id in self._connections:
            self._connections[user_id].discard(websocket)
            if not self._connections[user_id]:
                del self._connections[user_id]

        if clinic_id in self._clinic_connections:
            self._clinic_connections[clinic_id].discard(user_id)

    async def send_approval_request(
        self,
        clinic_id: str,
        approval_data: Dict
    ) -> int:
        """Send approval request to all connected clinicians in a clinic."""
        sent_count = 0
        user_ids = self._clinic_connections.get(clinic_id, set())

        for user_id in user_ids:
            websockets = self._connections.get(user_id, set())
            for ws in websockets:
                try:
                    await ws.send_json({
                        "type": "approval_request",
                        "data": approval_data
                    })
                    sent_count += 1
                except Exception:
                    pass

        return sent_count

    async def send_to_user(self, user_id: str, message: Dict) -> bool:
        """Send a message to a specific user."""
        websockets = self._connections.get(user_id, set())
        for ws in websockets:
            try:
                await ws.send_json(message)
                return True
            except Exception:
                pass
        return False


# FastAPI WebSocket endpoints
app = FastAPI()
ws_manager = ApprovalWebSocketManager()

@app.websocket("/ws/approvals")
async def approval_websocket(websocket: WebSocket):
    """WebSocket endpoint for real-time approval notifications."""
    # In production, validate JWT token from query params
    user_id = websocket.query_params.get("user_id", "unknown")
    clinic_id = websocket.query_params.get("clinic_id", "default")
    role = websocket.query_params.get("role", "clinician")

    await ws_manager.connect(websocket, user_id, clinic_id, role)

    try:
        while True:
            data = await websocket.receive_json()

            if data.get("action") == "approve":
                # Handle approval via WebSocket
                approval_id = data.get("approval_id")
                # Process approval...
                await websocket.send_json({
                    "type": "approval_result",
                    "approval_id": approval_id,
                    "status": "processed"
                })

            elif data.get("action") == "heartbeat":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        await ws_manager.disconnect(websocket, user_id, clinic_id)
```

### 9.4 Retry and Dead-Letter Handling

```python
# retry_handler.py
import asyncio
from dataclasses import dataclass
from typing import Dict, Any, Optional, Callable, List
from enum import Enum
from datetime import datetime, timedelta
import random

class RetryStrategy(Enum):
    FIXED = "fixed"
    EXPONENTIAL = "exponential"
    LINEAR = "linear"
    RANDOMIZED = "randomized"

@dataclass
class RetryConfig:
    max_retries: int = 3
    base_delay_seconds: float = 1.0
    max_delay_seconds: float = 60.0
    strategy: RetryStrategy = RetryStrategy.EXPONENTIAL
    retryable_exceptions: List[type] = None
    jitter: bool = True

    def __post_init__(self):
        if self.retryable_exceptions is None:
            self.retryable_exceptions = [Exception]

    def get_delay(self, attempt: int) -> float:
        """Calculate delay for a given retry attempt."""
        if self.strategy == RetryStrategy.FIXED:
            delay = self.base_delay_seconds
        elif self.strategy == RetryStrategy.LINEAR:
            delay = self.base_delay_seconds * attempt
        elif self.strategy == RetryStrategy.EXPONENTIAL:
            delay = self.base_delay_seconds * (2 ** (attempt - 1))
        elif self.strategy == RetryStrategy.RANDOMIZED:
            max_delay = self.base_delay_seconds * (2 ** (attempt - 1))
            delay = random.uniform(self.base_delay_seconds, max_delay)
        else:
            delay = self.base_delay_seconds

        delay = min(delay, self.max_delay_seconds)

        if self.jitter:
            delay = delay * (0.5 + random.random())

        return delay


class RetryHandler:
    """
    Retry handler with dead-letter queue for failed operations.
    """

    def __init__(self, dead_letter_queue, audit_logger, config=None):
        self.dead_letter = dead_letter_queue
        self.audit = audit_logger
        self.config = config or {}

    async def execute_with_retry(
        self,
        operation: Callable,
        retry_config: RetryConfig,
        context: Dict[str, Any],
        *args,
        **kwargs
    ) -> Any:
        """
        Execute an operation with retry logic.

        Args:
            operation: The async function to execute
            retry_config: Retry configuration
            context: Context for logging (tool_id, session_id, etc.)
            *args, **kwargs: Arguments to pass to operation

        Returns:
            The result of the operation

        Raises:
            The last exception if all retries are exhausted
        """
        last_exception = None

        for attempt in range(1, retry_config.max_retries + 1):
            try:
                result = await operation(*args, **kwargs)

                if attempt > 1:
                    await self.audit.log(
                        event_type=AuditEventType.TOOL_EXECUTED,
                        tool_id=context.get("tool_id"),
                        session_id=context.get("session_id"),
                        user_id=context.get("user_id", "system"),
                        user_role=context.get("user_role", "system"),
                        clinic_id=context.get("clinic_id", "unknown"),
                        request_data={
                            "retry_attempt": attempt,
                            "operation": context.get("operation", "unknown"),
                            "status": "success_after_retry"
                        }
                    )

                return result

            except Exception as e:
                last_exception = e

                # Check if exception is retryable
                is_retryable = any(
                    isinstance(e, exc_type)
                    for exc_type in retry_config.retryable_exceptions
                )

                if not is_retryable:
                    raise

                if attempt >= retry_config.max_retries:
                    break

                delay = retry_config.get_delay(attempt)

                await self.audit.log(
                    event_type=AuditEventType.TOOL_FAILED,
                    tool_id=context.get("tool_id"),
                    session_id=context.get("session_id"),
                    user_id=context.get("user_id", "system"),
                    user_role=context.get("user_role", "system"),
                    clinic_id=context.get("clinic_id", "unknown"),
                    request_data={
                        "retry_attempt": attempt,
                        "next_retry_delay_seconds": delay,
                        "error": str(e),
                        "error_type": type(e).__name__
                    }
                )

                await asyncio.sleep(delay)

        # All retries exhausted - send to dead letter queue
        await self._send_to_dead_letter(operation, context, last_exception)

        raise last_exception

    async def _send_to_dead_letter(
        self,
        operation: Callable,
        context: Dict[str, Any],
        exception: Exception
    ) -> None:
        """Send failed operation to dead letter queue."""
        dead_letter_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "tool_id": context.get("tool_id"),
            "operation": context.get("operation"),
            "clinic_id": context.get("clinic_id"),
            "session_id": context.get("session_id"),
            "error": str(exception),
            "error_type": type(exception).__name__,
            "context": context,
        }

        await self.dead_letter.enqueue("dead_letter", dead_letter_entry)

        await self.audit.log(
            event_type=AuditEventType.TOOL_FAILED,
            tool_id=context.get("tool_id"),
            session_id=context.get("session_id"),
            user_id=context.get("user_id", "system"),
            user_role=context.get("user_role", "system"),
            clinic_id=context.get("clinic_id", "unknown"),
            request_data={
                "status": "dead_letter",
                "error": str(exception),
                "max_retries_exhausted": True
            }
        )
```

---

## 10. Code Examples & Reference Implementations

### 10.1 Complete Tool Execution Flow

```python
# complete_example.py
async def execute_tool_with_full_governance(
    tool_id: str,
    parameters: Dict[str, Any],
    context: Dict[str, Any],
    registry: ToolManifestRegistry,
    permission_engine: PermissionEngine,
    approval_service: ApprovalService,
    sandbox: ExecutionSandbox,
    audit_logger: AuditLogger,
    rate_limiter: RateLimiter,
    circuit_breaker: CircuitBreaker,
    retry_handler: RetryHandler,
    governance_bridge: GovernanceBridge
) -> Dict[str, Any]:
    """
    Complete tool execution with all governance layers.

    This is the primary execution path for any tool call in the system.
    """
    correlation_id = str(uuid.uuid4())
    start_time = datetime.utcnow()
    clinic_id = context.get("clinic_id", "unknown")
    user_id = context.get("user_id", "system")
    user_role = context.get("user_role", "unknown")
    patient_id = parameters.get("patient_id")

    try:
        # 1. Lookup tool manifest
        tool = await registry.get(tool_id)
        if not tool:
            return {"error": f"Tool '{tool_id}' not found", "status": "manifest_not_found"}

        if tool.status != ToolStatus.ACTIVE:
            return {"error": f"Tool '{tool_id}' is {tool.status.value}", "status": "tool_inactive"}

        # 2. Validate parameters
        validation_errors = tool.validate_parameters(parameters)
        if validation_errors:
            await audit_logger.log(
                event_type=AuditEventType.TOOL_FAILED,
                tool_id=tool_id,
                user_id=user_id,
                user_role=user_role,
                clinic_id=clinic_id,
                request_data={"parameters": parameters, "errors": validation_errors}
            )
            return {"error": "Validation failed", "details": validation_errors, "status": "validation_error"}

        # 3. Check permissions
        access_context = AccessContext(
            user_id=user_id,
            user_role=user_role,
            clinic_id=clinic_id,
            patient_id=patient_id,
            tool_id=tool_id,
            is_emergency=context.get("is_emergency", False)
        )
        permission_result = await permission_engine.check_access(tool, access_context)

        if permission_result.decision == PermissionDecision.DENY:
            await audit_logger.log(
                event_type=AuditEventType.PERMISSION_DENIED,
                tool_id=tool_id,
                user_id=user_id,
                user_role=user_role,
                clinic_id=clinic_id,
                request_data={"reason": permission_result.reason, "parameters": parameters}
            )
            return {"error": "Permission denied", "reason": permission_result.reason, "status": "permission_denied"}

        # 4. Check rate limit
        rate_allowed = await rate_limiter.check_rate_limit(
            tool_id=tool_id,
            user_id=user_id,
            custom_limit=tool.rate_limit
        )
        if not rate_allowed:
            await audit_logger.log(
                event_type=AuditEventType.RATE_LIMITED,
                tool_id=tool_id,
                user_id=user_id,
                user_role=user_role,
                clinic_id=clinic_id
            )
            return {"error": "Rate limit exceeded", "status": "rate_limited"}

        # 5. Check circuit breaker
        can_execute = await circuit_breaker.can_execute(tool_id)
        if not can_execute:
            return {"error": "Service temporarily unavailable (circuit breaker open)", "status": "circuit_open"}

        # 6. Handle approval requirement
        if permission_result.decision == PermissionDecision.ESCALATE or tool.approval_required:
            approval_id = await approval_service.request_approval(
                tool_id=tool_id,
                tool_name=tool.name,
                approval_type=ApprovalType.PRE_EXECUTION,
                requester_id=user_id,
                requester_name=context.get("user_name", user_id),
                requester_role=user_role,
                approver_id=context.get("approver_id"),
                approver_role="clinician",
                clinic_id=clinic_id,
                patient_id=patient_id,
                description=f"Execute {tool.name}: {json.dumps(parameters)}",
                tool_parameters=parameters,
                tool_context=context,
                timeout_minutes=30,
                correlation_id=correlation_id
            )

            # Wait for approval
            approval_result = await approval_service.wait_for_approval(
                approval_id,
                timeout=1800
            )

            if not approval_result or not approval_result.get("approved"):
                return {
                    "error": "Approval denied or timed out",
                    "approval_id": approval_id,
                    "status": "approval_denied"
                }

        # 7. Execute tool in sandbox
        execution_result = await retry_handler.execute_with_retry(
            operation=sandbox.execute,
            retry_config=RetryConfig(
                max_retries=tool.retry_policy.get("max_retries", 3),
                strategy=RetryStrategy.EXPONENTIAL,
                base_delay_seconds=1.0
            ),
            context={
                "tool_id": tool_id,
                "operation": "execute",
                "clinic_id": clinic_id,
                "session_id": context.get("session_id"),
                "user_id": user_id,
                "user_role": user_role,
            },
            tool=tool,
            parameters=parameters,
            context=context
        )

        # 8. Handle result
        if execution_result.status == ExecutionResult.SUCCESS:
            await circuit_breaker.record_success(tool_id)

            elapsed = int((datetime.utcnow() - start_time).total_seconds() * 1000)

            await audit_logger.log(
                event_type=AuditEventType.TOOL_EXECUTED,
                tool_id=tool_id,
                session_id=context.get("session_id"),
                user_id=user_id,
                user_role=user_role,
                clinic_id=clinic_id,
                patient_id=patient_id,
                request_data={"parameters": parameters},
                response_data={
                    "status": "success",
                    "execution_time_ms": elapsed
                },
                correlation_id=correlation_id
            )

            return {
                "status": "success",
                "data": execution_result.output,
                "execution_time_ms": elapsed
            }
        else:
            await circuit_breaker.record_failure(tool_id)

            await audit_logger.log(
                event_type=AuditEventType.TOOL_FAILED,
                tool_id=tool_id,
                user_id=user_id,
                user_role=user_role,
                clinic_id=clinic_id,
                request_data={"parameters": parameters},
                response_data={
                    "status": execution_result.status.value,
                    "error": execution_result.error
                },
                correlation_id=correlation_id
            )

            return {
                "status": "error",
                "error": execution_result.error,
                "error_type": execution_result.status.value
            }

    except Exception as e:
        elapsed = int((datetime.utcnow() - start_time).total_seconds() * 1000)
        await audit_logger.log(
            event_type=AuditEventType.TOOL_FAILED,
            tool_id=tool_id,
            user_id=user_id,
            user_role=user_role,
            clinic_id=clinic_id,
            request_data={"parameters": parameters},
            response_data={
                "status": "exception",
                "error": str(e),
                "execution_time_ms": elapsed
            },
            correlation_id=correlation_id
        )
        return {"status": "error", "error": str(e), "error_type": "exception"}
```

### 10.2 Database Schema

```sql
-- ============================================================
-- CLINICAL AI GOVERNANCE DATABASE SCHEMA
-- PostgreSQL with audit-focused design
-- ============================================================

-- Sessions table
CREATE TABLE sessions (
    id              BIGSERIAL PRIMARY KEY,
    session_id      VARCHAR(64) UNIQUE NOT NULL,
    user_id         VARCHAR(64) NOT NULL,
    clinic_id       VARCHAR(64) NOT NULL,
    user_role       VARCHAR(32) NOT NULL,
    patient_id      VARCHAR(64),
    current_agent_id VARCHAR(64),
    context_variables JSONB DEFAULT '{}',
    metadata        JSONB DEFAULT '{}',
    status          VARCHAR(16) DEFAULT 'active',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    last_activity   TIMESTAMPTZ DEFAULT NOW(),
    expires_at      TIMESTAMPTZ,
    ended_at        TIMESTAMPTZ,

    CONSTRAINT valid_status CHECK (status IN ('active', 'ended', 'expired', 'terminated'))
);
CREATE INDEX idx_sessions_clinic ON sessions(clinic_id);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_status ON sessions(status) WHERE status = 'active';

-- Audit events table (append-only)
CREATE TABLE audit_events (
    id              BIGSERIAL PRIMARY KEY,
    event_id        VARCHAR(64) UNIQUE NOT NULL,
    event_type      VARCHAR(64) NOT NULL,
    timestamp       TIMESTAMPTZ DEFAULT NOW(),
    tool_id         VARCHAR(128),
    session_id      VARCHAR(64),
    user_id         VARCHAR(64) NOT NULL,
    user_role       VARCHAR(32) NOT NULL,
    clinic_id       VARCHAR(64) NOT NULL,
    patient_id      VARCHAR(64),
    request_data    JSONB,
    response_data   JSONB,
    ip_address      INET,
    correlation_id  VARCHAR(64),
    metadata        JSONB DEFAULT '{}',

    CONSTRAINT immutable_row CHECK (false)  -- Enforce append-only via trigger
);
CREATE INDEX idx_audit_events_timestamp ON audit_events(timestamp);
CREATE INDEX idx_audit_events_clinic ON audit_events(clinic_id, timestamp);
CREATE INDEX idx_audit_events_tool ON audit_events(tool_id, timestamp);
CREATE INDEX idx_audit_events_correlation ON audit_events(correlation_id);
CREATE INDEX idx_audit_events_user ON audit_events(user_id, timestamp);
CREATE INDEX idx_audit_events_type ON audit_events(event_type, timestamp);

-- Tool manifests table
CREATE TABLE tool_manifests (
    id              BIGSERIAL PRIMARY KEY,
    tool_id         VARCHAR(128) UNIQUE NOT NULL,
    name            VARCHAR(100) NOT NULL,
    description     TEXT NOT NULL,
    version         VARCHAR(16) NOT NULL,
    category        VARCHAR(64) NOT NULL,
    manifest_data   JSONB NOT NULL,
    status          VARCHAR(16) DEFAULT 'active',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_manifests_category ON tool_manifests(category);

-- Approval requests table
CREATE TABLE approval_requests (
    id              BIGSERIAL PRIMARY KEY,
    approval_id     VARCHAR(16) UNIQUE NOT NULL,
    tool_id         VARCHAR(128) NOT NULL,
    approval_type   VARCHAR(32) NOT NULL,
    status          VARCHAR(32) NOT NULL,
    requester_id    VARCHAR(64) NOT NULL,
    requester_name  VARCHAR(100),
    requester_role  VARCHAR(32) NOT NULL,
    approver_id     VARCHAR(64),
    approver_role   VARCHAR(32),
    clinic_id       VARCHAR(64) NOT NULL,
    patient_id      VARCHAR(64),
    description     TEXT,
    tool_parameters JSONB,
    tool_context    JSONB,
    requested_at    TIMESTAMPTZ DEFAULT NOW(),
    timeout_at      TIMESTAMPTZ,
    approved_at     TIMESTAMPTZ,
    approved_by     VARCHAR(64),
    denied_at       TIMESTAMPTZ,
    denied_reason   TEXT,
    escalation_level INT DEFAULT 0,
    delegated_to    VARCHAR(64),
    delegated_by    VARCHAR(64),
    batch_id        VARCHAR(16),
    correlation_id  VARCHAR(64),
    metadata        JSONB DEFAULT '{}'
);
CREATE INDEX idx_approvals_status ON approval_requests(status) WHERE status IN ('pending', 'notified', 'delegated');
CREATE INDEX idx_approvals_clinic ON approval_requests(clinic_id);
CREATE INDEX idx_approvals_requester ON approval_requests(requester_id);
CREATE INDEX idx_approvals_batch ON approval_requests(batch_id);

-- Memory entries table
CREATE TABLE memory_entries (
    id              BIGSERIAL PRIMARY KEY,
    entry_id        VARCHAR(32) UNIQUE NOT NULL,
    memory_type     VARCHAR(32) NOT NULL,
    key             VARCHAR(256) NOT NULL,
    value           JSONB NOT NULL,
    clinic_id       VARCHAR(64),
    patient_id      VARCHAR(64),
    agent_id        VARCHAR(64),
    privacy_level   VARCHAR(32) DEFAULT 'clinic_scoped',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    expires_at      TIMESTAMPTZ,
    access_count    INT DEFAULT 0,
    last_accessed   TIMESTAMPTZ,
    source          VARCHAR(32) DEFAULT 'agent',
    confidence      FLOAT DEFAULT 1.0,
    tags            VARCHAR(64)[]
);
CREATE INDEX idx_memory_clinic ON memory_entries(clinic_id, memory_type);
CREATE INDEX idx_memory_patient ON memory_entries(patient_id, memory_type);
CREATE INDEX idx_memory_key ON memory_entries(key, memory_type);
CREATE INDEX idx_memory_expires ON memory_entries(expires_at) WHERE expires_at IS NOT NULL;

-- Agent profiles table
CREATE TABLE agent_profiles (
    id              BIGSERIAL PRIMARY KEY,
    agent_id        VARCHAR(64) UNIQUE NOT NULL,
    name            VARCHAR(100) NOT NULL,
    version         VARCHAR(16) NOT NULL,
    domain          VARCHAR(64) NOT NULL,
    description     TEXT,
    profile_data    JSONB NOT NULL,
    status          VARCHAR(16) DEFAULT 'active',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_agents_domain ON agent_profiles(domain);
CREATE INDEX idx_agents_status ON agent_profiles(status);

-- Patient consent table
CREATE TABLE patient_consents (
    id              BIGSERIAL PRIMARY KEY,
    patient_id      VARCHAR(64) NOT NULL,
    clinic_id       VARCHAR(64) NOT NULL,
    consent_type    VARCHAR(64) NOT NULL,
    granted         BOOLEAN NOT NULL,
    granted_at      TIMESTAMPTZ,
    granted_by      VARCHAR(64),
    revoked_at      TIMESTAMPTZ,
    revoked_by      VARCHAR(64),
    expires_at      TIMESTAMPTZ,
    metadata        JSONB DEFAULT '{}',

    UNIQUE(patient_id, clinic_id, consent_type)
);
CREATE INDEX idx_consents_patient ON patient_consents(patient_id, clinic_id);

-- Circuit breaker state table
CREATE TABLE circuit_breaker_states (
    id              BIGSERIAL PRIMARY KEY,
    tool_id         VARCHAR(128) UNIQUE NOT NULL,
    state           VARCHAR(16) NOT NULL,
    failure_count   INT DEFAULT 0,
    last_failure_at TIMESTAMPTZ,
    success_count_half_open INT DEFAULT 0,
    last_state_change TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Conversation archive table
CREATE TABLE conversation_archives (
    id              BIGSERIAL PRIMARY KEY,
    session_id      VARCHAR(64) NOT NULL,
    clinic_id       VARCHAR(64) NOT NULL,
    user_id         VARCHAR(64) NOT NULL,
    conversation_history JSONB NOT NULL,
    archived_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_archive_session ON conversation_archives(session_id);
CREATE INDEX idx_archive_archived ON conversation_archives(archived_at);

-- Event store streams (for event sourcing)
CREATE TABLE event_streams (
    id              BIGSERIAL PRIMARY KEY,
    stream_name     VARCHAR(128) NOT NULL,
    event_id        VARCHAR(64) NOT NULL,
    event_type      VARCHAR(64) NOT NULL,
    event_data      JSONB NOT NULL,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(stream_name, event_id)
);
CREATE INDEX idx_event_streams_name ON event_streams(stream_name, created_at);

-- Dead letter queue table
CREATE TABLE dead_letter_queue (
    id              BIGSERIAL PRIMARY KEY,
    task_id         VARCHAR(64) NOT NULL,
    queue_name      VARCHAR(64) NOT NULL,
    task_data       JSONB NOT NULL,
    error           TEXT NOT NULL,
    error_type      VARCHAR(64),
    retry_count     INT DEFAULT 0,
    clinic_id       VARCHAR(64),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    last_retry_at   TIMESTAMPTZ
);
CREATE INDEX idx_dlq_created ON dead_letter_queue(created_at);
```

---

## 11. Compliance, Security & Governance

### 11.1 HIPAA Compliance Matrix

| Requirement | Implementation | Status |
|-------------|---------------|--------|
| Access Controls | Role-based + ABAC permission engine | Implemented |
| Audit Controls | Immutable append-only audit log | Implemented |
| Integrity | Checksums on all audit events | Implemented |
| Transmission Security | TLS 1.3 for all communications | Required |
| Data Encryption at Rest | AES-256 for PHI in database | Required |
| Data Encryption in Transit | TLS 1.3 + mTLS between services | Required |
| Minimum Necessary | Field-level access control on tool manifests | Implemented |
| Patient Rights | Consent verification before data access | Implemented |
| Breach Notification | Real-time alerts on unauthorized access | Implemented |

### 11.2 GDPR Compliance Matrix

| Requirement | Implementation | Status |
|-------------|---------------|--------|
| Lawful Basis | Consent verification for all patient data access | Implemented |
| Data Minimization | Minimum necessary principle in tool parameters | Implemented |
| Right to Access | Patient can view all data through results.query_own | Implemented |
| Right to Rectification | Update endpoints for patient data | Required |
| Right to Erasure | patient_id anonymization with retention policy | Required |
| Right to Portability | FHIR-compatible data export | Required |
| Data Protection by Design | Privacy levels in memory system | Implemented |
| Data Breach Notification | Automated alerts on security events | Implemented |

### 11.3 Clinical Governance Framework

```
+------------------------------------------------------------------+
|               CLINICAL GOVERNANCE FRAMEWORK                       |
|                                                                   |
|  LAYER 1: ORGANIZATIONAL                                          |
|  - Chief Medical Officer oversight                                |
|  - Clinical AI Ethics Committee                                   |
|  - Risk management procedures                                     |
|  - Training and competency requirements                           |
|                                                                   |
|  LAYER 2: TECHNICAL                                               |
|  - All clinical actions require traceable approval                |
|  - Human-in-the-loop for all patient-impacting decisions          |
|  - Emergency bypass with mandatory audit and review               |
|  - Model performance monitoring and drift detection               |
|  - Regular safety audits and penetration testing                  |
|                                                                   |
|  LAYER 3: OPERATIONAL                                             |
|  - Change management for tool manifest updates                    |
|  - Incident response procedures                                   |
|  - Business continuity and disaster recovery                      |
|  - Vendor management and data processing agreements               |
|                                                                   |
|  LAYER 4: COMPLIANCE                                              |
|  - HIPAA, GDPR, state regulations                                 |
|  - Regular compliance audits                                      |
|  - Documentation and evidence retention                           |
|  - Breach notification procedures                                 |
+------------------------------------------------------------------+
```

### 11.4 Security Checklist

- [x] All tool executions require authentication
- [x] Role-based access control with principle of least privilege
- [x] Every tool call is logged to immutable audit trail
- [x] Patient consent verified before data access
- [x] Clinic-level data isolation enforced
- [x] Human approval required for sensitive operations
- [x] Emergency bypass available with full audit trail
- [x] Rate limiting prevents abuse
- [x] Circuit breakers prevent cascading failures
- [x] Sandboxed tool execution prevents unauthorized access
- [x] Parameter validation prevents injection attacks
- [x] PII redaction in logs
- [ ] End-to-end encryption for all data
- [ ] Regular security audits
- [ ] Penetration testing
- [ ] Vulnerability management program
- [ ] Incident response plan

---

## 12. Implementation Roadmap & Milestones

### Phase 1: Foundation (Weeks 1-4)

| Week | Deliverable | Priority |
|------|------------|----------|
| 1 | Database schema deployment | Critical |
| 1 | Core data models and types | Critical |
| 2 | Tool manifest registry with YAML loading | Critical |
| 2 | Parameter validation engine | Critical |
| 3 | Permission engine (RBAC + ABAC) | Critical |
| 3 | Audit logger with immutable event store | Critical |
| 4 | Basic Telegram bot skeleton | Critical |
| 4 | Redis integration for sessions/cache | Critical |

### Phase 2: Core Features (Weeks 5-8)

| Week | Deliverable | Priority |
|------|------------|----------|
| 5 | Intent-based routing engine | Critical |
| 5 | Agent profile registry | Critical |
| 6 | Human approval workflow system | Critical |
| 6 | Pre-execution approval with Telegram inline keyboards | Critical |
| 7 | Tool execution sandbox (Docker) | High |
| 7 | Rate limiting and circuit breakers | High |
| 8 | Memory management (short-term + long-term) | High |
| 8 | Session state persistence | High |

### Phase 3: Integration (Weeks 9-12)

| Week | Deliverable | Priority |
|------|------------|----------|
| 9 | Telegram webhook server | High |
| 9 | Message routing and command handling | High |
| 10 | Multi-agent orchestration workflows | High |
| 10 | Cross-agent context sharing | Medium |
| 11 | EHR/EMR API integration | High |
| 11 | Scheduling API integration | High |
| 12 | WebSocket for real-time approvals | Medium |
| 12 | Governance bridge and compliance reporting | Medium |

### Phase 4: Advanced Features (Weeks 13-16)

| Week | Deliverable | Priority |
|------|------------|----------|
| 13 | Post-execution review workflows | Medium |
| 13 | Batch approvals | Medium |
| 14 | Delegation chains with timeout handling | Medium |
| 14 | Emergency bypass with audit trail | Medium |
| 15 | Retry handler with dead-letter queue | Medium |
| 15 | Event sourcing for full audit trail | Medium |
| 16 | Comprehensive testing and load testing | High |
| 16 | Security audit and penetration testing | Critical |

### Phase 5: Production Readiness (Weeks 17-20)

| Week | Deliverable | Priority |
|------|------------|----------|
| 17 | Monitoring and alerting setup | Critical |
| 17 | Performance optimization | High |
| 18 | Documentation and training materials | High |
| 18 | Pilot deployment to single clinic | Critical |
| 19 | User feedback integration | High |
| 19 | Bug fixes and refinements | High |
| 20 | Full production deployment | Critical |
| 20 | Post-deployment monitoring | Critical |

---

## 13. Appendices

### Appendix A: Glossary

| Term | Definition |
|------|-----------|
| Agent | A specialized AI component that handles specific clinical tasks |
| Tool | A callable function that performs an action (e.g., book appointment) |
| Manifest | A YAML definition of a tool including parameters and permissions |
| Approval | Human authorization required before executing a sensitive tool |
| Circuit Breaker | A pattern that prevents calls to failing services |
| Rate Limiter | Controls the frequency of tool invocations |
| Dead Letter | A queue for failed operations that need manual review |
| PII | Personally Identifiable Information |
| PHI | Protected Health Information (HIPAA-regulated) |
| RBAC | Role-Based Access Control |
| ABAC | Attribute-Based Access Control |

### Appendix B: API Endpoints

```
POST   /api/v1/agents/route              - Route message to agent
GET    /api/v1/agents                    - List available agents
GET    /api/v1/agents/{id}               - Get agent profile
POST   /api/v1/tools/execute             - Execute a tool
GET    /api/v1/tools                     - List available tools
GET    /api/v1/tools/{id}/manifest       - Get tool manifest
POST   /api/v1/approvals                 - Request approval
POST   /api/v1/approvals/{id}/approve    - Approve request
POST   /api/v1/approvals/{id}/deny       - Deny request
POST   /api/v1/approvals/{id}/delegate   - Delegate approval
POST   /api/v1/approvals/batch           - Create batch approval
GET    /api/v1/approvals/pending         - List pending approvals
GET    /api/v1/audit/events              - Query audit events
GET    /api/v1/audit/compliance          - Get compliance report
GET    /api/v1/sessions/{id}             - Get session state
POST   /api/v1/sessions                  - Create session
DELETE /api/v1/sessions/{id}             - End session
GET    /api/v1/memory/{type}             - Query memory
POST   /api/v1/memory                    - Store memory
WS     /ws/approvals                     - WebSocket for approvals
```

### Appendix C: Environment Variables

```env
# Core
APP_ENV=production
CLINIC_ID=default
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/clinical_ai
REDIS_URL=redis://localhost:6379/0

# Telegram
TELEGRAM_BOT_TOKEN=YOUR_BOT_TOKEN
TELEGRAM_WEBHOOK_URL=https://your-domain.com/webhook/TOKEN
TELEGRAM_WEBHOOK_MODE=true

# LLM
LLM_PROVIDER=openai
LLM_API_KEY=YOUR_API_KEY
LLM_MODEL=gpt-4

# Security
JWT_SECRET=YOUR_JWT_SECRET
ENCRYPTION_KEY=YOUR_AES_KEY

# Audit
AUDIT_RETENTION_DAYS=2555
AUDIT_LEVEL=full

# Rate Limiting
DEFAULT_RATE_LIMIT_REQUESTS=60
DEFAULT_RATE_LIMIT_WINDOW=60

# Approval
DEFAULT_APPROVAL_TIMEOUT_MINUTES=30
MAX_APPROVAL_ESCALATION_LEVELS=3

# Sandbox
SANDBOX_ENABLED=true
SANDBOX_IMAGE=clinical-tool-runner:latest
SANDBOX_MEMORY_MB=256
```

### Appendix D: References

1. HIPAA Security Rule - 45 CFR 164.312
2. GDPR Article 25 - Data Protection by Design and by Default
3. NIST AI Risk Management Framework (AI RMF 1.0)
4. ISO/IEC 27001 Information Security Management
5. HL7 FHIR R4 Specification
6. OWASP Top 10 for LLM Applications
7. Google SRE Book - Circuit Breakers and Rate Limiting
8. Martin Fowler - Circuit Breaker Pattern
9. Telegram Bot API Documentation - https://core.telegram.org/bots/api
10. Event Sourcing Pattern - Martin Fowler

---

**Document End**

*This document was generated as a comprehensive research and architecture specification for the Hermes-OpenClaw Clinical AI Integration. It serves as the primary reference for implementation, security review, and compliance audit purposes.*

*For questions or clarifications, contact the Clinical AI Architecture Team.*

---
*Version 1.0 | January 2025 | Confidential*
