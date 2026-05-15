# AI Agent Tool Governance, Permission Systems & Safety Frameworks for Clinical AI

> **Document Type:** Comprehensive Technical Research Report
> **Version:** 1.0
> **Target Audience:** Clinical AI engineers, healthcare security architects, compliance officers, ML platform teams
> **Estimated Read Time:** 45 minutes
> **Code Examples:** Python 3.11+, TypeScript, Rego (OPA), YAML

---

## Table of Contents

1. [Permission Scope Architecture](#1-permission-scope-architecture)
2. [Tool Classification System](#2-tool-classification-system)
3. [Human Approval Gates](#3-human-approval-gates)
4. [Tool Call Audit](#4-tool-call-audit)
5. [Least Privilege Implementation](#5-least-privilege-implementation)
6. [Revocation & Emergency Controls](#6-revocation--emergency-controls)
7. [Read/Write Separation](#7-readwrite-separation)
8. [Technical Implementation](#8-technical-implementation)
9. [Appendices](#9-appendices)

---

## Executive Summary

Clinical AI agents operate at the intersection of high-stakes healthcare delivery and rapidly evolving autonomous capabilities. Unlike general-purpose AI agents, clinical agents interact with protected health information (PHI), influence patient care workflows, and can directly or indirectly affect clinical outcomes. Tool governance -- the systematic control over which tools an AI agent can invoke, under what conditions, with what oversight -- is not merely an operational concern but a patient safety imperative.

This report provides a comprehensive framework for implementing robust tool governance in clinical AI systems. Drawing from established security paradigms (NIST SP 800-53, HIPAA Security Rule, IEC 62304), modern policy-as-code approaches (Open Policy Agent, Casbin), and emerging standards for AI safety (ISO/IEC 23053, NIST AI RMF), we present actionable architectures, code implementations, and operational procedures.

**Key Findings:**
- A five-tier tool classification system (Read-Only through Forbidden Autonomous) provides the foundation for all governance decisions
- Policy-as-code with Open Policy Agent (OPA) or Casbin enables dynamic, auditable permission management
- Multi-layer approval gates with configurable escalation paths balance safety with operational efficiency
- Comprehensive audit logging with tamper-proof storage is non-negotiable for clinical deployments
- Every clinical AI agent must have a hardware-equivalent "kill switch" with sub-second response times

---

## 1. Permission Scope Architecture

### 1.1 Overview

Permission scope architecture defines the structural framework for controlling what actions an AI agent can perform. In clinical environments, this architecture must accommodate complex role hierarchies (physicians, nurses, administrators, billing staff), dynamic contexts (emergency vs. routine care), and regulatory requirements (HIPAA minimum necessary, GDPR purpose limitation).

We examine five complementary approaches: Role-Based Access Control (RBAC), Attribute-Based Access Control (ABAC), Policy-as-Code, Just-in-Time Access, and Break-Glass procedures. In practice, clinical AI systems should implement **layered governance** combining all five.

---

### 1.2 Role-Based Access Control (RBAC)

RBAC assigns permissions based on predefined roles within the healthcare organization. It is the most widely adopted access control model in healthcare due to its simplicity and alignment with organizational structures.

#### 1.2.1 Clinical Role Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│                    CLINICAL RBAC HIERARCHY                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   SUPERUSER  │  │    SYSTEM    │  │   AUDITOR ROLE   │  │
│  │  (Platform)  │  │    ADMIN     │  │  (Read-Only All) │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
│         │                 │                     │            │
│  ┌──────┴─────────────────┴─────────────────────┴───────┐   │
│  │              CLINICAL DIRECTOR ROLE                   │   │
│  │         (Cross-department oversight)                  │   │
│  └──────┬─────────────────┬─────────────────────┬───────┘   │
│         │                 │                     │            │
│  ┌──────┴───────┐  ┌──────┴───────┐  ┌────────┴────────┐   │
│  │  ATTENDING   │  │    NURSE     │  │  ADMINISTRATOR  │   │
│  │  PHYSICIAN   │  │  PRACTITIONER│  │    (Front Desk) │   │
│  │   (MD/DO)    │  │   (RN/LPN)   │  │                 │   │
│  └──────┬───────┘  └──────┬───────┘  └────────┬────────┘   │
│         │                 │                     │            │
│  ┌──────┴───────┐  ┌──────┴───────┐  ┌────────┴────────┐   │
│  │   RESIDENT   │  │  MEDICAL     │  │   BILLING STAFF │   │
│  │  PHYSICIAN   │  │  ASSISTANT   │  │                 │   │
│  └──────────────┘  └──────────────┘  └─────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           AI AGENT ROLE (Special Construct)          │   │
│  │  - Has NO independent role assignment                │   │
│  │  - Inherits permissions from SUPERVISING CLINICIAN   │   │
│  │  - Always scoped to a SESSION with a HUMAN OWNER     │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

#### 1.2.2 RBAC Implementation Schema

```yaml
# rbac-roles.yaml
# Clinical AI Agent RBAC Configuration

roles:
  # ── Clinical Roles ─────────────────────────────────────────
  attending_physician:
    description: "Licensed physician with full clinical privileges"
    inherits: []
    tool_permissions:
      read:
        - patient_full_chart
        - lab_results
        - imaging_results
        - medication_history
        - allergy_list
        - care_plan
        - clinical_guidelines
        - schedule_all_departments
      write:
        - create_clinical_note
        - update_diagnosis
        - prescribe_medication    # Requires additional pharmacy integration auth
        - order_lab_test
        - order_imaging
        - update_care_plan
        - send_patient_message    # With clinical content - HIGH RISK
        - generate_clinical_report
      admin:
        - delegate_to_resident
        - override_agent_decision
    agent_max_classification: "high_risk_write"
    approval_required_above: "medium_risk_write"
    session_max_duration: "12h"

  resident_physician:
    description: "Physician in training, requires attending oversight"
    inherits: []
    tool_permissions:
      read:
        - patient_full_chart
        - lab_results
        - imaging_results
        - medication_history
        - allergy_list
        - care_plan
      write:
        - create_clinical_note
        - update_diagnosis         # Requires attending co-sign
        - order_lab_test           # Requires attending co-sign
        - update_care_plan         # Requires attending co-sign
      admin: []
    agent_max_classification: "medium_risk_write"
    approval_required_above: "low_risk_write"
    session_max_duration: "8h"
    requires_supervision: true
    supervisor_role: "attending_physician"

  nurse_practitioner:
    description: "Advanced practice registered nurse"
    inherits: []
    tool_permissions:
      read:
        - patient_full_chart
        - lab_results
        - medication_history
        - allergy_list
        - care_plan
        - vital_signs_history
      write:
        - create_clinical_note
        - update_vital_signs
        - update_care_plan         # Within scope of practice
        - send_patient_message     # Non-clinical content only
        - book_appointment
        - schedule_followup
        - create_patient_task
      admin:
        - delegate_to_ma
    agent_max_classification: "medium_risk_write"
    approval_required_above: "low_risk_write"
    session_max_duration: "12h"

  medical_assistant:
    description: "Clinical support staff"
    inherits: []
    tool_permissions:
      read:
        - patient_demographics
        - vital_signs_history
        - appointment_schedule
        - patient_forms
      write:
        - update_vital_signs
        - update_patient_demographics
        - send_appointment_reminder
        - update_patient_form
      admin: []
    agent_max_classification: "low_risk_write"
    approval_required_above: "read_only"
    session_max_duration: "8h"

  front_desk_admin:
    description: "Administrative and scheduling staff"
    inherits: []
    tool_permissions:
      read:
        - patient_demographics
        - appointment_schedule
        - insurance_information
        - patient_forms
        - faq_content
      write:
        - book_appointment
        - reschedule_appointment
        - cancel_appointment
        - update_insurance_info
        - send_appointment_reminder
      admin: []
    agent_max_classification: "medium_risk_write"
    approval_required_above: "read_only"
    session_max_duration: "8h"

  # ── AI-Specific Roles ──────────────────────────────────────
  ai_agent_session:
    description: "Dynamic role assigned to AI agent instances"
    inherits_from_human: true     # Critical: AI never has standalone permissions
    constraint: "Permissions are the INTERSECTION of human role and agent-specific limits"
    max_classification_override: "Never exceeds human's max_classification"
    approval_escalation: "Always routes to session owner"
    audit_multiplier: "Every action logged with human session owner attribution"

  ai_agent_readonly:
    description: "Read-only AI assistant mode"
    tool_permissions:
      read:
        - patient_summary         # De-identified where possible
        - appointment_schedule
        - faq_content
        - clinical_guidelines     # General, not patient-specific
      write: []
      admin: []
    agent_max_classification: "read_only"
    session_max_duration: "4h"
```

#### 1.2.3 RBAC Core Implementation (Python)

```python
# rbac_core.py
"""Role-Based Access Control core implementation for Clinical AI Agents."""

from __future__ import annotations

import enum
import yaml
from dataclasses import dataclass, field
from typing import Optional
from pathlib import Path
from datetime import datetime, timedelta


class ToolClassification(str, enum.Enum):
    """Five-tier tool classification system for clinical AI."""
    READ_ONLY = "read_only"
    LOW_RISK_WRITE = "low_risk_write"
    MEDIUM_RISK_WRITE = "medium_risk_write"
    HIGH_RISK_WRITE = "high_risk_write"
    FORBIDDEN_AUTONOMOUS = "forbidden_autonomous"


@dataclass(frozen=True)
class ToolPermission:
    """Individual tool permission with classification metadata."""
    tool_name: str
    classification: ToolClassification
    description: str
    requires_approval: bool = False
    approval_timeout_seconds: int = 300
    data_sensitivity: str = "phi"  # phi, pii, public, internal
    hipaa_category: str = "treatment"  # treatment, payment, healthcare_operations


@dataclass
class Role:
    """Clinical role definition with tool permissions."""
    role_id: str
    description: str
    read_tools: set[str] = field(default_factory=set)
    write_tools: dict[str, ToolClassification] = field(default_factory=dict)
    admin_tools: set[str] = field(default_factory=set)
    max_classification: ToolClassification = ToolClassification.READ_ONLY
    approval_threshold: ToolClassification = ToolClassification.LOW_RISK_WRITE
    session_max_duration: timedelta = timedelta(hours=8)
    requires_supervision: bool = False
    supervisor_role: Optional[str] = None
    inherits_from: list[str] = field(default_factory=list)

    def can_use_tool(self, tool_name: str, classification: ToolClassification) -> bool:
        """Check if role can use a tool at given classification."""
        if classification.value == ToolClassification.FORBIDDEN_AUTONOMOUS.value:
            return False  # No role can use forbidden tools autonomously
        if classification.value > self.max_classification.value:
            return False
        return tool_name in self.read_tools or tool_name in self.write_tools

    def requires_approval_for(self, classification: ToolClassification) -> bool:
        """Determine if tool at classification requires human approval."""
        return classification.value >= self.approval_threshold.value


class RBACManager:
    """Central RBAC manager for clinical AI agent permission system."""

    def __init__(self, config_path: Optional[Path] = None):
        self._roles: dict[str, Role] = {}
        self._tool_registry: dict[str, ToolPermission] = {}
        if config_path:
            self.load_from_yaml(config_path)

    def register_tool(self, permission: ToolPermission) -> None:
        """Register a tool in the permission system."""
        self._tool_registry[permission.tool_name] = permission

    def define_role(self, role: Role) -> None:
        """Define or update a role."""
        # Resolve inheritance
        resolved_tools = set(role.read_tools)
        for parent_id in role.inherits_from:
            if parent := self._roles.get(parent_id):
                resolved_tools |= parent.read_tools
        role.read_tools = resolved_tools
        self._roles[role.role_id] = role

    def load_from_yaml(self, path: Path) -> None:
        """Load RBAC configuration from YAML file."""
        with open(path) as f:
            config = yaml.safe_load(f)

        for role_id, role_def in config.get("roles", {}).items():
            role = Role(
                role_id=role_id,
                description=role_def.get("description", ""),
                read_tools=set(role_def.get("tool_permissions", {}).get("read", [])),
                write_tools={
                    t: ToolClassification(c) for c, tools in
                    role_def.get("tool_permissions", {}).get("write", {}).items()
                    for t in tools
                } if isinstance(role_def.get("tool_permissions", {}).get("write"), dict)
                else {t: ToolClassification.LOW_RISK_WRITE
                      for t in role_def.get("tool_permissions", {}).get("write", [])},
                admin_tools=set(role_def.get("tool_permissions", {}).get("admin", [])),
                max_classification=ToolClassification(
                    role_def.get("agent_max_classification", "read_only")
                ),
                approval_threshold=ToolClassification(
                    role_def.get("approval_required_above", "low_risk_write")
                ),
                session_max_duration=timedelta(
                    hours=role_def.get("session_max_duration", "8h").rstrip("h")
                ),
                requires_supervision=role_def.get("requires_supervision", False),
                supervisor_role=role_def.get("supervisor_role"),
            )
            self._roles[role_id] = role

    def evaluate_access(
        self,
        role_id: str,
        tool_name: str,
        classification: ToolClassification,
    ) -> AccessDecision:
        """Evaluate whether a role can access a tool."""
        role = self._roles.get(role_id)
        if not role:
            return AccessDecision(
                allowed=False,
                reason=f"Unknown role: {role_id}",
                requires_approval=False,
            )

        tool = self._tool_registry.get(tool_name)
        if not tool:
            return AccessDecision(
                allowed=False,
                reason=f"Unknown tool: {tool_name}",
                requires_approval=False,
            )

        # Check if tool exceeds role's maximum classification
        if classification.value > role.max_classification.value:
            return AccessDecision(
                allowed=False,
                reason=(
                    f"Tool classification {classification.value} exceeds "
                    f"role maximum {role.max_classification.value}"
                ),
                requires_approval=False,
            )

        # Check if tool requires approval
        needs_approval = role.requires_approval_for(classification)

        return AccessDecision(
            allowed=True,
            reason="Access granted by RBAC policy",
            requires_approval=needs_approval,
            approver_role=role.supervisor_role if needs_approval else None,
            approval_timeout=tool.approval_timeout_seconds if needs_approval else None,
        )


@dataclass
class AccessDecision:
    """Result of an access evaluation."""
    allowed: bool
    reason: str
    requires_approval: bool
    approver_role: Optional[str] = None
    approval_timeout: Optional[int] = None
```

---

### 1.3 Attribute-Based Access Control (ABAC)

ABAC extends RBAC by evaluating attributes of the subject (clinician), resource (patient data), action (tool call), and environment (context). ABAC is essential for clinical AI because the same clinician may need different access levels depending on whether they are the assigned provider, covering on-call, or in an emergency.

#### 1.3.1 ABAC Attribute Categories

| Category | Attributes | Examples |
|----------|-----------|----------|
| **Subject** | Role, department, credentials, training status | `role=attending`, `department=cardiology`, `board_certified=true` |
| **Resource** | Patient ID, data sensitivity, consent status | `patient_id=12345`, `sensitivity=phi`, `consent_given=true` |
| **Action** | Tool name, classification, risk level | `tool=send_patient_message`, `classification=high_risk_write` |
| **Environment** | Time, location, emergency status, device trust | `time=02:30`, `location=emergency_dept`, `emergency_override=true` |

#### 1.3.2 ABAC Policy Engine (Python)

```python
# abac_engine.py
"""Attribute-Based Access Control engine for context-aware clinical AI permissions."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Callable, Optional
from datetime import datetime, time
from enum import Enum


class EnvironmentContext(Enum):
    """Environmental contexts affecting access decisions."""
    ROUTINE = "routine"
    EMERGENCY = "emergency"
    AFTER_HOURS = "after_hours"
    ON_CALL = "on_call"
    SYSTEM_MAINTENANCE = "system_maintenance"


@dataclass
class SubjectAttributes:
    """Attributes of the clinician/user."""
    user_id: str
    role: str
    department: str
    credentials: list[str] = field(default_factory=list)
    is_board_certified: bool = False
    is_on_call: bool = False
    is_training: bool = False
    assigned_patients: list[str] = field(default_factory=list)
    custom: dict[str, Any] = field(default_factory=dict)


@dataclass
class ResourceAttributes:
    """Attributes of the patient/data resource."""
    patient_id: str
    assigned_provider: Optional[str] = None
    department: Optional[str] = None
    data_sensitivity: str = "phi"  # phi, restricted_phi, public
    consent_status: str = "active"  # active, revoked, pending
    emergency_access_allowed: bool = True
    custom: dict[str, Any] = field(default_factory=dict)


@dataclass
class ActionAttributes:
    """Attributes of the requested action."""
    tool_name: str
    classification: str
    risk_level: str = "medium"  # low, medium, high, critical
    is_autonomous: bool = True
    requires_audit: bool = True
    custom: dict[str, Any] = field(default_factory=dict)


@dataclass
class EnvironmentAttributes:
    """Environmental context attributes."""
    timestamp: datetime
    location: str = "unknown"
    device_trust_level: str = "standard"  # untrusted, standard, trusted, hardware_token
    network_zone: str = "internal"  # external, internal, dmz
    is_emergency: bool = False
    system_mode: EnvironmentContext = EnvironmentContext.ROUTINE
    custom: dict[str, Any] = field(default_factory=dict)


@dataclass
class ABACRequest:
    """Complete ABAC evaluation request."""
    subject: SubjectAttributes
    resource: ResourceAttributes
    action: ActionAttributes
    environment: EnvironmentAttributes


class ABACPolicy:
    """Individual ABAC policy rule."""

    def __init__(
        self,
        name: str,
        description: str,
        condition: Callable[[ABACRequest], bool],
        effect: str = "permit",  # permit, deny, permit_with_approval
        priority: int = 100,
    ):
        self.name = name
        self.description = description
        self.condition = condition
        self.effect = effect
        self.priority = priority

    def evaluate(self, request: ABACRequest) -> Optional[ABACDecision]:
        """Evaluate this policy against a request."""
        try:
            if self.condition(request):
                return ABACDecision(
                    effect=self.effect,
                    policy_name=self.name,
                    reason=self.description,
                    requires_approval=(self.effect == "permit_with_approval"),
                )
        except Exception:
            return None
        return None


@dataclass
class ABACDecision:
    """Result of ABAC policy evaluation."""
    effect: str  # permit, deny, permit_with_approval
    policy_name: str
    reason: str
    requires_approval: bool = False


class ABACEngine:
    """Attribute-Based Access Control policy engine."""

    def __init__(self):
        self._policies: list[ABACPolicy] = []
        self._default_decision = "deny"

    def add_policy(self, policy: ABACPolicy) -> None:
        """Add a policy to the engine."""
        self._policies.append(policy)
        self._policies.sort(key=lambda p: p.priority)

    def evaluate(self, request: ABACRequest) -> ABACDecision:
        """Evaluate all policies and return final decision."""
        decisions = []

        for policy in self._policies:
            decision = policy.evaluate(request)
            if decision:
                decisions.append(decision)
                if decision.effect == "deny":
                    # Deny overrides - return immediately
                    return decision

        if not decisions:
            return ABACDecision(
                effect=self._default_decision,
                policy_name="default",
                reason="No matching policies - default deny",
            )

        # Return highest priority decision
        return decisions[0]


# ── Pre-defined Clinical ABAC Policies ──────────────────────────────────────

def create_clinical_abac_policies() -> list[ABACPolicy]:
    """Create standard clinical ABAC policies."""
    policies = []

    # Policy 1: Assigned provider can access their patients
    policies.append(ABACPolicy(
        name="assigned_provider_access",
        description="Provider can access patients they are assigned to",
        condition=lambda r: (
            r.subject.user_id == r.resource.assigned_provider
        ),
        effect="permit",
        priority=10,
    ))

    # Policy 2: On-call provider emergency access
    policies.append(ABACPolicy(
        name="on_call_emergency_access",
        description="On-call providers can access patients in emergency",
        condition=lambda r: (
            r.subject.is_on_call
            and r.environment.is_emergency
            and r.subject.role in ("attending_physician", "resident_physician")
        ),
        effect="permit_with_approval",
        priority=20,
    ))

    # Policy 3: Department-based access
    policies.append(ABACPolicy(
        name="department_access",
        description="Same-department access with approval",
        condition=lambda r: (
            r.subject.department == r.resource.department
            and r.subject.role in ("attending_physician", "nurse_practitioner")
        ),
        effect="permit_with_approval",
        priority=30,
    ))

    # Policy 4: After-hours restriction
    policies.append(ABACPolicy(
        name="after_hours_restriction",
        description="High-risk writes restricted after hours without approval",
        condition=lambda r: (
            r.action.risk_level == "high"
            and r.environment.system_mode == EnvironmentContext.AFTER_HOURS
            and not r.subject.is_on_call
        ),
        effect="deny",
        priority=5,
    ))

    # Policy 5: Training mode restriction
    policies.append(ABACPolicy(
        name="training_mode_restriction",
        description="Residents in training cannot autonomously use high-risk tools",
        condition=lambda r: (
            r.subject.is_training
            and r.action.risk_level in ("high", "critical")
            and r.action.is_autonomous
        ),
        effect="deny",
        priority=5,
    ))

    # Policy 6: Emergency break-glass
    policies.append(ABACPolicy(
        name="emergency_break_glass",
        description="Emergency override for attending physicians",
        condition=lambda r: (
            r.environment.is_emergency
            and r.subject.role == "attending_physician"
            and r.subject.credentials  # Must have active credentials
        ),
        effect="permit",
        priority=1,  # Highest priority
    ))

    # Policy 7: Device trust level enforcement
    policies.append(ABACPolicy(
        name="device_trust_enforcement",
        description="High-risk actions require trusted device",
        condition=lambda r: (
            r.action.risk_level in ("high", "critical")
            and r.environment.device_trust_level in ("untrusted", "standard")
        ),
        effect="deny",
        priority=5,
    ))

    # Policy 8: Consent check
    policies.append(ABACPolicy(
        name="consent_required",
        description="Patient consent required for AI access",
        condition=lambda r: (
            r.resource.consent_status != "active"
            and not r.environment.is_emergency
        ),
        effect="deny",
        priority=3,
    ))

    # Policy 9: External network restriction
    policies.append(ABACPolicy(
        name="external_network_restriction",
        description="High-risk writes denied from external networks",
        condition=lambda r: (
            r.environment.network_zone == "external"
            and r.action.risk_level in ("high", "critical")
        ),
        effect="deny",
        priority=4,
    ))

    # Policy 10: Board certification requirement for autonomous high-risk
    policies.append(ABACPolicy(
        name="board_certification_required",
        description="Autonomous high-risk actions require board certification",
        condition=lambda r: (
            not r.subject.is_board_certified
            and r.action.is_autonomous
            and r.action.risk_level == "high"
            and not r.environment.is_emergency
        ),
        effect="deny",
        priority=8,
    ))

    return policies
```

---

### 1.4 Policy-as-Code

Policy-as-Code (PaC) encodes governance rules in version-controlled, testable, auditable code rather than manual configuration. For clinical AI, PaC enables:

- **Version control**: Every policy change is tracked and auditable
- **Automated testing**: Policies can be unit tested against scenarios
- **Peer review**: Policy changes require clinical and security review
- **Auditability**: Policy evaluation is deterministic and reproducible
- **Deployment automation**: CI/CD pipelines for policy deployment

#### 1.4.1 Open Policy Agent (OPA) / Rego

```rego
# clinical_ai_agent_policy.rego
# Open Policy Agent policy for Clinical AI Agent tool governance
# License: Apache-2.0 (OPA)

package clinical_ai.agent_permissions

import future.keywords.if
import future.keywords.in

# ── Default Deny ────────────────────────────────────────────────────────────
default allow := false

# ── Role Definitions ────────────────────────────────────────────────────────
roles := {
    "attending_physician": {
        "max_classification": "high_risk_write",
        "approval_threshold": "medium_risk_write",
        "supervised": false,
    },
    "resident_physician": {
        "max_classification": "medium_risk_write",
        "approval_threshold": "low_risk_write",
        "supervised": true,
        "supervisor_role": "attending_physician",
    },
    "nurse_practitioner": {
        "max_classification": "medium_risk_write",
        "approval_threshold": "low_risk_write",
        "supervised": false,
    },
    "medical_assistant": {
        "max_classification": "low_risk_write",
        "approval_threshold": "read_only",
        "supervised": false,
    },
    "front_desk_admin": {
        "max_classification": "medium_risk_write",
        "approval_threshold": "read_only",
        "supervised": false,
    },
}

# ── Tool Classification Registry ────────────────────────────────────────────
tool_classifications := {
    # Read-Only Tools
    "view_patient_summary": {"class": "read_only", "category": "read"},
    "view_schedule": {"class": "read_only", "category": "read"},
    "view_lab_results": {"class": "read_only", "category": "read"},
    "view_imaging": {"class": "read_only", "category": "read"},
    "view_medication_list": {"class": "read_only", "category": "read"},
    "view_faq": {"class": "read_only", "category": "read"},
    "search_clinical_guidelines": {"class": "read_only", "category": "read"},
    "view_allergy_list": {"class": "read_only", "category": "read"},
    "view_vital_signs": {"class": "read_only", "category": "read"},
    "view_appointment_history": {"class": "read_only", "category": "read"},

    # Low-Risk Write
    "create_draft_note": {"class": "low_risk_write", "category": "write"},
    "draft_task": {"class": "low_risk_write", "category": "write"},
    "draft_report_section": {"class": "low_risk_write", "category": "write"},
    "create_patient_reminder": {"class": "low_risk_write", "category": "write"},
    "save_draft_message": {"class": "low_risk_write", "category": "write"},
    "create_draft_form": {"class": "low_risk_write", "category": "write"},

    # Medium-Risk Write
    "book_appointment": {"class": "medium_risk_write", "category": "write"},
    "send_appointment_reminder": {"class": "medium_risk_write", "category": "write"},
    "update_patient_form": {"class": "medium_risk_write", "category": "write"},
    "update_contact_info": {"class": "medium_risk_write", "category": "write"},
    "update_insurance_info": {"class": "medium_risk_write", "category": "write"},
    "schedule_followup": {"class": "medium_risk_write", "category": "write"},

    # High-Risk Write
    "send_patient_message_clinical": {
        "class": "high_risk_write",
        "category": "write",
        "requires_approval": true,
        "approval_timeout": 300,
    },
    "generate_clinical_report": {
        "class": "high_risk_write",
        "category": "write",
        "requires_approval": true,
        "approval_timeout": 600,
    },
    "access_full_chart": {
        "class": "high_risk_write",
        "category": "read",
        "requires_approval": true,
        "approval_timeout": 120,
    },
    "trigger_ai_analysis": {
        "class": "high_risk_write",
        "category": "write",
        "requires_approval": true,
        "approval_timeout": 300,
    },
    "export_patient_data": {
        "class": "high_risk_write",
        "category": "write",
        "requires_approval": true,
        "approval_timeout": 600,
    },

    # Forbidden Autonomous
    "make_diagnosis": {"class": "forbidden_autonomous", "category": "clinical"},
    "prescribe_medication": {"class": "forbidden_autonomous", "category": "clinical"},
    "emergency_triage": {"class": "forbidden_autonomous", "category": "clinical"},
    "modify_treatment_plan": {"class": "forbidden_autonomous", "category": "clinical"},
    "order_invasive_procedure": {"class": "forbidden_autonomous", "category": "clinical"},
    "discontinue_medication": {"class": "forbidden_autonomous", "category": "clinical"},
}

classification_order := ["read_only", "low_risk_write", "medium_risk_write", "high_risk_write", "forbidden_autonomous"]

# ── Helper Functions ────────────────────────────────────────────────────────
classification_index(class_name) := idx if {
    some idx, c in classification_order
    c == class_name
}

is_classification_at_most(role_class, tool_class) if {
    classification_index(role_class) >= classification_index(tool_class)
}

# ── Main Authorization Decision ─────────────────────────────────────────────
allow if {
    # Extract request parameters
    role := input.subject.role
    role_info := roles[role]
    tool := input.action.tool
    tool_info := tool_classifications[tool]

    # Check role can handle this classification
    is_classification_at_most(role_info.max_classification, tool_info.class)

    # Tool is not forbidden
    tool_info.class != "forbidden_autonomous"

    # Consent check
    input.resource.consent_status == "active"

    # Additional checks
    not denied_by_context
}

# Decision with approval requirement
allow_with_approval if {
    allow
    role := input.subject.role
    role_info := roles[role]
    tool := input.action.tool
    tool_info := tool_classifications[tool]

    # Check if above approval threshold
    classification_index(tool_info.class) >= classification_index(role_info.approval_threshold)
}

# Direct allow without approval
allow_direct if {
    allow
    not allow_with_approval
}

# ── Denial Conditions ───────────────────────────────────────────────────────
denied_by_context if {
    input.environment.network_zone == "external"
    tool := input.action.tool
    tool_info := tool_classifications[tool]
    tool_info.class == "high_risk_write"
}

denied_by_context if {
    input.environment.is_emergency == false
    input.resource.consent_status != "active"
}

denied_by_context if {
    input.subject.is_training == true
    tool := input.action.tool
    tool_info := tool_classifications[tool]
    tool_info.class == "high_risk_write"
    input.action.is_autonomous == true
}

# ── Break-Glass Override ────────────────────────────────────────────────────
break_glass_allow if {
    input.environment.is_emergency == true
    input.subject.role == "attending_physician"
    input.subject.credentials_verified == true
    input.action.break_glass_justification != ""
}

# Break-glass overrides all other decisions
allow if break_glass_allow

# ── Decision Output ─────────────────────────────────────────────────────────
decision := {
    "allow": allow,
    "allow_direct": allow_direct,
    "requires_approval": allow_with_approval,
    "break_glass": break_glass_allow,
    "tool_classification": tool_classifications[input.action.tool].class,
    "reason": allow_reason,
    "audit_level": audit_level,
} if {
    tool := input.action.tool
}

allow_reason := "break_glass_emergency_override" if break_glass_allow
allow_reason := "direct_authorization" if allow_direct
allow_reason := "requires_human_approval" if allow_with_approval
allow_reason := "denied" if not allow

audit_level := "critical" if break_glass_allow
audit_level := "high" if {
    allow_with_approval
    not break_glass_allow
}
audit_level := "standard" if allow_direct
```

#### 1.4.2 Casbin Policy Model

```ini
# model.conf
# Casbin RBAC with ABAC domains model for clinical AI

[request_definition]
r = sub, dom, tool, act, env

[policy_definition]
p = sub, dom, tool, act, rule

[role_definition]
g = _, _, _
g2 = _, _

[policy_effect]
e = some(where (p.eft == allow))

[matchers]
m = g(r.sub, p.sub, r.dom) && r.dom == p.dom && r.tool == p.tool && r.act == p.act && eval(p.rule)
```

```csv
# policy.csv
# Casbin policies for clinical AI agent permissions
# Format: p, role, domain, tool, action, rule

# Attending physicians - full access to their domain
p, attending_physician, cardiology, *, *, "true"
p, attending_physician, oncology, *, *, "true"
p, attending_physician, emergency, *, *, "true"

# Residents - supervised access
p, resident_physician, cardiology, view_*, *, "true"
p, resident_physician, cardiology, create_draft_*, *, "true"
p, resident_physician, cardiology, book_appointment, *, "true"
p, resident_physician, cardiology, send_patient_message_clinical, *, "false"
p, resident_physician, cardiology, generate_clinical_report, *, "false"

# Nurse practitioners
p, nurse_practitioner, *, view_patient_summary, *, "true"
p, nurse_practitioner, *, view_lab_results, *, "true"
p, nurse_practitioner, *, create_draft_note, *, "true"
p, nurse_practitioner, *, book_appointment, *, "true"
p, nurse_practitioner, *, send_patient_message, *, "true"
p, nurse_practitioner, *, generate_clinical_report, *, "false"

# Medical assistants - limited access
p, medical_assistant, *, view_patient_demographics, *, "true"
p, medical_assistant, *, view_vital_signs, *, "true"
p, medical_assistant, *, update_vital_signs, *, "true"
p, medical_assistant, *, update_patient_form, *, "true"

# Front desk
p, front_desk_admin, *, view_schedule, *, "true"
p, front_desk_admin, *, book_appointment, *, "true"
p, front_desk_admin, *, send_appointment_reminder, *, "true"
p, front_desk_admin, *, update_contact_info, *, "true"
p, front_desk_admin, *, view_insurance_info, *, "true"

# Role hierarchy
g, attending_physician, clinical_staff, *
g, resident_physician, clinical_staff, *
g, nurse_practitioner, clinical_staff, *
g, medical_assistant, clinical_support, *
g, front_desk_admin, administrative, *

# Domain assignments
g, alice, attending_physician, cardiology
g, bob, resident_physician, cardiology
g, carol, nurse_practitioner, oncology
g, dave, medical_assistant, *
g, eve, front_desk_admin, *
```

---

### 1.5 Just-in-Time Access (JIT)

Just-in-Time access provides temporary, time-bound permissions that are granted only when needed and automatically revoked afterward. JIT is critical for clinical AI because:

- **Episodic care**: A covering physician needs access only for their shift
- **Consultations**: A specialist needs temporary access for a specific case
- **Emergency coverage**: Rapid access grants during emergencies
- **Audit minimization**: Reduces standing permissions, improving security posture

#### 1.5.1 JIT Access Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    JUST-IN-TIME ACCESS FLOW                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  CLINICIAN                    SYSTEM                    APPROVER │
│     │                           │                           │    │
│     │── Request JIT Access ────>│                           │    │
│     │   (tool, patient, reason) │                           │    │
│     │                           │                           │    │
│     │                           │── Validate Request ──────>│    │
│     │                           │   (role, standing perms)  │    │
│     │                           │                           │    │
│     │                           │<─── Approval Decision ────│    │
│     │                           │   (approved/denied)       │    │
│     │                           │                           │    │
│     │                           │── Create Temporary Grant ─┤    │
│     │                           │   (time-bound, scoped)    │    │
│     │                           │                           │    │
│     │<── Access Granted ────────│                           │    │
│     │   (with expiration)       │                           │    │
│     │                           │                           │    │
│     │── Use Tool (within window)│                           │    │
│     │                           │                           │    │
│     │                           │── Auto-Revoke at Expiry ──┤    │
│     │                           │   (or manual revocation)  │    │
│     │                           │                           │    │
│     │<── Access Expired ────────│                           │    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### 1.5.2 JIT Implementation

```python
# jit_access.py
"""Just-in-Time access control for clinical AI agents."""

from __future__ import annotations

import uuid
import hashlib
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Optional
from enum import Enum


class JITStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    DENIED = "denied"
    ACTIVE = "active"
    EXPIRED = "expired"
    REVOKED = "revoked"


@dataclass
class JITAccessRequest:
    """Request for Just-in-Time access."""
    request_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    requester_id: str = ""           # Clinician requesting access
    requester_role: str = ""         # Their role
    target_tool: str = ""            # Tool they need access to
    target_patient_id: Optional[str] = None
    target_department: Optional[str] = None
    justification: str = ""          # Clinical justification
    requested_duration: int = 3600   # Seconds (default 1 hour)
    requested_at: datetime = field(default_factory=datetime.utcnow)
    status: JITStatus = JITStatus.PENDING
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    grant_token: Optional[str] = None
    revocation_reason: Optional[str] = None

    def generate_grant_token(self) -> str:
        """Generate cryptographically secure grant token."""
        data = f"{self.request_id}:{self.requester_id}:{self.target_tool}:{datetime.utcnow().isoformat()}"
        self.grant_token = hashlib.sha256(data.encode()).hexdigest()
        return self.grant_token


class JITAccessManager:
    """Manages Just-in-Time access grants for clinical AI tools."""

    DEFAULT_MAX_DURATION = 3600  # 1 hour
    EMERGENCY_MAX_DURATION = 7200  # 2 hours
    MAX_CONCURRENT_JITS = 5    # Per clinician

    def __init__(self):
        self._active_grants: dict[str, JITAccessRequest] = {}
        self._request_history: list[JITAccessRequest] = []

    def request_access(
        self,
        requester_id: str,
        requester_role: str,
        target_tool: str,
        justification: str,
        target_patient_id: Optional[str] = None,
        target_department: Optional[str] = None,
        requested_duration: int = DEFAULT_MAX_DURATION,
        is_emergency: bool = False,
    ) -> JITAccessRequest:
        """Create a new JIT access request."""
        # Check concurrent JIT limits
        active_count = sum(
            1 for g in self._active_grants.values()
            if g.requester_id == requester_id and g.status in (JITStatus.ACTIVE, JITStatus.APPROVED)
        )
        if active_count >= self.MAX_CONCURRENT_JITS:
            req = JITAccessRequest(
                requester_id=requester_id,
                requester_role=requester_role,
                target_tool=target_tool,
                justification=justification,
                target_patient_id=target_patient_id,
                target_department=target_department,
                status=JITStatus.DENIED,
            )
            self._request_history.append(req)
            raise JITAccessLimitExceeded(
                f"Maximum concurrent JIT requests ({self.MAX_CONCURRENT_JITS}) exceeded"
            )

        max_duration = (
            self.EMERGENCY_MAX_DURATION if is_emergency else self.DEFAULT_MAX_DURATION
        )
        duration = min(requested_duration, max_duration)

        request = JITAccessRequest(
            requester_id=requester_id,
            requester_role=requester_role,
            target_tool=target_tool,
            justification=justification,
            target_patient_id=target_patient_id,
            target_department=target_department,
            requested_duration=duration,
        )
        self._request_history.append(request)
        return request

    def approve_request(
        self,
        request_id: str,
        approver_id: str,
        approver_role: str,
    ) -> JITAccessRequest:
        """Approve a pending JIT access request."""
        request = self._find_request(request_id)
        if not request or request.status != JITStatus.PENDING:
            raise ValueError(f"Request {request_id} not found or not pending")

        # Validate approver can approve this request type
        if not self._can_approve(approver_role, request.requester_role):
            raise PermissionError(
                f"Role {approver_role} cannot approve JIT requests for {request.requester_role}"
            )

        request.status = JITStatus.APPROVED
        request.approved_by = approver_id
        request.approved_at = datetime.utcnow()
        request.expires_at = datetime.utcnow() + timedelta(seconds=request.requested_duration)
        request.generate_grant_token()

        # Activate immediately
        request.status = JITStatus.ACTIVE
        self._active_grants[request.grant_token] = request

        return request

    def validate_grant(self, grant_token: str, tool_name: str) -> bool:
        """Validate an active JIT grant token."""
        grant = self._active_grants.get(grant_token)
        if not grant:
            return False
        if grant.status != JITStatus.ACTIVE:
            return False
        if datetime.utcnow() > grant.expires_at:
            grant.status = JITStatus.EXPIRED
            return False
        if grant.target_tool != tool_name:
            return False
        return True

    def revoke_grant(self, grant_token: str, reason: str) -> None:
        """Revoke an active JIT grant."""
        grant = self._active_grants.get(grant_token)
        if grant:
            grant.status = JITStatus.REVOKED
            grant.revocation_reason = reason
            del self._active_grants[grant_token]

    def expire_eligible_grants(self) -> int:
        """Expire grants that have passed their expiration time."""
        expired = 0
        now = datetime.utcnow()
        for token, grant in list(self._active_grants.items()):
            if now > grant.expires_at:
                grant.status = JITStatus.EXPIRED
                del self._active_grants[token]
                expired += 1
        return expired

    def _find_request(self, request_id: str) -> Optional[JITAccessRequest]:
        for req in self._request_history:
            if req.request_id == request_id:
                return req
        return None

    def _can_approve(self, approver_role: str, requester_role: str) -> bool:
        """Determine if approver role can approve requester role's JIT request."""
        approval_hierarchy = {
            "attending_physician": ["resident_physician", "medical_assistant", "front_desk_admin"],
            "nurse_practitioner": ["medical_assistant", "front_desk_admin"],
            "clinical_director": ["attending_physician", "resident_physician",
                                   "nurse_practitioner", "medical_assistant", "front_desk_admin"],
        }
        if approver_role == "clinical_director":
            return True
        return requester_role in approval_hierarchy.get(approver_role, [])


class JITAccessLimitExceeded(Exception):
    """Raised when JIT access limits are exceeded."""
```

---

### 1.6 Break-Glass Procedures

Break-glass procedures provide emergency access when normal authorization mechanisms would prevent necessary clinical action. In healthcare, seconds can matter -- a physician treating a critical patient cannot wait for approval workflows.

#### 1.6.1 Break-Glass Design Principles

| Principle | Implementation |
|-----------|---------------|
| **Emergency-only** | Break-glass is only for genuine emergencies, not convenience |
| **Dual-control** | Requires both emergency declaration AND verified identity |
| **Full audit** | Every break-glass action generates maximum-level audit records |
| **Immediate notification** | Security team notified within seconds |
| **Post-hoc review** | Mandatory review within 24 hours |
| **Scope limitation** | Break-glass grants limited scope, not unlimited access |
| **Time bounds** | Emergency access expires automatically (max 4 hours) |
| **Attribution** | All actions clearly attributed to the break-glass user |

#### 1.6.2 Break-Glass Implementation

```python
# break_glass.py
"""Break-glass emergency access system for clinical AI."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Optional, Callable
import asyncio


class BreakGlassLevel(str, Enum):
    """Levels of break-glass emergency access."""
    PATIENT_SPECIFIC = "patient_specific"  # Single patient access
    DEPARTMENT_WIDE = "department_wide"    # Department-level access
    FULL_EMERGENCY = "full_emergency"      # System-wide emergency (rare)


class BreakGlassStatus(str, Enum):
    PENDING_ACTIVATION = "pending_activation"
    ACTIVE = "active"
    AUTO_EXPIRED = "auto_expired"
    MANUALLY_REVOKED = "manually_revoked"
    POST_HOC_REVIEWED = "post_hoc_reviewed"


@dataclass
class BreakGlassSession:
    """An active break-glass emergency session."""
    session_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    activated_by: str = ""                # User ID who activated
    activator_role: str = ""              # Role of activator
    level: BreakGlassLevel = BreakGlassLevel.PATIENT_SPECIFIC
    justification: str = ""               # Clinical justification
    affected_patient_id: Optional[str] = None
    affected_department: Optional[str] = None
    activated_at: datetime = field(default_factory=datetime.utcnow)
    expires_at: datetime = field(
        default_factory=lambda: datetime.utcnow() + timedelta(hours=4)
    )
    status: BreakGlassStatus = BreakGlassStatus.PENDING_ACTIVATION
    revoked_at: Optional[datetime] = None
    revoked_by: Optional[str] = None
    revocation_reason: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    reviewed_by: Optional[str] = None
    review_outcome: Optional[str] = None
    notification_sent: bool = False
    actions_taken: list[dict] = field(default_factory=list)


class BreakGlassSystem:
    """Emergency break-glass access control system."""

    MAX_EMERGENCY_DURATION = timedelta(hours=4)
    NOTIFICATION_CHANNELS = ["security_team", "compliance_officer", "department_head"]

    def __init__(self):
        self._active_sessions: dict[str, BreakGlassSession] = {}
        self._session_history: list[BreakGlassSession] = []
        self._notification_handlers: list[Callable] = []
        self._on_activate_handlers: list[Callable] = []

    def register_notification_handler(self, handler: Callable) -> None:
        """Register a handler for break-glass notifications."""
        self._notification_handlers.append(handler)

    async def activate(
        self,
        user_id: str,
        user_role: str,
        level: BreakGlassLevel,
        justification: str,
        affected_patient_id: Optional[str] = None,
        affected_department: Optional[str] = None,
        credentials_verified: bool = False,
        second_factor_verified: bool = False,
    ) -> BreakGlassSession:
        """Activate a break-glass emergency session."""
        # Validate prerequisites
        if not credentials_verified:
            raise BreakGlassActivationError("Credentials must be verified for break-glass activation")

        if user_role not in ("attending_physician", "clinical_director", "emergency_physician"):
            raise BreakGlassActivationError(
                f"Role {user_role} cannot activate break-glass. "
                "Only attending physicians and clinical directors."
            )

        if len(justification) < 20:
            raise BreakGlassActivationError(
                "Justification must be at least 20 characters describing the emergency"
            )

        session = BreakGlassSession(
            activated_by=user_id,
            activator_role=user_role,
            level=level,
            justification=justification,
            affected_patient_id=affected_patient_id,
            affected_department=affected_department,
            expires_at=datetime.utcnow() + self.MAX_EMERGENCY_DURATION,
            status=BreakGlassStatus.ACTIVE,
        )

        self._active_sessions[session.session_id] = session
        self._session_history.append(session)

        # Send immediate notifications
        await self._notify_all(session)

        # Trigger any activation handlers
        for handler in self._on_activate_handlers:
            await handler(session)

        return session

    async def revoke(
        self,
        session_id: str,
        revoked_by: str,
        reason: str,
    ) -> BreakGlassSession:
        """Manually revoke a break-glass session."""
        session = self._active_sessions.get(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")

        session.status = BreakGlassStatus.MANUALLY_REVOKED
        session.revoked_at = datetime.utcnow()
        session.revoked_by = revoked_by
        session.revocation_reason = reason

        del self._active_sessions[session_id]

        # Trigger post-revocation notification
        await self._notify_all(session, event="revoked")

        return session

    async def auto_expire(self) -> int:
        """Automatically expire sessions past their time limit."""
        expired_count = 0
        now = datetime.utcnow()
        for sid, session in list(self._active_sessions.items()):
            if now > session.expires_at:
                session.status = BreakGlassStatus.AUTO_EXPIRED
                del self._active_sessions[sid]
                expired_count += 1
                await self._notify_all(session, event="auto_expired")
        return expired_count

    def is_active_for(
        self,
        user_id: str,
        patient_id: Optional[str] = None,
    ) -> bool:
        """Check if a user has active break-glass access."""
        for session in self._active_sessions.values():
            if session.activated_by != user_id:
                continue
            if session.status != BreakGlassStatus.ACTIVE:
                continue
            if datetime.utcnow() > session.expires_at:
                continue
            # Check scope
            if session.level == BreakGlassLevel.PATIENT_SPECIFIC:
                if patient_id and session.affected_patient_id == patient_id:
                    return True
            elif session.level == BreakGlassLevel.DEPARTMENT_WIDE:
                return True  # Department check done at higher level
            elif session.level == BreakGlassLevel.FULL_EMERGENCY:
                return True
        return False

    async def post_hoc_review(
        self,
        session_id: str,
        reviewer_id: str,
        outcome: str,
        notes: str,
    ) -> BreakGlassSession:
        """Complete mandatory post-hoc review of break-glass usage."""
        session = None
        for s in self._session_history:
            if s.session_id == session_id:
                session = s
                break
        if not session:
            raise ValueError(f"Session {session_id} not found")

        session.reviewed_at = datetime.utcnow()
        session.reviewed_by = reviewer_id
        session.review_outcome = outcome
        session.status = BreakGlassStatus.POST_HOC_REVIEWED

        # Log review completion
        review_record = {
            "session_id": session_id,
            "reviewer": reviewer_id,
            "outcome": outcome,
            "notes": notes,
            "actions_taken": len(session.actions_taken),
            "activated_at": session.activated_at.isoformat(),
            "reviewed_at": session.reviewed_at.isoformat(),
        }

        await self._notify_all(session, event="review_completed", extra=review_record)
        return session

    async def _notify_all(
        self,
        session: BreakGlassSession,
        event: str = "activated",
        extra: Optional[dict] = None,
    ) -> None:
        """Send notifications to all registered channels."""
        notification = {
            "event": event,
            "session_id": session.session_id,
            "activated_by": session.activated_by,
            "activator_role": session.activator_role,
            "level": session.level.value,
            "justification": session.justification,
            "timestamp": datetime.utcnow().isoformat(),
            "patient_id": session.affected_patient_id,
            "department": session.affected_department,
        }
        if extra:
            notification.update(extra)

        for handler in self._notification_handlers:
            try:
                await handler(notification)
            except Exception:
                pass  # Never fail the break-glass due to notification issues

    def get_pending_reviews(self, hours: int = 24) -> list[BreakGlassSession]:
        """Get break-glass sessions requiring post-hoc review."""
        cutoff = datetime.utcnow() - timedelta(hours=hours)
        return [
            s for s in self._session_history
            if s.activated_at < cutoff
            and s.reviewed_at is None
            and s.status in (BreakGlassStatus.AUTO_EXPIRED, BreakGlassStatus.MANUALLY_REVOKED)
        ]


class BreakGlassActivationError(Exception):
    """Raised when break-glass activation fails validation."""
```

---

## 2. Tool Classification System

### 2.1 Overview

The tool classification system categorizes every tool available to a clinical AI agent into one of five tiers. This classification is the foundation of all governance decisions -- RBAC roles, approval workflows, audit levels, and monitoring all derive from these classifications.

The classification system is designed around a simple principle: **the higher the potential for patient harm or privacy violation, the stricter the controls**.

### 2.2 Five-Tier Classification

```
┌──────────────────────────────────────────────────────────────────────┐
│                    TOOL CLASSIFICATION PYRAMID                        │
│                                                                      │
│     ┌─────────────────────────────────────────────────────┐         │
│     │  TIER 5: FORBIDDEN AUTONOMOUS  [RED - NEVER]        │         │
│     │  Diagnosis, prescribing, emergency triage,          │         │
│     │  treatment changes, procedure orders                │         │
│     │  ━━ AI CAN NEVER INVOKE THESE AUTONOMOUSLY ━━      │         │
│     └─────────────────────────────────────────────────────┘         │
│                        ▲                                            │
│     ┌─────────────────────────────────────────────────────┐         │
│     │  TIER 4: HIGH-RISK WRITE  [ORANGE - APPROVAL REQ]   │         │
│     │  Clinical messages, report generation, full chart,  │         │
│     │  AI analysis trigger, data export                   │         │
│     │  ━━ REQUIRES EXPLICIT HUMAN APPROVAL ━━            │         │
│     └─────────────────────────────────────────────────────┘         │
│                        ▲                                            │
│     ┌─────────────────────────────────────────────────────┐         │
│     │  TIER 3: MEDIUM-RISK WRITE  [YELLOW - LOGGED]       │         │
│     │  Booking, reminders, form updates, scheduling       │         │
│     │  ━━ LOGGED, MAY REQUIRE APPROVAL BY ROLE ━━        │         │
│     └─────────────────────────────────────────────────────┘         │
│                        ▲                                            │
│     ┌─────────────────────────────────────────────────────┐         │
│     │  TIER 2: LOW-RISK WRITE  [BLUE - DRAFT ONLY]        │         │
│     │  Draft notes, draft tasks, draft sections           │         │
│     │  ━━ NEVER DIRECTLY COMMITTED, ALWAYS DRAFT ━━      │         │
│     └─────────────────────────────────────────────────────┘         │
│                        ▲                                            │
│     ┌─────────────────────────────────────────────────────┐         │
│     │  TIER 1: READ-ONLY  [GREEN - SAFE]                  │         │
│     │  View summaries, schedules, FAQs, guidelines        │         │
│     │  ━━ NO PATIENT DATA MODIFICATION ━━                │         │
│     └─────────────────────────────────────────────────────┘         │
└──────────────────────────────────────────────────────────────────────┘
```

---

### 2.3 Tier 1: Read-Only Tools

**Classification:** `read_only`
**Color Code:** Green
**Risk Level:** Minimal
**Controls:** Standard RBAC, standard audit logging
**Approval Required:** No

Read-only tools access information without modifying any data. They are the safest class of tools but still require access control because viewing PHI without authorization is a HIPAA violation.

| Tool | Description | Data Accessed | HIPAA Basis |
|------|------------|---------------|-------------|
| `view_patient_summary` | De-identified or minimal necessary summary | PHI (limited) | Treatment |
| `view_schedule` | View appointment schedule | PHI (appointments) | Treatment |
| `view_lab_results` | Laboratory test results | PHI (labs) | Treatment |
| `view_imaging_results` | Radiology/imaging results | PHI (images) | Treatment |
| `view_medication_list` | Current and historical medications | PHI (meds) | Treatment |
| `view_allergy_list` | Documented patient allergies | PHI (allergies) | Treatment |
| `view_vital_signs` | Historical vital signs | PHI (vitals) | Treatment |
| `view_appointment_history` | Past appointments | PHI (schedule) | Treatment |
| `view_faq` | Frequently asked questions | None (public) | N/A |
| `search_clinical_guidelines` | Evidence-based clinical guidelines | None (public) | N/A |
| `view_care_team` | Assigned care team members | PHI (staff) | Treatment |
| `view_insurance_info` | Insurance and billing information | PHI (payment) | Payment |

```python
# read_only_tools.py
"""Read-only tool implementations for clinical AI agents."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Optional
from enum import Enum


class ReadToolName(str, Enum):
    VIEW_PATIENT_SUMMARY = "view_patient_summary"
    VIEW_SCHEDULE = "view_schedule"
    VIEW_LAB_RESULTS = "view_lab_results"
    VIEW_IMAGING_RESULTS = "view_imaging_results"
    VIEW_MEDICATION_LIST = "view_medication_list"
    VIEW_ALLERGY_LIST = "view_allergy_list"
    VIEW_VITAL_SIGNS = "view_vital_signs"
    VIEW_APPOINTMENT_HISTORY = "view_appointment_history"
    VIEW_FAQ = "view_faq"
    SEARCH_CLINICAL_GUIDELINES = "search_clinical_guidelines"
    VIEW_CARE_TEAM = "view_care_team"
    VIEW_INSURANCE_INFO = "view_insurance_info"


@dataclass
class PatientSummary:
    """De-identified patient summary for read-only access."""
    patient_id: str
    age_range: str          # "18-25", "26-35", etc. -- not exact age
    sex: str                # "M", "F", "U"
    primary_diagnosis_codes: list[str]
    active_medications_count: int
    allergy_alert: bool
    last_visit_date: Optional[datetime]
    care_team_summary: str


class ReadOnlyToolRegistry:
    """Registry of read-only tools with metadata."""

    TOOLS = {
        ReadToolName.VIEW_PATIENT_SUMMARY: {
            "description": "View de-identified patient summary",
            "data_sensitivity": "phi_limited",
            "hipaa_basis": "treatment",
            "min_role": "medical_assistant",
            "rate_limit": "100/minute",
        },
        ReadToolName.VIEW_SCHEDULE: {
            "description": "View appointment schedule",
            "data_sensitivity": "phi_limited",
            "hipaa_basis": "treatment",
            "min_role": "front_desk_admin",
            "rate_limit": "200/minute",
        },
        ReadToolName.VIEW_LAB_RESULTS: {
            "description": "View laboratory test results",
            "data_sensitivity": "phi",
            "hipaa_basis": "treatment",
            "min_role": "medical_assistant",
            "rate_limit": "100/minute",
        },
        ReadToolName.VIEW_IMAGING_RESULTS: {
            "description": "View imaging/radiology results",
            "data_sensitivity": "phi",
            "hipaa_basis": "treatment",
            "min_role": "medical_assistant",
            "rate_limit": "50/minute",
        },
        ReadToolName.VIEW_MEDICATION_LIST: {
            "description": "View current and historical medications",
            "data_sensitivity": "phi",
            "hipaa_basis": "treatment",
            "min_role": "medical_assistant",
            "rate_limit": "100/minute",
        },
        ReadToolName.VIEW_ALLERGY_LIST: {
            "description": "View documented patient allergies",
            "data_sensitivity": "phi",
            "hipaa_basis": "treatment",
            "min_role": "medical_assistant",
            "rate_limit": "100/minute",
        },
        ReadToolName.VIEW_VITAL_SIGNS: {
            "description": "View historical vital signs",
            "data_sensitivity": "phi",
            "hipaa_basis": "treatment",
            "min_role": "medical_assistant",
            "rate_limit": "100/minute",
        },
        ReadToolName.VIEW_APPOINTMENT_HISTORY: {
            "description": "View past appointments",
            "data_sensitivity": "phi_limited",
            "hipaa_basis": "treatment",
            "min_role": "front_desk_admin",
            "rate_limit": "200/minute",
        },
        ReadToolName.VIEW_FAQ: {
            "description": "View frequently asked questions",
            "data_sensitivity": "public",
            "hipaa_basis": None,
            "min_role": "any",
            "rate_limit": "1000/minute",
        },
        ReadToolName.SEARCH_CLINICAL_GUIDELINES: {
            "description": "Search evidence-based clinical guidelines",
            "data_sensitivity": "public",
            "hipaa_basis": None,
            "min_role": "any_authenticated",
            "rate_limit": "100/minute",
        },
        ReadToolName.VIEW_CARE_TEAM: {
            "description": "View assigned care team members",
            "data_sensitivity": "phi_limited",
            "hipaa_basis": "treatment",
            "min_role": "medical_assistant",
            "rate_limit": "100/minute",
        },
        ReadToolName.VIEW_INSURANCE_INFO: {
            "description": "View insurance and billing information",
            "data_sensitivity": "phi",
            "hipaa_basis": "payment",
            "min_role": "front_desk_admin",
            "rate_limit": "100/minute",
        },
    }
```

---

### 2.4 Tier 2: Low-Risk Write Tools

**Classification:** `low_risk_write`
**Color Code:** Blue
**Risk Level:** Low
**Controls:** RBAC + draft-only enforcement, standard audit
**Approval Required:** No (for creating drafts)

Low-risk write tools create content but never directly commit or send it. All outputs are drafts requiring human review before any action is taken. This tier is the **default** for AI agent write capabilities.

| Tool | Description | Output | Safeguard |
|------|------------|--------|-----------|
| `create_draft_note` | Draft clinical note | Unsaved draft | Never auto-saves to EHR |
| `draft_task` | Draft clinical task | Task proposal | Requires nurse/MA approval |
| `draft_report_section` | Draft report content | Document section | Requires provider review |
| `draft_patient_message` | Draft communication | Message draft | Explicit send required |
| `create_draft_form` | Draft patient form | Form template | Requires staff approval |
| `draft_care_plan_update` | Proposed care plan changes | Diff view | Requires provider approval |
| `draft_summary` | Draft patient summary | Text output | Marked as AI-generated |

**Critical Safeguard:** All Tier 2 tools MUST enforce a `draft_only` flag that prevents any direct commit. The decorator pattern (Section 8) enforces this at the middleware level.

---

### 2.5 Tier 3: Medium-Risk Write Tools

**Classification:** `medium_risk_write`
**Color Code:** Yellow
**Risk Level:** Medium
**Controls:** RBAC + approval by role + enhanced audit
**Approval Required:** Role-dependent (residents always, attendings configurable)

Medium-risk write tools make changes to operational data but not clinical content. Errors are recoverable and typically do not directly impact patient safety.

| Tool | Description | Data Modified | Typical Approval |
|------|------------|---------------|-----------------|
| `book_appointment` | Schedule patient appointment | Schedule DB | Auto (attending), Approve (resident) |
| `send_appointment_reminder` | Send reminder notification | Notification log | Auto (most roles) |
| `update_patient_form` | Update intake/form data | Forms DB | Auto (attending), Approve (MA) |
| `update_contact_info` | Update phone/email/address | Demographics DB | Auto (front desk) |
| `update_insurance_info` | Update insurance details | Billing DB | Auto (front desk), Approve (changes) |
| `schedule_followup` | Schedule follow-up visit | Schedule DB | Auto (attending), Approve (resident) |
| `reschedule_appointment` | Move existing appointment | Schedule DB | Auto (attending), Approve (front desk) |
| `update_patient_demographics` | Update demographic data | Demographics DB | Auto (MA), Audit log |
| `create_patient_task` | Create staff task | Task DB | Auto (nurse+), Approve (MA) |
| `send_portal_message` | Send patient portal message | Portal messages | Approve (all roles) |

---

### 2.6 Tier 4: High-Risk Write Tools

**Classification:** `high_risk_write`
**Color Code:** Orange
**Risk Level:** High
**Controls:** RBAC + mandatory human approval + real-time audit + escalation
**Approval Required:** **Always** -- No autonomous execution

High-risk write tools can directly impact clinical care, patient communication, or data integrity. These tools require explicit human approval before execution.

| Tool | Description | Risk | Approval Timeout |
|------|------------|------|-----------------|
| `send_patient_message_clinical` | Send clinical content to patient | Misinformation, patient harm | 5 minutes |
| `generate_clinical_report` | Generate clinical documentation | Documentation errors, legal risk | 10 minutes |
| `access_full_chart` | Access complete patient record | Privacy violation | 2 minutes |
| `trigger_ai_analysis` | Run AI analysis on patient data | Algorithmic bias, incorrect results | 5 minutes |
| `export_patient_data` | Export patient data | Data breach, HIPAA violation | 10 minutes |
| `update_medication_list` | Modify active medications | Adverse drug events | 5 minutes |
| `create_clinical_order` | Create order for tests/procedures | Unnecessary procedures, cost | 5 minutes |
| `update_problem_list` | Modify patient problem list | Diagnostic errors | 5 minutes |

```python
# high_risk_tools.py
"""High-risk tool enforcement for clinical AI agents."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import Enum
from typing import Optional, Callable
import asyncio


class ApprovalStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    DENIED = "denied"
    TIMED_OUT = "timed_out"
    ESCALATED = "escalated"


class HighRiskTool(str, Enum):
    SEND_PATIENT_MESSAGE_CLINICAL = "send_patient_message_clinical"
    GENERATE_CLINICAL_REPORT = "generate_clinical_report"
    ACCESS_FULL_CHART = "access_full_chart"
    TRIGGER_AI_ANALYSIS = "trigger_ai_analysis"
    EXPORT_PATIENT_DATA = "export_patient_data"
    UPDATE_MEDICATION_LIST = "update_medication_list"
    CREATE_CLINICAL_ORDER = "create_clinical_order"
    UPDATE_PROBLEM_LIST = "update_problem_list"


@dataclass
class ApprovalRequest:
    """Request for human approval of a high-risk tool call."""
    request_id: str
    tool_name: HighRiskTool
    proposed_action: str          # Human-readable description
    patient_id: Optional[str]
    requesting_agent: str         # Agent ID
    session_owner: str            # Clinician who owns the session
    requested_at: datetime
    timeout_seconds: int
    status: ApprovalStatus = ApprovalStatus.PENDING
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    denial_reason: Optional[str] = None
    escalation_level: int = 0
    context_snapshot: dict = None  # Full context for approver review


class HighRiskToolGate:
    """Mandatory approval gate for high-risk tool invocations."""

    DEFAULT_TIMEOUTS = {
        HighRiskTool.SEND_PATIENT_MESSAGE_CLINICAL: 300,
        HighRiskTool.GENERATE_CLINICAL_REPORT: 600,
        HighRiskTool.ACCESS_FULL_CHART: 120,
        HighRiskTool.TRIGGER_AI_ANALYSIS: 300,
        HighRiskTool.EXPORT_PATIENT_DATA: 600,
        HighRiskTool.UPDATE_MEDICATION_LIST: 300,
        HighRiskTool.CREATE_CLINICAL_ORDER: 300,
        HighRiskTool.UPDATE_PROBLEM_LIST: 300,
    }

    MAX_ESCALATION_LEVELS = 3
    ESCALATION_TIMEOUT_MULTIPLIERS = [1, 1.5, 2]  # Level 0: 1x, Level 1: 1.5x, Level 2: 2x

    def __init__(self):
        self._pending_approvals: dict[str, ApprovalRequest] = {}
        self._approval_handlers: list[Callable] = []
        self._escalation_handlers: list[Callable] = []

    async def request_approval(
        self,
        tool_name: HighRiskTool,
        proposed_action: str,
        session_owner: str,
        requesting_agent: str,
        patient_id: Optional[str] = None,
        context_snapshot: Optional[dict] = None,
    ) -> ApprovalRequest:
        """Request human approval before executing high-risk tool."""
        timeout = self.DEFAULT_TIMEOUTS.get(tool_name, 300)

        approval = ApprovalRequest(
            request_id=f"apr_{datetime.utcnow().timestamp()}_{tool_name.value}",
            tool_name=tool_name,
            proposed_action=proposed_action,
            patient_id=patient_id,
            requesting_agent=requesting_agent,
            session_owner=session_owner,
            requested_at=datetime.utcnow(),
            timeout_seconds=timeout,
            context_snapshot=context_snapshot or {},
        )

        self._pending_approvals[approval.request_id] = approval

        # Notify all approval handlers (WebSocket, push notification, etc.)
        for handler in self._approval_handlers:
            try:
                await handler(approval)
            except Exception:
                pass

        return approval

    async def approve(self, request_id: str, approver_id: str) -> ApprovalRequest:
        """Approve a pending high-risk tool request."""
        approval = self._pending_approvals.get(request_id)
        if not approval:
            raise ValueError(f"Approval request {request_id} not found")
        if approval.status != ApprovalStatus.PENDING:
            raise ValueError(f"Approval request {request_id} is not pending")

        approval.status = ApprovalStatus.APPROVED
        approval.approved_by = approver_id
        approval.approved_at = datetime.utcnow()

        return approval

    async def deny(self, request_id: str, denier_id: str, reason: str) -> ApprovalRequest:
        """Deny a pending high-risk tool request."""
        approval = self._pending_approvals.get(request_id)
        if not approval:
            raise ValueError(f"Approval request {request_id} not found")

        approval.status = ApprovalStatus.DENIED
        approval.approved_by = denier_id
        approval.denial_reason = reason

        return approval

    async def wait_for_approval(
        self,
        request_id: str,
        check_interval: float = 1.0,
    ) -> ApprovalRequest:
        """Wait for approval decision with timeout handling."""
        approval = self._pending_approvals[request_id]
        start_time = datetime.utcnow()
        timeout = timedelta(seconds=approval.timeout_seconds)

        while datetime.utcnow() - start_time < timeout:
            approval = self._pending_approvals.get(request_id)
            if not approval or approval.status in (ApprovalStatus.APPROVED, ApprovalStatus.DENIED):
                return approval
            await asyncio.sleep(check_interval)

        # Timeout - update status
        approval.status = ApprovalStatus.TIMED_OUT

        # Check if escalation is possible
        if approval.escalation_level < self.MAX_ESCALATION_LEVELS:
            await self._escalate(approval)
            return await self.wait_for_approval(request_id, check_interval)

        return approval

    async def _escalate(self, approval: ApprovalRequest) -> None:
        """Escalate an approval request to next level."""
        approval.escalation_level += 1
        multiplier = self.ESCALATION_TIMEOUT_MULTIPLIERS[
            min(approval.escalation_level, len(self.ESCALATION_TIMEOUT_MULTIPLIERS) - 1)
        ]
        approval.timeout_seconds = int(approval.timeout_seconds * multiplier)
        approval.status = ApprovalStatus.ESCALATED
        approval.requested_at = datetime.utcnow()

        for handler in self._escalation_handlers:
            try:
                await handler(approval)
            except Exception:
                pass

    def register_approval_handler(self, handler: Callable) -> None:
        self._approval_handlers.append(handler)

    def register_escalation_handler(self, handler: Callable) -> None:
        self._escalation_handlers.append(handler)
```

---

### 2.7 Tier 5: Forbidden Autonomous

**Classification:** `forbidden_autonomous`
**Color Code:** Red
**Risk Level:** Critical
**Controls:** Hard-coded denial, no approval possible, alert on attempt
**Approval Required:** **N/A** -- These tools cannot be invoked by AI agents under any circumstances

Forbidden autonomous tools represent clinical decisions that must **always** be made by licensed human clinicians. An AI agent attempting to invoke these tools triggers an immediate security alert.

| Tool | Description | Why Forbidden |
|------|------------|---------------|
| `make_diagnosis` | Assign or modify diagnosis | Diagnosis requires clinical judgment, liability, patient relationship |
| `prescribe_medication` | Create or modify prescriptions | Prescribing is a licensed medical act; errors cause harm |
| `emergency_triage` | Triage patients in emergency | Life-or-death decisions require human judgment |
| `modify_treatment_plan` | Change active treatment | Directly impacts patient care; requires informed consent |
| `order_invasive_procedure` | Order procedures with risk | Procedures carry physical risk; requires informed consent |
| `discontinue_medication` | Stop active medications | Abrupt discontinuation can cause harm |
| `modify_dosage` | Change medication dosing | Dosing errors are leading cause of adverse events |
| `issue_referral` | Create specialist referral | Requires clinical judgment about necessity and urgency |

```python
# forbidden_tools.py
"""Enforcement layer for forbidden autonomous tool categories."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Optional, Callable
import asyncio


FORBIDDEN_TOOLS = {
    "make_diagnosis": {
        "reason": "Diagnosis requires licensed clinical judgment and patient relationship",
        "regulatory_basis": "State Medical Practice Act, Malpractice Liability",
        "risk_category": "clinical_decision",
    },
    "prescribe_medication": {
        "reason": "Prescribing is a controlled act requiring DEA licensure",
        "regulatory_basis": "Controlled Substances Act, State Pharmacy Law",
        "risk_category": "medication_safety",
    },
    "emergency_triage": {
        "reason": "Emergency triage decisions directly impact survival outcomes",
        "regulatory_basis": "EMTALA, Emergency Medicine Standards",
        "risk_category": "patient_safety_critical",
    },
    "modify_treatment_plan": {
        "reason": "Treatment changes require informed consent and clinical oversight",
        "regulatory_basis": "Informed Consent Doctrine, Standard of Care",
        "risk_category": "clinical_decision",
    },
    "order_invasive_procedure": {
        "reason": "Invasive procedures require informed consent and licensed ordering",
        "regulatory_basis": "Informed Consent, CMS Conditions of Participation",
        "risk_category": "patient_safety_critical",
    },
    "discontinue_medication": {
        "reason": "Medication discontinuation can cause rebound effects or withdrawal",
        "regulatory_basis": "Medication Safety Standards",
        "risk_category": "medication_safety",
    },
    "modify_dosage": {
        "reason": "Dosage changes require clinical assessment and monitoring plan",
        "regulatory_basis": "Medication Safety Standards",
        "risk_category": "medication_safety",
    },
    "issue_referral": {
        "reason": "Referrals require clinical judgment about necessity",
        "regulatory_basis": "Medical Necessity, Stark Law considerations",
        "risk_category": "clinical_decision",
    },
}


@dataclass
class ForbiddenToolAlert:
    """Alert generated when an AI agent attempts to invoke a forbidden tool."""
    alert_id: str
    timestamp: datetime
    agent_id: str
    session_id: str
    session_owner: str
    attempted_tool: str
    tool_reason: str
    regulatory_basis: str
    risk_category: str
    context_snapshot: dict
    severity: str = "critical"


class ForbiddenToolEnforcer:
    """Enforces absolute prohibition on autonomous clinical decision tools."""

    def __init__(self):
        self._alert_handlers: list[Callable] = []
        self._violation_count: dict[str, int] = {}  # Per-agent violation tracking

    def register_alert_handler(self, handler: Callable) -> None:
        """Register a handler for forbidden tool violation alerts."""
        self._alert_handlers.append(handler)

    def check(self, tool_name: str) -> bool:
        """Check if a tool is forbidden. Returns True if forbidden."""
        return tool_name in FORBIDDEN_TOOLS

    async def enforce(
        self,
        tool_name: str,
        agent_id: str,
        session_id: str,
        session_owner: str,
        context_snapshot: dict,
    ) -> None:
        """Enforce forbidden tool prohibition and generate alerts."""
        if tool_name not in FORBIDDEN_TOOLS:
            return  # Not forbidden

        tool_info = FORBIDDEN_TOOLS[tool_name]

        # Generate critical alert
        alert = ForbiddenToolAlert(
            alert_id=f"fta_{datetime.utcnow().timestamp()}_{agent_id}",
            timestamp=datetime.utcnow(),
            agent_id=agent_id,
            session_id=session_id,
            session_owner=session_owner,
            attempted_tool=tool_name,
            tool_reason=tool_info["reason"],
            regulatory_basis=tool_info["regulatory_basis"],
            risk_category=tool_info["risk_category"],
            context_snapshot=context_snapshot,
        )

        # Track violation count
        self._violation_count[agent_id] = self._violation_count.get(agent_id, 0) + 1

        # Send alerts to all handlers
        for handler in self._alert_handlers:
            try:
                await handler(alert)
            except Exception:
                pass  # Never fail the enforcement due to alert issues

        # Raise enforcement exception
        raise ForbiddenToolInvocationError(
            f"Tool '{tool_name}' is FORBIDDEN for autonomous AI invocation. "
            f"Reason: {tool_info['reason']}. "
            f"This attempt has been logged and alerts have been sent."
        )

    def get_violation_count(self, agent_id: str) -> int:
        """Get the number of forbidden tool violation attempts by an agent."""
        return self._violation_count.get(agent_id, 0)

    def should_quarantine(self, agent_id: str, threshold: int = 3) -> bool:
        """Determine if an agent should be quarantined due to repeated violations."""
        return self._violation_count.get(agent_id, 0) >= threshold


class ForbiddenToolInvocationError(Exception):
    """Raised when an AI agent attempts to invoke a forbidden tool."""
```

---

### 2.8 Complete Classification Matrix

```python
# classification_matrix.py
"""Complete tool classification matrix for clinical AI governance."""

from enum import Enum


class Tier(str, Enum):
    READ_ONLY = "read_only"
    LOW_RISK_WRITE = "low_risk_write"
    MEDIUM_RISK_WRITE = "medium_risk_write"
    HIGH_RISK_WRITE = "high_risk_write"
    FORBIDDEN_AUTONOMOUS = "forbidden_autonomous"


COMPLETE_CLASSIFICATION = {
    # ── TIER 1: READ-ONLY ─────────────────────────────────────────────────
    "view_patient_summary":          {"tier": Tier.READ_ONLY,        "approval": False, "audit": "standard"},
    "view_schedule":                 {"tier": Tier.READ_ONLY,        "approval": False, "audit": "standard"},
    "view_lab_results":              {"tier": Tier.READ_ONLY,        "approval": False, "audit": "standard"},
    "view_imaging_results":          {"tier": Tier.READ_ONLY,        "approval": False, "audit": "standard"},
    "view_medication_list":          {"tier": Tier.READ_ONLY,        "approval": False, "audit": "standard"},
    "view_allergy_list":             {"tier": Tier.READ_ONLY,        "approval": False, "audit": "standard"},
    "view_vital_signs":              {"tier": Tier.READ_ONLY,        "approval": False, "audit": "standard"},
    "view_appointment_history":      {"tier": Tier.READ_ONLY,        "approval": False, "audit": "standard"},
    "view_faq":                      {"tier": Tier.READ_ONLY,        "approval": False, "audit": "minimal"},
    "search_clinical_guidelines":    {"tier": Tier.READ_ONLY,        "approval": False, "audit": "minimal"},
    "view_care_team":                {"tier": Tier.READ_ONLY,        "approval": False, "audit": "standard"},
    "view_insurance_info":           {"tier": Tier.READ_ONLY,        "approval": False, "audit": "standard"},
    "view_billing_history":          {"tier": Tier.READ_ONLY,        "approval": False, "audit": "enhanced"},

    # ── TIER 2: LOW-RISK WRITE (DRAFT ONLY) ───────────────────────────────
    "create_draft_note":             {"tier": Tier.LOW_RISK_WRITE,    "approval": False, "audit": "standard", "draft_only": True},
    "draft_task":                    {"tier": Tier.LOW_RISK_WRITE,    "approval": False, "audit": "standard", "draft_only": True},
    "draft_report_section":          {"tier": Tier.LOW_RISK_WRITE,    "approval": False, "audit": "standard", "draft_only": True},
    "draft_patient_message":         {"tier": Tier.LOW_RISK_WRITE,    "approval": False, "audit": "standard", "draft_only": True},
    "create_draft_form":             {"tier": Tier.LOW_RISK_WRITE,    "approval": False, "audit": "standard", "draft_only": True},
    "draft_care_plan_update":        {"tier": Tier.LOW_RISK_WRITE,    "approval": False, "audit": "standard", "draft_only": True},
    "draft_summary":                 {"tier": Tier.LOW_RISK_WRITE,    "approval": False, "audit": "standard", "draft_only": True},
    "draft_referral":                {"tier": Tier.LOW_RISK_WRITE,    "approval": False, "audit": "standard", "draft_only": True},

    # ── TIER 3: MEDIUM-RISK WRITE ─────────────────────────────────────────
    "book_appointment":              {"tier": Tier.MEDIUM_RISK_WRITE, "approval": "role_dependent", "audit": "enhanced"},
    "send_appointment_reminder":     {"tier": Tier.MEDIUM_RISK_WRITE, "approval": False, "audit": "standard"},
    "update_patient_form":           {"tier": Tier.MEDIUM_RISK_WRITE, "approval": "role_dependent", "audit": "enhanced"},
    "update_contact_info":           {"tier": Tier.MEDIUM_RISK_WRITE, "approval": False, "audit": "standard"},
    "update_insurance_info":         {"tier": Tier.MEDIUM_RISK_WRITE, "approval": "role_dependent", "audit": "enhanced"},
    "schedule_followup":             {"tier": Tier.MEDIUM_RISK_WRITE, "approval": "role_dependent", "audit": "enhanced"},
    "reschedule_appointment":        {"tier": Tier.MEDIUM_RISK_WRITE, "approval": "role_dependent", "audit": "enhanced"},
    "update_patient_demographics":   {"tier": Tier.MEDIUM_RISK_WRITE, "approval": "role_dependent", "audit": "enhanced"},
    "create_patient_task":           {"tier": Tier.MEDIUM_RISK_WRITE, "approval": "role_dependent", "audit": "standard"},
    "send_portal_message":           {"tier": Tier.MEDIUM_RISK_WRITE, "approval": True,   "audit": "enhanced"},
    "cancel_appointment":            {"tier": Tier.MEDIUM_RISK_WRITE, "approval": "role_dependent", "audit": "enhanced"},

    # ── TIER 4: HIGH-RISK WRITE ───────────────────────────────────────────
    "send_patient_message_clinical": {"tier": Tier.HIGH_RISK_WRITE,   "approval": True,   "audit": "critical", "timeout": 300},
    "generate_clinical_report":      {"tier": Tier.HIGH_RISK_WRITE,   "approval": True,   "audit": "critical", "timeout": 600},
    "access_full_chart":             {"tier": Tier.HIGH_RISK_WRITE,   "approval": True,   "audit": "critical", "timeout": 120},
    "trigger_ai_analysis":           {"tier": Tier.HIGH_RISK_WRITE,   "approval": True,   "audit": "critical", "timeout": 300},
    "export_patient_data":           {"tier": Tier.HIGH_RISK_WRITE,   "approval": True,   "audit": "critical", "timeout": 600},
    "update_medication_list":        {"tier": Tier.HIGH_RISK_WRITE,   "approval": True,   "audit": "critical", "timeout": 300},
    "create_clinical_order":         {"tier": Tier.HIGH_RISK_WRITE,   "approval": True,   "audit": "critical", "timeout": 300},
    "update_problem_list":           {"tier": Tier.HIGH_RISK_WRITE,   "approval": True,   "audit": "critical", "timeout": 300},

    # ── TIER 5: FORBIDDEN AUTONOMOUS ──────────────────────────────────────
    "make_diagnosis":                {"tier": Tier.FORBIDDEN_AUTONOMOUS, "approval": None, "audit": "critical_alert"},
    "prescribe_medication":          {"tier": Tier.FORBIDDEN_AUTONOMOUS, "approval": None, "audit": "critical_alert"},
    "emergency_triage":              {"tier": Tier.FORBIDDEN_AUTONOMOUS, "approval": None, "audit": "critical_alert"},
    "modify_treatment_plan":         {"tier": Tier.FORBIDDEN_AUTONOMOUS, "approval": None, "audit": "critical_alert"},
    "order_invasive_procedure":      {"tier": Tier.FORBIDDEN_AUTONOMOUS, "approval": None, "audit": "critical_alert"},
    "discontinue_medication":        {"tier": Tier.FORBIDDEN_AUTONOMOUS, "approval": None, "audit": "critical_alert"},
    "modify_dosage":                 {"tier": Tier.FORBIDDEN_AUTONOMOUS, "approval": None, "audit": "critical_alert"},
    "issue_referral":                {"tier": Tier.FORBIDDEN_AUTONOMOUS, "approval": None, "audit": "critical_alert"},
}


def get_tool_metadata(tool_name: str) -> dict:
    """Get classification metadata for a tool."""
    return COMPLETE_CLASSIFICATION.get(tool_name, {
        "tier": Tier.FORBIDDEN_AUTONOMOUS,
        "approval": None,
        "audit": "critical_alert",
        "note": "Unknown tool - defaulting to forbidden",
    })


def requires_approval(tool_name: str, role: str = "attending_physician") -> bool:
    """Check if a tool requires approval for a given role."""
    meta = get_tool_metadata(tool_name)

    if meta["tier"] == Tier.FORBIDDEN_AUTONOMOUS:
        return True  # Effectively denied - no approval process exists

    approval = meta.get("approval")
    if approval is True:
        return True
    if approval is False:
        return False
    if approval == "role_dependent":
        # Simplified role-dependent logic
        if role in ("attending_physician", "clinical_director"):
            return False
        return True
    return True  # Default to requiring approval
```

---

## 3. Human Approval Gates

### 3.1 Overview

Human approval gates are the critical checkpoints where clinical AI agent actions are reviewed by human clinicians before execution. The approval system must balance two competing requirements:

1. **Safety**: High-risk actions must not execute without human review
2. **Efficiency**: Low-risk actions should not create approval bottlenecks

The approval gate architecture provides configurable, multi-layered review with automatic escalation.

---

### 3.2 Pre-Approval Workflows

Pre-approval requires explicit human approval **before** a tool executes. This is the default for all Tier 4 (high-risk write) tools.

#### 3.2.1 Pre-Approval Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│                     PRE-APPROVAL WORKFLOW                             │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  [AGENT]        [APPROVAL GATE]        [APPROVER]       [SYSTEM]     │
│    │                  │                     │               │         │
│    │─ Request Tool ──>|                     │               │         │
│    │                  │                     │               │         │
│    │                  │─ Classify Tool ─────|               │         │
│    │                  │   (tier 4 detected) │               │         │
│    │                  |                     │               │         │
│    │                  │─ Create Approval ──>|               │         │
│    │                  │   Request           │               │         │
│    |                  |                     │               │         │
│    │<─ Awaiting ──────|                     │               │         │
│    │   Approval       |                     │               │         │
│    │   (suspended)    |                     │               │         │
│    │                  |                     │               │         │
│    │                  |<── Approve/Deny ───|               │         │
│    │                  |   (human decision)  │               │         │
│    │                  |                     │               │         │
│    │                  │─ Log Decision ──────────────────────>|         │
│    │                  |                     │               │         │
│    │   [If APPROVED]  |                     │               │         │
│    │<─ Execute Tool ──|                     │               │         │
│    │                  |                     │               │         │
│    │   [If DENIED]    |                     │               │         │
│    │<─ Return Error ──|                     │               │         │
│    │   (with reason)  |                     │               │         │
│    │                  |                     │               │         │
│    │   [If TIMEOUT]   |                     │               │         │
│    │<─ Escalate ──────|                     │               │         │
│    │   or Cancel      |                     │               │         │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

#### 3.2.2 Pre-Approval Implementation

```python
# approval_gates.py
"""Human approval gate system for clinical AI agent tool invocation."""

from __future__ import annotations

import uuid
import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum, auto
from typing import Optional, Callable, Any


class ApprovalState(str, Enum):
    CREATED = "created"
    PENDING_REVIEW = "pending_review"
    APPROVED = "approved"
    DENIED = "denied"
    TIMED_OUT = "timed_out"
    ESCALATED = "escalated"
    CANCELLED = "cancelled"


class ApprovalUrgency(str, Enum):
    ROUTINE = "routine"           # Standard queue
    PRIORITY = "priority"         # Expedited review
    URGENT = "urgent"            # Immediate notification
    CRITICAL = "critical"        # Page-level alert


@dataclass
class ApprovalRequest:
    """A request for human approval of an AI agent tool call."""
    request_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    workflow_id: str = ""          # Links to parent workflow

    # Who
    requester_id: str = ""         # Agent that made the request
    session_owner_id: str = ""     # Clinician owning the session
    approver_id: Optional[str] = None
    escalation_approver_id: Optional[str] = None

    # What
    tool_name: str = ""
    tool_classification: str = ""
    proposed_action_description: str = ""
    proposed_parameters: dict = field(default_factory=dict)

    # Context
    patient_id: Optional[str] = None
    department: Optional[str] = None
    clinical_context: str = ""     # Free-form clinical context
    ai_reasoning: str = ""         # Agent's explanation for the action
    supporting_evidence: list = field(default_factory=list)

    # When
    created_at: datetime = field(default_factory=datetime.utcnow)
    expires_at: Optional[datetime] = None
    decided_at: Optional[datetime] = None

    # How
    state: ApprovalState = ApprovalState.CREATED
    urgency: ApprovalUrgency = ApprovalUrgency.ROUTINE
    escalation_level: int = 0
    max_escalation_level: int = 3
    denial_reason: Optional[str] = None
    approval_conditions: list[str] = field(default_factory=list)

    # Audit
    audit_log: list[dict] = field(default_factory=list)
    notification_log: list[dict] = field(default_factory=list)


class PreApprovalWorkflow:
    """Pre-approval workflow engine for clinical AI tool calls."""

    def __init__(
        self,
        default_timeout: int = 300,
        escalation_multiplier: float = 1.5,
    ):
        self.default_timeout = default_timeout
        self.escalation_multiplier = escalation_multiplier
        self._requests: dict[str, ApprovalRequest] = {}
        self._notification_handlers: list[Callable] = []
        self._escalation_handlers: list[Callable] = []
        self._decision_callbacks: dict[str, asyncio.Event] = {}

    async def create_request(
        self,
        session_owner_id: str,
        requester_id: str,
        tool_name: str,
        tool_classification: str,
        proposed_action_description: str,
        proposed_parameters: dict,
        patient_id: Optional[str] = None,
        urgency: ApprovalUrgency = ApprovalUrgency.ROUTINE,
        timeout_seconds: Optional[int] = None,
        clinical_context: str = "",
        ai_reasoning: str = "",
    ) -> ApprovalRequest:
        """Create a new pre-approval request."""
        timeout = timeout_seconds or self._get_default_timeout(tool_classification)
        expires = datetime.utcnow() + timedelta(seconds=timeout)

        request = ApprovalRequest(
            session_owner_id=session_owner_id,
            requester_id=requester_id,
            tool_name=tool_name,
            tool_classification=tool_classification,
            proposed_action_description=proposed_action_description,
            proposed_parameters=proposed_parameters,
            patient_id=patient_id,
            urgency=urgency,
            expires_at=expires,
            clinical_context=clinical_context,
            ai_reasoning=ai_reasoning,
        )

        request.state = ApprovalState.PENDING_REVIEW
        self._requests[request.request_id] = request
        self._decision_callbacks[request.request_id] = asyncio.Event()

        # Log creation
        self._log_event(request, "request_created", {"timeout": timeout})

        # Notify approvers
        await self._notify_approvers(request)

        return request

    async def approve(
        self,
        request_id: str,
        approver_id: str,
        conditions: Optional[list[str]] = None,
    ) -> ApprovalRequest:
        """Approve a pending request."""
        request = self._get_request(request_id)

        if request.state not in (ApprovalState.PENDING_REVIEW, ApprovalState.ESCALATED):
            raise InvalidApprovalStateError(
                f"Cannot approve request in state {request.state}"
            )

        request.approver_id = approver_id
        request.state = ApprovalState.APPROVED
        request.decided_at = datetime.utcnow()
        if conditions:
            request.approval_conditions = conditions

        self._log_event(request, "approved", {"approver": approver_id, "conditions": conditions})
        self._decision_callbacks[request_id].set()

        return request

    async def deny(
        self,
        request_id: str,
        approver_id: str,
        reason: str,
    ) -> ApprovalRequest:
        """Deny a pending request."""
        request = self._get_request(request_id)

        if request.state not in (ApprovalState.PENDING_REVIEW, ApprovalState.ESCALATED):
            raise InvalidApprovalStateError(
                f"Cannot deny request in state {request.state}"
            )

        request.approver_id = approver_id
        request.state = ApprovalState.DENIED
        request.decided_at = datetime.utcnow()
        request.denial_reason = reason

        self._log_event(request, "denied", {"approver": approver_id, "reason": reason})
        self._decision_callbacks[request_id].set()

        return request

    async def wait_for_decision(
        self,
        request_id: str,
    ) -> ApprovalState:
        """Wait for a decision on a request with timeout handling."""
        request = self._get_request(request_id)
        event = self._decision_callbacks[request_id]

        # Calculate remaining time
        remaining = (request.expires_at - datetime.utcnow()).total_seconds()
        if remaining <= 0:
            request.state = ApprovalState.TIMED_OUT
            return ApprovalState.TIMED_OUT

        try:
            await asyncio.wait_for(event.wait(), timeout=remaining)
        except asyncio.TimeoutError:
            # Check if escalation is available
            if request.escalation_level < request.max_escalation_level:
                await self._escalate(request)
                return await self.wait_for_decision(request_id)
            else:
                request.state = ApprovalState.TIMED_OUT
                return ApprovalState.TIMED_OUT

        return request.state

    async def _escalate(self, request: ApprovalRequest) -> None:
        """Escalate a request to the next approval level."""
        request.escalation_level += 1
        old_expiry = request.expires_at

        # Extend timeout
        extension = self.default_timeout * (self.escalation_multiplier ** request.escalation_level)
        request.expires_at = datetime.utcnow() + timedelta(seconds=extension)
        request.state = ApprovalState.ESCALATED

        # Reset event for new wait cycle
        self._decision_callbacks[request.request_id] = asyncio.Event()

        self._log_event(request, "escalated", {
            "level": request.escalation_level,
            "old_expiry": old_expiry.isoformat(),
            "new_expiry": request.expires_at.isoformat(),
        })

        # Notify escalation handlers
        for handler in self._escalation_handlers:
            try:
                await handler(request)
            except Exception:
                pass

    def _get_request(self, request_id: str) -> ApprovalRequest:
        request = self._requests.get(request_id)
        if not request:
            raise ValueError(f"Approval request {request_id} not found")
        return request

    def _get_default_timeout(self, classification: str) -> int:
        timeouts = {
            "high_risk_write": 300,
            "medium_risk_write": 180,
            "low_risk_write": 60,
        }
        return timeouts.get(classification, 300)

    def _log_event(self, request: ApprovalRequest, event: str, details: dict) -> None:
        request.audit_log.append({
            "timestamp": datetime.utcnow().isoformat(),
            "event": event,
            "details": details,
        })

    async def _notify_approvers(self, request: ApprovalRequest) -> None:
        for handler in self._notification_handlers:
            try:
                await handler(request)
            except Exception:
                pass

    def register_notification_handler(self, handler: Callable) -> None:
        self._notification_handlers.append(handler)

    def register_escalation_handler(self, handler: Callable) -> None:
        self._escalation_handlers.append(handler)


class InvalidApprovalStateError(Exception):
    """Raised when an approval operation is attempted in an invalid state."""
```

---

### 3.3 Post-Hoc Review

Post-hoc review examines tool calls **after** execution. It applies to:
- Tier 3 (medium-risk write) tools executed without pre-approval
- Break-glass emergency access
- Batch operations
- Actions taken during system degradation

```python
# post_hoc_review.py
"""Post-hoc review system for clinical AI agent actions."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Optional, list
from enum import Enum


class ReviewStatus(str, Enum):
    PENDING_REVIEW = "pending_review"
    REVIEWED_APPROVED = "reviewed_approved"
    REVIEWED_FLAGGED = "reviewed_flagged"
    REVIEWED_ESCALATED = "reviewed_escalated"
    OVERDUE = "overdue"


@dataclass
class PostHocReviewItem:
    """An item requiring post-hoc human review."""
    review_id: str
    action_id: str                    # Links to audit log
    tool_name: str
    tool_classification: str
    executed_by_agent: str
    session_owner_id: str
    patient_id: Optional[str]
    execution_timestamp: datetime
    parameters: dict
    result_summary: str

    # Review tracking
    status: ReviewStatus = ReviewStatus.PENDING_REVIEW
    assigned_reviewer: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    reviewer_notes: Optional[str] = None
    review_due_by: Optional[datetime] = None
    escalation_count: int = 0

    # Risk scoring
    risk_score: float = 0.0           # 0.0 - 1.0, auto-calculated
    risk_factors: list[str] = field(default_factory=list)


class PostHocReviewEngine:
    """Engine for managing post-hoc review of AI agent actions."""

    REVIEW_DEADLINES = {
        "high_risk_write": timedelta(hours=24),
        "medium_risk_write": timedelta(hours=72),
        "low_risk_write": timedelta(days=7),
        "break_glass": timedelta(hours=4),
    }

    RISK_THRESHOLD_FLAG = 0.6
    RISK_THRESHOLD_ESCALATE = 0.8

    def __init__(self):
        self._pending_reviews: dict[str, PostHocReviewItem] = {}
        self._reviewed_items: list[PostHocReviewItem] = []

    def create_review_item(
        self,
        action_id: str,
        tool_name: str,
        tool_classification: str,
        executed_by_agent: str,
        session_owner_id: str,
        execution_timestamp: datetime,
        parameters: dict,
        result_summary: str,
        patient_id: Optional[str] = None,
    ) -> PostHocReviewItem:
        """Create a post-hoc review item for an executed action."""
        # Calculate risk score
        risk_score, risk_factors = self._calculate_risk(
            tool_name, tool_classification, parameters, patient_id
        )

        # Determine review deadline
        deadline = self.REVIEW_DEADLINES.get(
            tool_classification, timedelta(hours=24)
        )
        review_due = execution_timestamp + deadline

        # Auto-escalate high-risk items
        status = ReviewStatus.PENDING_REVIEW
        if risk_score >= self.RISK_THRESHOLD_ESCALATE:
            status = ReviewStatus.REVIEWED_ESCALATED

        item = PostHocReviewItem(
            review_id=f"phr_{action_id}",
            action_id=action_id,
            tool_name=tool_name,
            tool_classification=tool_classification,
            executed_by_agent=executed_by_agent,
            session_owner_id=session_owner_id,
            patient_id=patient_id,
            execution_timestamp=execution_timestamp,
            parameters=parameters,
            result_summary=result_summary,
            status=status,
            review_due_by=review_due,
            risk_score=risk_score,
            risk_factors=risk_factors,
        )

        self._pending_reviews[item.review_id] = item
        return item

    def submit_review(
        self,
        review_id: str,
        reviewer_id: str,
        outcome: str,           # "approved", "flagged", "escalated"
        notes: str = "",
    ) -> PostHocReviewItem:
        """Submit a post-hoc review decision."""
        item = self._pending_reviews.get(review_id)
        if not item:
            raise ValueError(f"Review item {review_id} not found")

        item.assigned_reviewer = reviewer_id
        item.reviewed_at = datetime.utcnow()
        item.reviewer_notes = notes

        if outcome == "approved":
            item.status = ReviewStatus.REVIEWED_APPROVED
        elif outcome == "flagged":
            item.status = ReviewStatus.REVIEWED_FLAGGED
        elif outcome == "escalated":
            item.status = ReviewStatus.REVIEWED_ESCALATED
            item.escalation_count += 1

        self._reviewed_items.append(item)
        del self._pending_reviews[review_id]

        return item

    def get_overdue_items(self) -> list[PostHocReviewItem]:
        """Get all review items past their review deadline."""
        now = datetime.utcnow()
        overdue = []
        for item in self._pending_reviews.values():
            if item.review_due_by and now > item.review_due_by:
                item.status = ReviewStatus.OVERDUE
                overdue.append(item)
        return overdue

    def get_flagged_items(self) -> list[PostHocReviewItem]:
        """Get items flagged for attention (high risk score)."""
        return [
            item for item in self._pending_reviews.values()
            if item.risk_score >= self.RISK_THRESHOLD_FLAG
            and item.status == ReviewStatus.PENDING_REVIEW
        ]

    def get_pending_for_reviewer(self, reviewer_id: str) -> list[PostHocReviewItem]:
        """Get pending review items assigned to a specific reviewer."""
        return [
            item for item in self._pending_reviews.values()
            if item.assigned_reviewer == reviewer_id
            and item.status == ReviewStatus.PENDING_REVIEW
        ]

    def _calculate_risk(
        self,
        tool_name: str,
        tool_classification: str,
        parameters: dict,
        patient_id: Optional[str],
    ) -> tuple[float, list[str]]:
        """Calculate risk score for a post-hoc review item."""
        score = 0.0
        factors = []

        # Base risk from classification
        base_scores = {
            "high_risk_write": 0.5,
            "medium_risk_write": 0.3,
            "low_risk_write": 0.1,
            "break_glass": 0.8,
        }
        score += base_scores.get(tool_classification, 0.3)
        factors.append(f"classification:{tool_classification}")

        # Risk from specific tools
        high_risk_tools = [
            "send_patient_message_clinical",
            "generate_clinical_report",
            "export_patient_data",
            "update_medication_list",
        ]
        if tool_name in high_risk_tools:
            score += 0.2
            factors.append(f"high_risk_tool:{tool_name}")

        # Risk from patient sensitivity (simplified)
        if patient_id:
            score += 0.1
            factors.append("patient_specific_action")

        # Parameter risk analysis
        if "clinical_content" in str(parameters).lower():
            score += 0.1
            factors.append("contains_clinical_content")

        return min(score, 1.0), factors
```

---

### 3.4 Emergency Bypass with Audit

Emergency bypass allows critical actions to proceed when normal approval workflows would cause patient harm. This is distinct from break-glass: break-glass grants temporary permission elevation, while emergency bypass short-circuits a specific approval gate for an immediate clinical need.

```python
# emergency_bypass.py
"""Emergency bypass system for time-critical clinical AI actions."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


@dataclass
class EmergencyBypassRecord:
    """Record of an emergency bypass event."""
    bypass_id: str
    original_request_id: str
    tool_name: str
    patient_id: Optional[str]
    requesting_clinician: str
    clinician_role: str
    clinical_justification: str
    bypass_triggered_at: datetime
    auto_expires_at: datetime
    action_executed: bool = False
    execution_timestamp: Optional[datetime] = None
    post_hoc_review_completed: bool = False
    review_outcome: Optional[str] = None
    notifications_sent: list[str] = field(default_factory=list)


class EmergencyBypass:
    """Emergency bypass with mandatory audit and post-hoc review."""

    MAX_BYPASS_DURATION_MINUTES = 30
    MANDATORY_REVIEW_HOURS = 4

    def __init__(self):
        self._active_bypasses: dict[str, EmergencyBypassRecord] = {}
        self._bypass_history: list[EmergencyBypassRecord] = []

    async def request_bypass(
        self,
        original_request_id: str,
        tool_name: str,
        requesting_clinician: str,
        clinician_role: str,
        clinical_justification: str,
        patient_id: Optional[str] = None,
    ) -> EmergencyBypassRecord:
        """Request emergency bypass of approval gates."""
        # Validate role can request bypass
        if clinician_role not in ("attending_physician", "emergency_physician", "clinical_director"):
            raise PermissionError(
                f"Role {clinician_role} cannot request emergency bypass"
            )

        if len(clinical_justification) < 30:
            raise ValueError(
                "Clinical justification must be at least 30 characters"
            )

        record = EmergencyBypassRecord(
            bypass_id=f"eb_{datetime.utcnow().timestamp()}",
            original_request_id=original_request_id,
            tool_name=tool_name,
            patient_id=patient_id,
            requesting_clinician=requesting_clinician,
            clinician_role=clinician_role,
            clinical_justification=clinical_justification,
            bypass_triggered_at=datetime.utcnow(),
            auto_expires_at=datetime.utcnow() + timedelta(
                minutes=self.MAX_BYPASS_DURATION_MINUTES
            ),
        )

        self._active_bypasses[record.bypass_id] = record
        self._bypass_history.append(record)

        # Immediate notifications
        await self._send_notifications(record)

        return record

    def validate_bypass(self, bypass_id: str) -> bool:
        """Check if a bypass is still valid."""
        record = self._active_bypasses.get(bypass_id)
        if not record:
            return False
        if datetime.utcnow() > record.auto_expires_at:
            return False
        if record.action_executed:
            return False  # One-time use
        return True

    def mark_executed(self, bypass_id: str) -> None:
        """Mark a bypass as having been used."""
        record = self._active_bypasses.get(bypass_id)
        if record:
            record.action_executed = True
            record.execution_timestamp = datetime.utcnow()

    async def _send_notifications(self, record: EmergencyBypassRecord) -> None:
        """Send immediate notifications for emergency bypass."""
        # Implementation would send to security, compliance, department head
        record.notifications_sent = [
            "security_team",
            "compliance_officer",
            "department_head",
        ]
```

---

### 3.5 Delegation Chains

Delegation chains allow approval authority to flow through a defined hierarchy when the primary approver is unavailable.

```yaml
# delegation_chain.yaml
delegation_chains:
  cardiology:
    primary: "dr.smith@clinic.example"
    delegates:
      - "dr.jones@clinic.example"        # First delegate
      - "dr.williams@clinic.example"     # Second delegate
      - "nurse.supervisor@clinic.example" # Third delegate (nurse practitioner)
    max_delegation_depth: 3
    delegation_timeout_minutes: 15
    auto_escalate: true

  oncology:
    primary: "dr.chen@clinic.example"
    delegates:
      - "dr.patel@clinic.example"
      - "clinical.director@clinic.example"
    max_delegation_depth: 2
    delegation_timeout_minutes: 10
    auto_escalate: true

  emergency:
    primary: "er.chief@clinic.example"
    delegates:
      - "er.senior@clinic.example"
      - "er.attending@clinic.example"
    max_delegation_depth: 2
    delegation_timeout_minutes: 5
    auto_escalate: true
    bypass_allowed: true  # Emergency department allows bypass
```

---

### 3.6 Escalation Rules & Timeout Defaults

| Tool Classification | Default Timeout | Escalation Level 1 | Escalation Level 2 | Escalation Level 3 | Max Total |
|--------------------|-----------------|-------------------|-------------------|-------------------|-----------|
| `high_risk_write` | 5 min | +50% (7.5 min) | +100% (10 min) | +150% (12.5 min) | 35 min |
| `medium_risk_write` | 3 min | +50% (4.5 min) | +100% (6 min) | N/A | 13.5 min |
| `break_glass` | Immediate | N/A | N/A | N/A | N/A |
| `emergency_bypass` | Immediate | 5 min (review) | N/A | N/A | 5 min |

---

## 4. Tool Call Audit

### 4.1 Overview

Audit logging for clinical AI agents serves three critical purposes:
1. **Accountability**: Every action can be traced to a human clinician
2. **Compliance**: HIPAA, SOC 2, and state regulations require comprehensive audit trails
3. **Safety Analysis**: Audit logs enable retrospective analysis of AI behavior

The audit system captures the **5 W's**: **Who** initiated, **What** tool was called, **When** it occurred, **Why** (context and reasoning), and **What** the result was.

---

### 4.2 Audit Schema: The 5 W's

```python
# audit_schema.py
"""Comprehensive audit schema for clinical AI agent tool calls."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional, Any
from enum import Enum
import json


class AuditLevel(str, Enum):
    MINIMAL = "minimal"           # Routine read operations
    STANDARD = "standard"         # Normal operations
    ENHANCED = "enhanced"         # Write operations
    CRITICAL = "critical"         # High-risk operations
    ALERT = "alert"               # Security events, forbidden attempts


class ToolOutcome(str, Enum):
    SUCCESS = "success"
    PARTIAL_SUCCESS = "partial_success"
    FAILURE = "failure"
    DENIED_PERMISSION = "denied_permission"
    DENIED_APPROVAL = "denied_approval"
    TIMED_OUT = "timed_out"
    REVOKED = "revoked"
    ERROR = "error"


@dataclass
class ToolCallAuditRecord:
    """
    Complete audit record for a clinical AI agent tool call.
    This record captures the 5 W's: Who, What, When, Why, Result.
    """
    # ── Identity ─────────────────────────────────────────────────────────
    record_id: str = ""                    # Unique audit record ID
    correlation_id: str = ""               # Links related records

    # WHO
    agent_id: str = ""                     # AI agent instance ID
    agent_version: str = ""                # Model/deployment version
    session_id: str = ""                   # User session ID
    session_owner_id: str = ""             # Clinician who owns the session
    session_owner_role: str = ""           # Role of session owner
    impersonated_by: Optional[str] = None  # If acting on behalf of another

    # WHAT
    tool_name: str = ""                    # Name of tool invoked
    tool_classification: str = ""          # Tier classification
    tool_parameters: dict = field(default_factory=dict)
    tool_parameters_hash: str = ""         # SHA-256 hash of params (for integrity)

    # WHEN
    requested_at: Optional[datetime] = None
    approved_at: Optional[datetime] = None
    executed_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    duration_ms: Optional[int] = None

    # WHY (Context)
    conversation_context: str = ""         # Surrounding conversation
    ai_reasoning: str = ""                 # Agent's explanation
    human_justification: Optional[str] = None
    patient_id: Optional[str] = None
    encounter_id: Optional[str] = None
    department: Optional[str] = None
    clinical_context: Optional[str] = None

    # RESULT
    outcome: ToolOutcome = ToolOutcome.SUCCESS
    result_summary: str = ""
    result_details: Optional[dict] = None
    error_message: Optional[str] = None
    error_stack_trace: Optional[str] = None

    # GOVERNANCE
    approval_request_id: Optional[str] = None
    approval_status: Optional[str] = None
    approved_by: Optional[str] = None
    break_glass_session_id: Optional[str] = None
    jit_grant_id: Optional[str] = None
    permission_evaluation: dict = field(default_factory=dict)

    # ENVIRONMENT
    source_ip: Optional[str] = None
    device_id: Optional[str] = None
    network_zone: str = "internal"
    is_emergency: bool = False

    # INTEGRITY
    audit_level: AuditLevel = AuditLevel.STANDARD
    tamper_hash: str = ""                  # Cryptographic integrity hash
    previous_record_hash: Optional[str] = None  # Chain hash

    def to_dict(self) -> dict:
        """Serialize to dictionary for storage."""
        result = {}
        for key, value in self.__dict__.items():
            if isinstance(value, datetime):
                result[key] = value.isoformat()
            elif isinstance(value, Enum):
                result[key] = value.value
            else:
                result[key] = value
        return result

    def to_json(self) -> str:
        """Serialize to JSON string."""
        return json.dumps(self.to_dict(), default=str)
```

---

### 4.3 Audit Storage and Retention

```python
# audit_storage.py
"""Audit storage and retention management for clinical AI."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional
from enum import Enum
import hashlib
import json


class StorageTier(str, Enum):
    HOT = "hot"           # Immediate query (< 7 days)
    WARM = "warm"         # Fast query (< 90 days)
    COLD = "cold"         // Archived (< 7 years)
    GLACIER = "glacier"   // Long-term archive (7+ years)


class RetentionPolicy(str, Enum):
    STANDARD = "standard"      # 7 years (HIPAA default)
    EXTENDED = "extended"      # 10 years (litigation hold)
    PERMANENT = "permanent"    # Indefinite (research, sentinel events)


RETENTION_SCHEDULE = {
    AuditLevel.MINIMAL:    {"retention_years": 3,  "storage_tier": StorageTier.WARM},
    AuditLevel.STANDARD:   {"retention_years": 7,  "storage_tier": StorageTier.HOT},
    AuditLevel.ENHANCED:   {"retention_years": 7,  "storage_tier": StorageTier.HOT},
    AuditLevel.CRITICAL:   {"retention_years": 10, "storage_tier": StorageTier.HOT},
    AuditLevel.ALERT:      {"retention_years": 10, "storage_tier": StorageTier.HOT},
}


class AuditStorageManager:
    """Manages audit log storage with tiered retention."""

    def __init__(self):
        self._hot_storage: list[dict] = []
        self._chain_tip_hash: Optional[str] = None

    def store(self, record: ToolCallAuditRecord) -> str:
        """Store an audit record with tamper-proof hashing."""
        # Compute tamper-evident hash
        record_data = record.to_dict()
        record_data["previous_hash"] = self._chain_tip_hash or "0" * 64

        hash_input = json.dumps(record_data, sort_keys=True, default=str)
        record.tamper_hash = hashlib.sha256(hash_input.encode()).hexdigest()
        record.previous_record_hash = self._chain_tip_hash

        self._chain_tip_hash = record.tamper_hash

        # Determine storage tier
        retention = RETENTION_SCHEDULE.get(record.audit_level, RETENTION_SCHEDULE[AuditLevel.STANDARD])

        # Store in appropriate tier
        stored_record = {
            **record.to_dict(),
            "storage_tier": retention["storage_tier"].value,
            "retention_until": (datetime.utcnow() + timedelta(days=365 * retention["retention_years"])).isoformat(),
            "inserted_at": datetime.utcnow().isoformat(),
        }

        self._hot_storage.append(stored_record)

        return record.record_id

    def verify_chain_integrity(self) -> tuple[bool, Optional[int]]:
        """Verify tamper-evident chain integrity. Returns (valid, first_broken_index)."""
        for i, record in enumerate(self._hot_storage):
            # Recompute hash
            record_copy = {k: v for k, v in record.items()
                          if k not in ("tamper_hash", "storage_tier", "retention_until", "inserted_at")}

            hash_input = json.dumps(record_copy, sort_keys=True, default=str)
            computed_hash = hashlib.sha256(hash_input.encode()).hexdigest()

            if computed_hash != record["tamper_hash"]:
                return False, i

            # Verify chain linkage
            if i > 0:
                expected_previous = self._hot_storage[i - 1]["tamper_hash"]
                if record.get("previous_record_hash") != expected_previous:
                    return False, i

        return True, None
```

---

### 4.4 Tamper-Proof Logging

```python
# tamper_proof_logging.py
"""Tamper-proof audit logging using cryptographic chain hashing."""

from __future__ import annotations

import hashlib
import hmac
import json
from datetime import datetime
from typing import Optional


class TamperProofAuditLog:
    """
    Implements a tamper-evident audit log using sequential hashing.
    Each record's hash includes the previous record's hash, creating
    a chain that detects any modification to historical records.
    """

    def __init__(self, secret_key: bytes):
        self._secret_key = secret_key
        self._chain_tip: Optional[str] = None
        self._record_count = 0

    def append(self, record_data: dict) -> dict:
        """
        Append a record to the tamper-proof log.
        Returns the record with tamper-proof metadata attached.
        """
        # Prepare record with chain metadata
        record_data["_audit"] = {
            "sequence_number": self._record_count,
            "timestamp": datetime.utcnow().isoformat(),
            "previous_hash": self._chain_tip or "0" * 64,
        }

        # Compute HMAC-SHA256 of the record
        serialized = json.dumps(record_data, sort_keys=True, default=str)
        record_hash = hmac.new(
            self._secret_key,
            serialized.encode(),
            hashlib.sha256,
        ).hexdigest()

        record_data["_audit"]["record_hash"] = record_hash
        record_data["_audit"]["integrity_proof"] = self._compute_integrity_proof(
            record_data["_audit"]["previous_hash"],
            record_hash,
        )

        # Update chain
        self._chain_tip = record_hash
        self._record_count += 1

        return record_data

    def _compute_integrity_proof(self, previous_hash: str, current_hash: str) -> str:
        """Compute a chained integrity proof."""
        combined = f"{previous_hash}:{current_hash}"
        return hmac.new(
            self._secret_key,
            combined.encode(),
            hashlib.sha256,
        ).hexdigest()

    def verify_record(self, record_data: dict) -> bool:
        """Verify a single record's integrity."""
        audit_meta = record_data.get("_audit", {})
        if not audit_meta:
            return False

        # Recompute hash
        record_copy = {k: v for k, v in record_data.items() if k != "_audit"}
        serialized = json.dumps(record_copy, sort_keys=True, default=str)
        computed_hash = hmac.new(
            self._secret_key,
            serialized.encode(),
            hashlib.sha256,
        ).hexdigest()

        return computed_hash == audit_meta.get("record_hash")

    def get_chain_tip(self) -> Optional[str]:
        return self._chain_tip

    @property
    def record_count(self) -> int:
        return self._record_count
```

---

### 4.5 Audit Querying and Reporting

```python
# audit_query.py
"""Audit query and reporting engine for clinical AI governance."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional, list
from enum import Enum


class AuditQueryFilter:
    """Filter criteria for audit log queries."""

    def __init__(
        self,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        agent_id: Optional[str] = None,
        session_owner_id: Optional[str] = None,
        tool_name: Optional[str] = None,
        tool_classification: Optional[str] = None,
        patient_id: Optional[str] = None,
        outcome: Optional[str] = None,
        audit_level: Optional[str] = None,
        department: Optional[str] = None,
        min_risk_score: Optional[float] = None,
    ):
        self.start_time = start_time
        self.end_time = end_time
        self.agent_id = agent_id
        self.session_owner_id = session_owner_id
        self.tool_name = tool_name
        self.tool_classification = tool_classification
        self.patient_id = patient_id
        self.outcome = outcome
        self.audit_level = audit_level
        self.department = department
        self.min_risk_score = min_risk_score


class AuditReporter:
    """Generates compliance and operational reports from audit logs."""

    def __init__(self, storage):
        self.storage = storage

    def query(self, filter_criteria: AuditQueryFilter) -> list[dict]:
        """Query audit log with filter criteria."""
        results = []
        for record in self.storage._hot_storage:
            if self._matches_filter(record, filter_criteria):
                results.append(record)
        return results

    def _matches_filter(self, record: dict, filt: AuditQueryFilter) -> bool:
        if filt.start_time:
            ts = datetime.fromisoformat(record.get("requested_at", "1970-01-01"))
            if ts < filt.start_time:
                return False
        if filt.end_time:
            ts = datetime.fromisoformat(record.get("requested_at", "2100-01-01"))
            if ts > filt.end_time:
                return False
        if filt.agent_id and record.get("agent_id") != filt.agent_id:
            return False
        if filt.session_owner_id and record.get("session_owner_id") != filt.session_owner_id:
            return False
        if filt.tool_name and record.get("tool_name") != filt.tool_name:
            return False
        if filt.tool_classification and record.get("tool_classification") != filt.tool_classification:
            return False
        if filt.patient_id and record.get("patient_id") != filt.patient_id:
            return False
        if filt.outcome and record.get("outcome") != filt.outcome:
            return False
        if filt.audit_level and record.get("audit_level") != filt.audit_level:
            return False
        return True

    def generate_daily_summary(self, date: datetime) -> dict:
        """Generate daily audit summary report."""
        start = date.replace(hour=0, minute=0, second=0, microsecond=0)
        end = start + timedelta(days=1)

        filt = AuditQueryFilter(start_time=start, end_time=end)
        records = self.query(filt)

        total = len(records)
        by_classification = {}
        by_outcome = {}
        by_agent = {}
        denied_count = 0
        break_glass_count = 0

        for r in records:
            cls = r.get("tool_classification", "unknown")
            by_classification[cls] = by_classification.get(cls, 0) + 1

            outcome = r.get("outcome", "unknown")
            by_outcome[outcome] = by_outcome.get(outcome, 0) + 1

            agent = r.get("agent_id", "unknown")
            by_agent[agent] = by_agent.get(agent, 0) + 1

            if outcome in ("denied_permission", "denied_approval"):
                denied_count += 1
            if r.get("break_glass_session_id"):
                break_glass_count += 1

        return {
            "date": date.isoformat(),
            "total_records": total,
            "by_classification": by_classification,
            "by_outcome": by_outcome,
            "by_agent": by_agent,
            "denied_count": denied_count,
            "break_glass_count": break_glass_count,
            "denial_rate": denied_count / total if total > 0 else 0,
        }

    def generate_hipaa_report(self, start_date: datetime, end_date: datetime) -> dict:
        """Generate HIPAA compliance report for audit period."""
        filt = AuditQueryFilter(start_time=start_date, end_time=end_date)
        records = self.query(filt)

        phi_access_count = sum(
            1 for r in records
            if r.get("patient_id") is not None
        )

        unique_patients = len(set(
            r.get("patient_id") for r in records
            if r.get("patient_id")
        ))

        unique_users = len(set(
            r.get("session_owner_id") for r in records
            if r.get("session_owner_id")
        ))

        # Check for unauthorized access attempts
        unauthorized = [
            r for r in records
            if r.get("outcome") == "denied_permission"
        ]

        return {
            "report_type": "HIPAA_Audit_Trail",
            "period": f"{start_date.isoformat()} to {end_date.isoformat()}",
            "total_access_events": len(records),
            "phi_access_events": phi_access_count,
            "unique_patients_accessed": unique_patients,
            "unique_users": unique_users,
            "unauthorized_access_attempts": len(unauthorized),
            "unauthorized_details": [
                {
                    "timestamp": r.get("requested_at"),
                    "user": r.get("session_owner_id"),
                    "tool": r.get("tool_name"),
                }
                for r in unauthorized
            ],
            "break_glass_events": len([r for r in records if r.get("break_glass_session_id")]),
            "data_integrity_verified": True,  # From chain verification
        }

    def generate_compliance_dashboard(self) -> dict:
        """Generate real-time compliance dashboard data."""
        now = datetime.utcnow()
        last_24h = now - timedelta(hours=24)
        last_7d = now - timedelta(days=7)

        recent = self.query(AuditQueryFilter(start_time=last_24h))
        weekly = self.query(AuditQueryFilter(start_time=last_7d))

        return {
            "generated_at": now.isoformat(),
            "last_24h": {
                "total_calls": len(recent),
                "high_risk_calls": len([r for r in recent if r.get("tool_classification") == "high_risk_write"]),
                "forbidden_attempts": len([r for r in recent if r.get("tool_classification") == "forbidden_autonomous"]),
                "approval_pending": len([r for r in recent if r.get("approval_status") == "pending"]),
                "break_glass_active": len([r for r in recent if r.get("break_glass_session_id")]),
            },
            "last_7d": {
                "total_calls": len(weekly),
                "unique_clinicians": len(set(r.get("session_owner_id") for r in weekly)),
                "unique_patients": len(set(r.get("patient_id") for r in weekly if r.get("patient_id"))),
                "avg_approval_time_ms": self._calc_avg_approval_time(weekly),
            },
        }

    def _calc_avg_approval_time(self, records: list[dict]) -> Optional[float]:
        times = []
        for r in records:
            req = r.get("requested_at")
            app = r.get("approved_at")
            if req and app:
                try:
                    dt_req = datetime.fromisoformat(req)
                    dt_app = datetime.fromisoformat(app)
                    times.append((dt_app - dt_req).total_seconds() * 1000)
                except Exception:
                    pass
        return sum(times) / len(times) if times else None
```

---

### 4.6 Real-Time Audit Streams

```python
# realtime_audit.py
"""Real-time audit streaming for live monitoring and alerting."""

from __future__ import annotations

import asyncio
import json
from datetime import datetime
from typing import Callable, Set
from dataclasses import dataclass


class RealtimeAuditStream:
    """
    Real-time audit stream for live monitoring of AI agent tool calls.
    Publishes audit events to WebSocket subscribers for dashboards,
    alerting, and SIEM integration.
    """

    def __init__(self):
        self._subscribers: Set[Callable] = set()
        self._alert_rules: list[Callable] = []
        self._event_buffer: list[dict] = []
        self._buffer_size = 1000

    def subscribe(self, callback: Callable[[dict], None]) -> None:
        """Subscribe to real-time audit events."""
        self._subscribers.add(callback)

    def unsubscribe(self, callback: Callable[[dict], None]) -> None:
        """Unsubscribe from real-time audit events."""
        self._subscribers.discard(callback)

    def add_alert_rule(self, rule: Callable[[dict], Optional[dict]]) -> None:
        """
        Add an alert rule. Rule receives audit event, returns alert dict if triggered.
        """
        self._alert_rules.append(rule)

    async def publish(self, audit_event: dict) -> None:
        """Publish an audit event to all subscribers."""
        enriched_event = {
            **audit_event,
            "_stream_meta": {
                "published_at": datetime.utcnow().isoformat(),
                "stream_sequence": len(self._event_buffer),
            },
        }

        # Buffer
        self._event_buffer.append(enriched_event)
        if len(self._event_buffer) > self._buffer_size:
            self._event_buffer.pop(0)

        # Notify subscribers
        for subscriber in list(self._subscribers):
            try:
                subscriber(enriched_event)
            except Exception:
                self._subscribers.discard(subscriber)

        # Check alert rules
        for rule in self._alert_rules:
            try:
                alert = rule(enriched_event)
                if alert:
                    await self.publish_alert(alert)
            except Exception:
                pass

    async def publish_alert(self, alert: dict) -> None:
        """Publish an alert to all subscribers."""
        alert_event = {
            "type": "alert",
            "alert": alert,
            "timestamp": datetime.utcnow().isoformat(),
        }
        for subscriber in list(self._subscribers):
            try:
                subscriber(alert_event)
            except Exception:
                pass

    # ── Pre-built Alert Rules ─────────────────────────────────────────────

    @staticmethod
    def forbidden_tool_alert_rule(event: dict) -> Optional[dict]:
        """Alert when forbidden tools are attempted."""
        if event.get("tool_classification") == "forbidden_autonomous":
            return {
                "severity": "critical",
                "alert_type": "FORBIDDEN_TOOL_ATTEMPT",
                "title": "AI Agent attempted forbidden tool invocation",
                "description": (
                    f"Agent {event.get('agent_id')} attempted to invoke "
                    f"forbidden tool {event.get('tool_name')}"
                ),
                "agent_id": event.get("agent_id"),
                "session_owner": event.get("session_owner_id"),
                "tool": event.get("tool_name"),
            }
        return None

    @staticmethod
    def break_glass_alert_rule(event: dict) -> Optional[dict]:
        """Alert on break-glass usage."""
        if event.get("break_glass_session_id"):
            return {
                "severity": "high",
                "alert_type": "BREAK_GLASS_USED",
                "title": "Break-glass emergency access activated",
                "session_owner": event.get("session_owner_id"),
                "tool": event.get("tool_name"),
            }
        return None

    @staticmethod
    def high_rate_alert_rule(event: dict, threshold: int = 100) -> Optional[dict]:
        """Alert on high-rate tool usage (rate limiting concern)."""
        # This would need state tracking; simplified here
        return None

    @staticmethod
    def after_hours_high_risk_rule(event: dict) -> Optional[dict]:
        """Alert on high-risk tool use after hours."""
        if event.get("tool_classification") != "high_risk_write":
            return None
        ts = event.get("requested_at", "")
        try:
            hour = datetime.fromisoformat(ts).hour
            if hour < 6 or hour > 22:
                return {
                    "severity": "medium",
                    "alert_type": "AFTER_HOURS_HIGH_RISK",
                    "title": "High-risk tool used after hours",
                    "tool": event.get("tool_name"),
                    "user": event.get("session_owner_id"),
                    "hour": hour,
                }
        except Exception:
            pass
        return None
```

---

## 5. Least Privilege Implementation

### 5.1 Overview

The principle of least privilege states that an AI agent should have **only** the minimum permissions necessary to perform its current task. In clinical AI, this principle is implemented through six interlocking mechanisms.

---

### 5.2 Default-Deny

Every tool request that does not match an explicit permission grant is denied. There is no implicit access.

```python
# default_deny.py
"""Default-deny permission enforcement for clinical AI."""

from enum import Enum


class PermissionDecision(str, Enum):
    EXPLICIT_ALLOW = "explicit_allow"
    EXPLICIT_DENY = "explicit_deny"
    DEFAULT_DENY = "default_deny"
    CONDITIONAL_ALLOW = "conditional_allow"


class DefaultDenyEnforcer:
    """
    Enforces default-deny: any request without an explicit matching
    permission rule is denied.
    """

    def evaluate(self, request_context: dict, permission_rules: list[dict]) -> dict:
        """
        Evaluate permission request against rules.
        Returns allow ONLY if at least one rule explicitly matches.
        """
        if not permission_rules:
            return {
                "decision": PermissionDecision.DEFAULT_DENY,
                "reason": "No permission rules defined",
                "matched_rule": None,
            }

        for rule in permission_rules:
            if self._rule_matches(rule, request_context):
                if rule.get("effect") == "allow":
                    return {
                        "decision": PermissionDecision.EXPLICIT_ALLOW,
                        "reason": f"Matched rule: {rule.get('name', 'unnamed')}",
                        "matched_rule": rule,
                        "conditions": rule.get("conditions", []),
                    }
                elif rule.get("effect") == "deny":
                    return {
                        "decision": PermissionDecision.EXPLICIT_DENY,
                        "reason": f"Explicitly denied by rule: {rule.get('name', 'unnamed')}",
                        "matched_rule": rule,
                    }

        # DEFAULT DENY: No matching rule found
        return {
            "decision": PermissionDecision.DEFAULT_DENY,
            "reason": (
                f"No permission rule matched for tool={request_context.get('tool_name')}, "
                f"role={request_context.get('role')}, "
                f"classification={request_context.get('classification')}"
            ),
            "matched_rule": None,
        }

    def _rule_matches(self, rule: dict, context: dict) -> bool:
        """Check if a rule matches the request context."""
        conditions = rule.get("conditions", {})
        for key, expected in conditions.items():
            actual = context.get(key)
            if isinstance(expected, list):
                if actual not in expected:
                    return False
            else:
                if actual != expected:
                    return False
        return True
```

---

### 5.3 Explicit Grants Only

```python
# explicit_grants.py
"""Explicit grant management for clinical AI permissions."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Optional


@dataclass
class ExplicitGrant:
    """An explicitly granted permission."""
    grant_id: str
    granted_by: str                    # Who granted the permission
    granted_to_role: str               # Which role receives it
    tool_name: str
    tool_classification: str
    conditions: dict = field(default_factory=dict)
    granted_at: datetime = field(default_factory=datetime.utcnow)
    expires_at: Optional[datetime] = None
    revoked_at: Optional[datetime] = None
    revoked_by: Optional[str] = None
    is_active: bool = True


class ExplicitGrantManager:
    """Manages explicit permission grants with lifecycle tracking."""

    def __init__(self):
        self._grants: dict[str, ExplicitGrant] = {}

    def grant(
        self,
        granted_by: str,
        granted_to_role: str,
        tool_name: str,
        tool_classification: str,
        duration_hours: Optional[int] = None,
        conditions: Optional[dict] = None,
    ) -> ExplicitGrant:
        """Create an explicit permission grant."""
        expires = None
        if duration_hours:
            expires = datetime.utcnow() + timedelta(hours=duration_hours)

        grant = ExplicitGrant(
            grant_id=f"grant_{datetime.utcnow().timestamp()}_{tool_name}",
            granted_by=granted_by,
            granted_to_role=granted_to_role,
            tool_name=tool_name,
            tool_classification=tool_classification,
            conditions=conditions or {},
            expires_at=expires,
        )

        self._grants[grant.grant_id] = grant
        return grant

    def revoke(self, grant_id: str, revoked_by: str) -> None:
        """Revoke an explicit grant."""
        grant = self._grants.get(grant_id)
        if grant:
            grant.revoked_at = datetime.utcnow()
            grant.revoked_by = revoked_by
            grant.is_active = False

    def check_grant(
        self,
        role: str,
        tool_name: str,
        context: Optional[dict] = None,
    ) -> bool:
        """Check if an active explicit grant exists."""
        for grant in self._grants.values():
            if not grant.is_active:
                continue
            if grant.granted_to_role != role:
                continue
            if grant.tool_name != tool_name:
                continue
            if grant.expires_at and datetime.utcnow() > grant.expires_at:
                continue
            if grant.conditions and context:
                if not self._check_conditions(grant.conditions, context):
                    continue
            return True
        return False

    def _check_conditions(self, conditions: dict, context: dict) -> bool:
        """Check if context satisfies grant conditions."""
        for key, value in conditions.items():
            if context.get(key) != value:
                return False
        return True
```

---

### 5.4 Scope Minimization

```python
# scope_minimization.py
"""Scope minimization for clinical AI agent permissions."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional, list
from datetime import datetime


@dataclass
class MinimizedScope:
    """A minimized permission scope for a specific task."""
    patient_ids: list[str] = field(default_factory=list)
    tool_names: list[str] = field(default_factory=list)
    max_classification: str = "read_only"
    department: Optional[str] = None
    time_window_hours: int = 1
    data_fields: list[str] = field(default_factory=list)
    purpose: str = ""


class ScopeMinimizer:
    """
    Dynamically minimizes permission scopes based on the specific
    clinical task at hand. Uses the minimum necessary principle.
    """

    def minimize_for_task(
        self,
        task_description: str,
        patient_id: Optional[str],
        required_tools: list[str],
        base_role: str,
    ) -> MinimizedScope:
        """
        Create a minimized scope for a specific clinical task.
        This implements HIPAA minimum necessary.
        """
        scope = MinimizedScope(
            purpose=task_description,
        )

        # Minimize patient access
        if patient_id:
            scope.patient_ids = [patient_id]
        else:
            scope.patient_ids = []  # No patient access if not specified

        # Minimize tool set to only what's needed
        scope.tool_names = required_tools

        # Determine minimum classification needed
        scope.max_classification = self._minimum_classification_for_tools(required_tools)

        # Minimize data fields based on task
        scope.data_fields = self._fields_for_task(task_description)

        # Time window
        scope.time_window_hours = self._time_window_for_task(task_description)

        return scope

    def _minimum_classification_for_tools(self, tools: list[str]) -> str:
        """Determine the minimum classification that covers all required tools."""
        from classification_matrix import COMPLETE_CLASSIFICATION

        max_tier = "read_only"
        tier_order = ["read_only", "low_risk_write", "medium_risk_write", "high_risk_write"]

        for tool in tools:
            meta = COMPLETE_CLASSIFICATION.get(tool, {})
            tool_tier = meta.get("tier", "read_only")
            if tier_order.index(tool_tier.value if hasattr(tool_tier, "value") else tool_tier) > \
               tier_order.index(max_tier):
                max_tier = tool_tier.value if hasattr(tool_tier, "value") else tool_tier

        return max_tier

    def _fields_for_task(self, task: str) -> list[str]:
        """Determine minimum data fields needed for a task."""
        field_map = {
            "appointment_scheduling": ["demographics", "contact_info", "insurance"],
            "clinical_summary": ["diagnoses", "medications", "allergies", "vitals"],
            "medication_review": ["medications", "allergies", "lab_results"],
            "followup_planning": ["care_plan", "appointments", "contact_info"],
        }
        return field_map.get(task, ["minimal_summary"])

    def _time_window_for_task(self, task: str) -> int:
        """Determine appropriate time window for task."""
        windows = {
            "appointment_scheduling": 1,
            "clinical_summary": 4,
            "medication_review": 2,
            "followup_planning": 2,
        }
        return windows.get(task, 1)
```

---

### 5.5 Time-Bound Access

```python
# time_bound_access.py
"""Time-bound access control for clinical AI agents."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional


@dataclass
class TimeBoundSession:
    """A time-bound access session."""
    session_id: str
    owner_id: str
    role: str
    created_at: datetime
    expires_at: datetime
    max_tool_classification: str
    allowed_tools: list[str]
    patient_scope: list[str]
    is_active: bool = True


class TimeBoundAccessManager:
    """Manages time-bound access sessions for clinical AI."""

    DEFAULT_SESSION_DURATIONS = {
        "attending_physician": timedelta(hours=12),
        "resident_physician": timedelta(hours=8),
        "nurse_practitioner": timedelta(hours=12),
        "medical_assistant": timedelta(hours=8),
        "front_desk_admin": timedelta(hours=8),
    }

    MAX_SESSION_DURATION = timedelta(hours=24)
    WARNING_BEFORE_EXPIRY = timedelta(minutes=15)

    def __init__(self):
        self._sessions: dict[str, TimeBoundSession] = {}

    def create_session(
        self,
        owner_id: str,
        role: str,
        allowed_tools: list[str],
        patient_scope: list[str],
        max_classification: str,
        custom_duration: Optional[timedelta] = None,
    ) -> TimeBoundSession:
        """Create a time-bound access session."""
        duration = custom_duration or self.DEFAULT_SESSION_DURATIONS.get(
            role, timedelta(hours=8)
        )
        duration = min(duration, self.MAX_SESSION_DURATION)

        now = datetime.utcnow()
        session = TimeBoundSession(
            session_id=f"sess_{now.timestamp()}_{owner_id}",
            owner_id=owner_id,
            role=role,
            created_at=now,
            expires_at=now + duration,
            max_tool_classification=max_classification,
            allowed_tools=allowed_tools,
            patient_scope=patient_scope,
        )

        self._sessions[session.session_id] = session
        return session

    def validate_session(self, session_id: str, tool_name: str, patient_id: Optional[str]) -> dict:
        """Validate a session for a specific tool call."""
        session = self._sessions.get(session_id)
        if not session:
            return {"valid": False, "reason": "Session not found"}

        if not session.is_active:
            return {"valid": False, "reason": "Session has been terminated"}

        if datetime.utcnow() > session.expires_at:
            session.is_active = False
            return {"valid": False, "reason": "Session has expired"}

        if tool_name not in session.allowed_tools:
            return {"valid": False, "reason": f"Tool {tool_name} not in session scope"}

        if patient_id and patient_id not in session.patient_scope:
            return {"valid": False, "reason": "Patient not in session scope"}

        # Check expiry warning
        time_remaining = session.expires_at - datetime.utcnow()
        warning = time_remaining < self.WARNING_BEFORE_EXPIRY

        return {
            "valid": True,
            "session": session,
            "expires_in_seconds": time_remaining.total_seconds(),
            "expiry_warning": warning,
        }

    def terminate_session(self, session_id: str, reason: str) -> None:
        """Immediately terminate a session."""
        session = self._sessions.get(session_id)
        if session:
            session.is_active = False

    def extend_session(self, session_id: str, extension: timedelta) -> Optional[TimeBoundSession]:
        """Extend a session (with limits)."""
        session = self._sessions.get(session_id)
        if not session or not session.is_active:
            return None

        new_expiry = session.expires_at + extension
        max_allowed = session.created_at + self.MAX_SESSION_DURATION
        session.expires_at = min(new_expiry, max_allowed)

        return session
```

---

### 5.6 Context-Aware Permissions

Context-aware permissions dynamically adjust access based on real-time situational context. This is the ABAC layer applied at runtime.

```python
# context_aware_permissions.py
"""Context-aware permission adjustments for clinical AI."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time
from typing import Optional, Callable


@dataclass
class PermissionContext:
    """Real-time context for permission evaluation."""
    current_time: datetime
    is_business_hours: bool
    is_emergency_declared: bool
    is_on_call: bool
    network_zone: str
    device_trust_level: str
    consecutive_denials: int
    patient_relationship: str  # "assigned", "covering", "consulting", "none"
    session_age_minutes: float


class ContextAwarePermissionAdjuster:
    """
    Dynamically adjusts permissions based on real-time context.
    Can elevate or restrict permissions based on situational factors.
    """

    BUSINESS_HOURS_START = time(7, 0)
    BUSINESS_HOURS_END = time(19, 0)

    def __init__(self):
        self._context_providers: list[Callable] = []

    def build_context(
        self,
        user_id: str,
        role: str,
        device_id: str,
    ) -> PermissionContext:
        """Build current permission context."""
        now = datetime.utcnow()
        current_time = now.time()

        is_business_hours = (
            self.BUSINESS_HOURS_START <= current_time <= self.BUSINESS_HOURS_END
        )

        # These would come from actual system queries
        is_emergency = self._check_emergency_status()
        is_on_call = self._check_on_call_status(user_id)
        network_zone = self._get_network_zone(device_id)
        device_trust = self._get_device_trust(device_id)
        consecutive_denials = self._get_consecutive_denials(user_id)

        return PermissionContext(
            current_time=now,
            is_business_hours=is_business_hours,
            is_emergency_declared=is_emergency,
            is_on_call=is_on_call,
            network_zone=network_zone,
            device_trust_level=device_trust,
            consecutive_denials=consecutive_denials,
            patient_relationship="assigned",  # Would be determined per-request
            session_age_minutes=0,  # Would track actual session age
        )

    def adjust_permission(
        self,
        base_permission: bool,
        tool_classification: str,
        context: PermissionContext,
    ) -> dict:
        """
        Adjust a base permission decision based on context.
        Returns adjusted decision with explanation.
        """
        adjustments = []
        final_permission = base_permission

        # Restrict high-risk outside business hours for non-on-call
        if (tool_classification == "high_risk_write"
            and not context.is_business_hours
            and not context.is_on_call
            and not context.is_emergency_declared):
            final_permission = False
            adjustments.append("high_risk_restricted_after_hours")

        # Require trusted device for high-risk
        if (tool_classification in ("high_risk_write", "medium_risk_write")
            and context.device_trust_level == "untrusted"):
            final_permission = False
            adjustments.append("untrusted_device_restriction")

        # Restrict external network for PHI
        if (tool_classification in ("high_risk_write",)
            and context.network_zone == "external"):
            final_permission = False
            adjustments.append("external_network_restriction")

        # Emergency declaration elevates permissions
        if context.is_emergency_declared and context.patient_relationship in ("assigned", "covering"):
            if not final_permission and tool_classification != "forbidden_autonomous":
                final_permission = True
                adjustments.append("emergency_elevation")

        # Consecutive denials pattern detection
        if context.consecutive_denials > 5:
            adjustments.append("suspicious_denial_pattern")

        return {
            "permitted": final_permission,
            "base_permission": base_permission,
            "adjustments": adjustments,
            "context_factors": {
                "business_hours": context.is_business_hours,
                "emergency": context.is_emergency_declared,
                "on_call": context.is_on_call,
                "device_trust": context.device_trust_level,
                "network_zone": context.network_zone,
            },
        }

    def _check_emergency_status(self) -> bool:
        # Would query emergency management system
        return False

    def _check_on_call_status(self, user_id: str) -> bool:
        # Would query on-call schedule
        return False

    def _get_network_zone(self, device_id: str) -> str:
        # Would query network management
        return "internal"

    def _get_device_trust(self, device_id: str) -> str:
        # Would query device management
        return "standard"

    def _get_consecutive_denials(self, user_id: str) -> int:
        # Would query recent audit log
        return 0
```

---

## 6. Revocation & Emergency Controls

### 6.1 Overview

Revocation and emergency controls provide the ability to immediately reduce or eliminate an AI agent's capabilities in response to safety concerns, policy violations, or operational emergencies. These controls must operate at sub-second latency.

---

### 6.2 Instant Tool Revocation

```python
# revocation_controls.py
"""Revocation and emergency control system for clinical AI agents."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional, Callable, Set
from enum import Enum


class RevocationScope(str, Enum):
    SINGLE_TOOL = "single_tool"           # Revoke one specific tool
    TOOL_CLASS = "tool_class"             # Revoke all tools in a class
    PATIENT_SCOPE = "patient_scope"       # Revoke access to specific patient
    SESSION = "session"                   # Revoke entire session
    AGENT = "agent"                       # Revoke all access for agent
    CLINICIAN = "clinician"              # Revoke all sessions for clinician
    DEPARTMENT = "department"            # Revoke for entire department
    CLINIC_WIDE = "clinic_wide"          # Emergency stop all agents


class RevocationReason(str, Enum):
    SECURITY_CONCERN = "security_concern"
    POLICY_VIOLATION = "policy_violation"
    FORBIDDEN_TOOL_ATTEMPT = "forbidden_tool_attempt"
    ANOMALOUS_BEHAVIOR = "anomalous_behavior"
    CLINICIAN_REQUEST = "clinician_request"
    EMERGENCY_STOP = "emergency_stop"
    SYSTEM_MAINTENANCE = "system_maintenance"
    PATIENT_OPT_OUT = "patient_opt_out"
    COMPLIANCE_FLAG = "compliance_flag"


@dataclass
class RevocationOrder:
    """An order to revoke AI agent permissions."""
    order_id: str
    scope: RevocationScope
    target: str                         # What to revoke (tool name, session ID, etc.)
    reason: RevocationReason
    reason_details: str
    issued_by: str
    issued_at: datetime
    effective_at: datetime
    is_reversible: bool
    reversal_requires: Optional[str]    # Who can reverse this


class RevocationController:
    """
    Central revocation controller for clinical AI agent permissions.
    Provides sub-second revocation capabilities.
    """

    def __init__(self):
        self._active_revocations: dict[str, RevocationOrder] = {}
        self._revoked_tools: dict[str, Set[str]] = {}  # session_id -> set of revoked tools
        self._revoked_sessions: Set[str] = set()
        self._revoked_agents: Set[str] = set()
        self._emergency_stop_active: bool = False
        self._handlers: list[Callable] = []

    async def revoke(
        self,
        scope: RevocationScope,
        target: str,
        reason: RevocationReason,
        reason_details: str,
        issued_by: str,
        effective_immediately: bool = True,
        is_reversible: bool = True,
    ) -> RevocationOrder:
        """Issue a revocation order."""
        now = datetime.utcnow()
        order = RevocationOrder(
            order_id=f"rev_{now.timestamp()}_{target}",
            scope=scope,
            target=target,
            reason=reason,
            reason_details=reason_details,
            issued_by=issued_by,
            issued_at=now,
            effective_at=now if effective_immediately else now,  # Could add delay
            is_reversible=is_reversible,
            reversal_requires="clinical_director" if scope == RevocationScope.CLINIC_WIDE else None,
        )

        self._active_revocations[order.order_id] = order

        # Apply revocation immediately
        await self._apply_revocation(order)

        # Notify all handlers
        for handler in self._handlers:
            try:
                await handler(order)
            except Exception:
                pass

        return order

    async def _apply_revocation(self, order: RevocationOrder) -> None:
        """Apply a revocation order to the running system."""
        if order.scope == RevocationScope.SINGLE_TOOL:
            session_id = order.target.split(":")[0] if ":" in order.target else "global"
            tool = order.target.split(":")[1] if ":" in order.target else order.target
            if session_id not in self._revoked_tools:
                self._revoked_tools[session_id] = set()
            self._revoked_tools[session_id].add(tool)

        elif order.scope == RevocationScope.SESSION:
            self._revoked_sessions.add(order.target)

        elif order.scope == RevocationScope.AGENT:
            self._revoked_agents.add(order.target)

        elif order.scope == RevocationScope.CLINIC_WIDE:
            self._emergency_stop_active = True

    def is_revoked(self, session_id: str, tool_name: str, agent_id: str) -> Optional[RevocationOrder]:
        """Check if a tool call is revoked. Returns order if revoked."""
        # Check clinic-wide emergency stop
        if self._emergency_stop_active:
            return next(
                (o for o in self._active_revocations.values()
                 if o.scope == RevocationScope.CLINIC_WIDE), None
            )

        # Check agent-level revocation
        if agent_id in self._revoked_agents:
            return next(
                (o for o in self._active_revocations.values()
                 if o.scope == RevocationScope.AGENT and o.target == agent_id), None
            )

        # Check session-level revocation
        if session_id in self._revoked_sessions:
            return next(
                (o for o in self._active_revocations.values()
                 if o.scope == RevocationScope.SESSION and o.target == session_id), None
            )

        # Check tool-level revocation
        revoked = self._revoked_tools.get(session_id, set())
        if tool_name in revoked:
            return next(
                (o for o in self._active_revocations.values()
                 if o.scope == RevocationScope.SINGLE_TOOL
                 and o.target == f"{session_id}:{tool_name}"), None
            )

        return None

    async def reverse_revocation(self, order_id: str, reversed_by: str) -> Optional[RevocationOrder]:
        """Reverse a revocation order (if reversible)."""
        order = self._active_revocations.get(order_id)
        if not order:
            return None
        if not order.is_reversible:
            raise PermissionError(f"Revocation order {order_id} is not reversible")

        del self._active_revocations[order_id]
        await self._undo_revocation(order)
        return order

    async def _undo_revocation(self, order: RevocationOrder) -> None:
        """Undo a revocation order."""
        if order.scope == RevocationScope.SINGLE_TOOL:
            session_id = order.target.split(":")[0] if ":" in order.target else "global"
            tool = order.target.split(":")[1] if ":" in order.target else order.target
            if session_id in self._revoked_tools:
                self._revoked_tools[session_id].discard(tool)

        elif order.scope == RevocationScope.SESSION:
            self._revoked_sessions.discard(order.target)

        elif order.scope == RevocationScope.AGENT:
            self._revoked_agents.discard(order.target)

        elif order.scope == RevocationScope.CLINIC_WIDE:
            self._emergency_stop_active = False

    def register_handler(self, handler: Callable) -> None:
        self._handlers.append(handler)
```

---

### 6.3 Agent Pause/Kill Switch

```python
# kill_switch.py
"""Agent pause and kill switch for clinical AI safety."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional
import asyncio


class AgentState(str, Enum):
    ACTIVE = "active"
    PAUSED = "paused"              # Temporarily suspended, can resume
    WINDING_DOWN = "winding_down"  # Completing in-flight tasks, no new ones
    TERMINATED = "terminated"      # Killed, all state cleared
    QUARANTINED = "quarantined"    # Isolated for investigation


@dataclass
class KillSwitchAction:
    """A kill switch action against an agent."""
    action_id: str
    agent_id: str
    target_state: AgentState
    triggered_by: str
    triggered_at: datetime
    reason: str
    previous_state: AgentState
    grace_period_seconds: int = 0
    completed_at: Optional[datetime] = None


class KillSwitch:
    """
    Hardware-equivalent kill switch for clinical AI agents.
    Provides immediate state transition capability.
    """

    def __init__(self):
        self._agent_states: dict[str, AgentState] = {}
        self._action_history: list[KillSwitchAction] = []
        self._pause_events: dict[str, asyncio.Event] = {}
        self._termination_callbacks: list = []

    def get_state(self, agent_id: str) -> AgentState:
        """Get current state of an agent."""
        return self._agent_states.get(agent_id, AgentState.ACTIVE)

    async def pause(self, agent_id: str, triggered_by: str, reason: str) -> KillSwitchAction:
        """Pause an agent - suspends all new tool calls."""
        prev_state = self.get_state(agent_id)
        action = KillSwitchAction(
            action_id=f"pause_{datetime.utcnow().timestamp()}_{agent_id}",
            agent_id=agent_id,
            target_state=AgentState.PAUSED,
            triggered_by=triggered_by,
            triggered_at=datetime.utcnow(),
            reason=reason,
            previous_state=prev_state,
        )

        self._agent_states[agent_id] = AgentState.PAUSED
        self._pause_events[agent_id] = asyncio.Event()
        self._action_history.append(action)
        action.completed_at = datetime.utcnow()

        return action

    async def resume(self, agent_id: str, triggered_by: str, reason: str) -> KillSwitchAction:
        """Resume a paused agent."""
        prev_state = self.get_state(agent_id)
        if prev_state != AgentState.PAUSED:
            raise ValueError(f"Cannot resume agent in state {prev_state}")

        action = KillSwitchAction(
            action_id=f"resume_{datetime.utcnow().timestamp()}_{agent_id}",
            agent_id=agent_id,
            target_state=AgentState.ACTIVE,
            triggered_by=triggered_by,
            triggered_at=datetime.utcnow(),
            reason=reason,
            previous_state=prev_state,
        )

        self._agent_states[agent_id] = AgentState.ACTIVE
        if agent_id in self._pause_events:
            self._pause_events[agent_id].set()

        self._action_history.append(action)
        action.completed_at = datetime.utcnow()

        return action

    async def wind_down(self, agent_id: str, triggered_by: str, reason: str,
                       grace_period: int = 30) -> KillSwitchAction:
        """Initiate graceful shutdown - complete in-flight, reject new."""
        prev_state = self.get_state(agent_id)
        action = KillSwitchAction(
            action_id=f"wd_{datetime.utcnow().timestamp()}_{agent_id}",
            agent_id=agent_id,
            target_state=AgentState.WINDING_DOWN,
            triggered_by=triggered_by,
            triggered_at=datetime.utcnow(),
            reason=reason,
            previous_state=prev_state,
            grace_period_seconds=grace_period,
        )

        self._agent_states[agent_id] = AgentState.WINDING_DOWN
        self._action_history.append(action)

        # After grace period, auto-terminate
        await asyncio.sleep(grace_period)
        if self.get_state(agent_id) == AgentState.WINDING_DOWN:
            await self.terminate(agent_id, "system", "Grace period expired after wind_down")

        action.completed_at = datetime.utcnow()
        return action

    async def terminate(self, agent_id: str, triggered_by: str, reason: str) -> KillSwitchAction:
        """Hard terminate an agent - immediate stop, all state cleared."""
        prev_state = self.get_state(agent_id)
        action = KillSwitchAction(
            action_id=f"term_{datetime.utcnow().timestamp()}_{agent_id}",
            agent_id=agent_id,
            target_state=AgentState.TERMINATED,
            triggered_by=triggered_by,
            triggered_at=datetime.utcnow(),
            reason=reason,
            previous_state=prev_state,
        )

        self._agent_states[agent_id] = AgentState.TERMINATED
        self._action_history.append(action)

        # Execute termination callbacks
        for callback in self._termination_callbacks:
            try:
                await callback(agent_id, reason)
            except Exception:
                pass

        action.completed_at = datetime.utcnow()
        return action

    async def quarantine(self, agent_id: str, triggered_by: str, reason: str) -> KillSwitchAction:
        """Quarantine an agent - isolate for investigation."""
        prev_state = self.get_state(agent_id)
        action = KillSwitchAction(
            action_id=f "quar_{datetime.utcnow().timestamp()}_{agent_id}",
            agent_id=agent_id,
            target_state=AgentState.QUARANTINED,
            triggered_by=triggered_by,
            triggered_at=datetime.utcnow(),
            reason=reason,
            previous_state=prev_state,
        )

        self._agent_states[agent_id] = AgentState.QUARANTINED
        self._action_history.append(action)
        action.completed_at = datetime.utcnow()

        return action

    def is_active(self, agent_id: str) -> bool:
        """Check if an agent is in an active state."""
        return self.get_state(agent_id) == AgentState.ACTIVE

    def can_execute_tools(self, agent_id: str) -> bool:
        """Check if an agent can currently execute tools."""
        return self.get_state(agent_id) in (AgentState.ACTIVE, AgentState.WINDING_DOWN)
```

---

### 6.4 Clinic-Wide Emergency Stop

```python
# emergency_stop.py
"""Clinic-wide emergency stop system for clinical AI."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional
import asyncio


@dataclass
class EmergencyStopEvent:
    """Record of a clinic-wide emergency stop activation."""
    event_id: str
    activated_by: str
    activated_at: datetime
    reason: str
    reason_category: str
    affected_agents: list[str] = field(default_factory=list)
    affected_systems: list[str] = field(default_factory=list)
    deactivated_at: Optional[datetime] = None
    deactivated_by: Optional[str] = None
    post_incident_review_id: Optional[str] = None


class ClinicWideEmergencyStop:
    """
    Clinic-wide emergency stop - the nuclear option.
    Immediately halts ALL AI agent activity across the entire clinic.
    """

    def __init__(self):
        self._is_active: bool = False
        self._current_event: Optional[EmergencyStopEvent] = None
        self._history: list[EmergencyStopEvent] = []
        self._activation_handlers: list = []
        self._deactivation_handlers: list = []

    @property
    def is_active(self) -> bool:
        return self._is_active

    async def activate(
        self,
        activated_by: str,
        reason: str,
        reason_category: str = "unspecified",
        affected_agents: Optional[list[str]] = None,
    ) -> EmergencyStopEvent:
        """Activate clinic-wide emergency stop."""
        if self._is_active:
            raise RuntimeError("Emergency stop is already active")

        event = EmergencyStopEvent(
            event_id=f"estop_{datetime.utcnow().timestamp()}",
            activated_by=activated_by,
            activated_at=datetime.utcnow(),
            reason=reason,
            reason_category=reason_category,
            affected_agents=affected_agents or ["ALL"],
            affected_systems=["ai_agent_platform", "tool_gateway", "approval_system"],
        )

        self._is_active = True
        self._current_event = event

        # Execute all activation handlers (in parallel for speed)
        await asyncio.gather(
            *[handler(event) for handler in self._activation_handlers],
            return_exceptions=True,
        )

        return event

    async def deactivate(
        self,
        deactivated_by: str,
        post_incident_review_id: Optional[str] = None,
    ) -> EmergencyStopEvent:
        """Deactivate clinic-wide emergency stop."""
        if not self._is_active:
            raise RuntimeError("Emergency stop is not active")

        event = self._current_event
        event.deactivated_at = datetime.utcnow()
        event.deactivated_by = deactivated_by
        event.post_incident_review_id = post_incident_review_id

        self._is_active = False
        self._history.append(event)
        self._current_event = None

        # Execute deactivation handlers
        await asyncio.gather(
            *[handler(event) for handler in self._deactivation_handlers],
            return_exceptions=True,
        )

        return event

    def register_activation_handler(self, handler) -> None:
        self._activation_handlers.append(handler)

    def register_deactivation_handler(self, handler) -> None:
        self._deactivation_handlers.append(handler)

    def get_history(self) -> list[EmergencyStopEvent]:
        return self._history
```

---

### 6.5 Gradual Capability Reduction

```python
# gradual_reduction.py
"""Gradual capability reduction for clinical AI agents."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Optional


class ReductionLevel(str, Enum):
    FULL = "full"                    # All capabilities
    NO_HIGH_RISK = "no_high_risk"    # Remove high-risk writes
    NO_WRITE = "no_write"            # Read-only
    NO_PATIENT_DATA = "no_patient_data"  # No PHI access
    MINIMAL = "minimal"              # Only public tools
    NONE = "none"                    # Completely stopped


class CapabilityReducer:
    """
    Implements gradual capability reduction for clinical AI agents.
    Instead of immediate termination, progressively reduces capabilities
    based on risk signals.
    """

    REDUCTION_ORDER = [
        ReductionLevel.FULL,
        ReductionLevel.NO_HIGH_RISK,
        ReductionLevel.NO_WRITE,
        ReductionLevel.NO_PATIENT_DATA,
        ReductionLevel.MINIMAL,
        ReductionLevel.NONE,
    ]

    def __init__(self):
        self._agent_levels: dict[str, ReductionLevel] = {}

    def get_level(self, agent_id: str) -> ReductionLevel:
        return self._agent_levels.get(agent_id, ReductionLevel.FULL)

    def reduce(self, agent_id: str, levels: int = 1) -> ReductionLevel:
        """Reduce agent capabilities by N levels."""
        current = self.get_level(agent_id)
        current_idx = self.REDUCTION_ORDER.index(current)
        new_idx = min(current_idx + levels, len(self.REDUCTION_ORDER) - 1)
        new_level = self.REDUCTION_ORDER[new_idx]
        self._agent_levels[agent_id] = new_level
        return new_level

    def can_use_tool(self, agent_id: str, tool_classification: str) -> bool:
        """Check if agent at current reduction level can use a tool."""
        level = self.get_level(agent_id)

        restrictions = {
            ReductionLevel.FULL: [],
            ReductionLevel.NO_HIGH_RISK: ["high_risk_write"],
            ReductionLevel.NO_WRITE: ["high_risk_write", "medium_risk_write", "low_risk_write"],
            ReductionLevel.NO_PATIENT_DATA: ["high_risk_write", "medium_risk_write",
                                              "low_risk_write"],  # + no PHI reads
            ReductionLevel.MINIMAL: ["high_risk_write", "medium_risk_write",
                                      "low_risk_write"],  # + only public reads
            ReductionLevel.NONE: ["read_only", "low_risk_write", "medium_risk_write",
                                   "high_risk_write"],
        }

        forbidden = restrictions.get(level, [])
        return tool_classification not in forbidden

    def restore(self, agent_id: str) -> None:
        """Fully restore agent capabilities."""
        self._agent_levels[agent_id] = ReductionLevel.FULL
```

---

### 6.6 Post-Incident Review Process

```python
# post_incident_review.py
"""Post-incident review process for clinical AI agent events."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional, list
from enum import Enum


class IncidentSeverity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"
    SEVERE = "severe"


class IncidentStatus(str, Enum):
    OPEN = "open"
    UNDER_INVESTIGATION = "under_investigation"
    ROOT_CAUSE_IDENTIFIED = "root_cause_identified"
    REMEDIATION_PLANNED = "remediation_planned"
    RESOLVED = "resolved"
    CLOSED = "closed"


@dataclass
class PostIncidentReview:
    """A post-incident review for clinical AI agent events."""
    review_id: str
    incident_id: str
    title: str
    description: str
    severity: IncidentSeverity
    status: IncidentStatus

    # Timeline
    detected_at: datetime
    review_started_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None

    # People
    detected_by: str = ""
    lead_investigator: Optional[str] = None
    reviewers: list[str] = field(default_factory=list)

    # Technical details
    affected_agent_id: Optional[str] = None
    affected_session_id: Optional[str] = None
    affected_patient_ids: list[str] = field(default_factory=list)
    related_audit_records: list[str] = field(default_factory=list)
    related_tool_calls: list[str] = field(default_factory=list)

    # Analysis
    root_cause: Optional[str] = None
    contributing_factors: list[str] = field(default_factory=list)
    impact_assessment: Optional[str] = None
    patient_impact: bool = False

    # Remediation
    immediate_actions: list[str] = field(default_factory=list)
    long_term_actions: list[str] = field(default_factory=list)
    preventive_measures: list[str] = field(default_factory=list)

    # Lessons learned
    lessons_learned: list[str] = field(default_factory=list)
    process_changes: list[str] = field(default_factory=list)
    policy_changes: list[str] = field(default_factory=list)

    # Sign-off
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None


class PostIncidentReviewProcess:
    """Manages post-incident reviews for clinical AI safety events."""

    REVIEW_DEADLINES = {
        IncidentSeverity.LOW: 14,       # 14 days
        IncidentSeverity.MEDIUM: 7,     # 7 days
        IncidentSeverity.HIGH: 3,       # 3 days
        IncidentSeverity.CRITICAL: 1,   # 1 day
        IncidentSeverity.SEVERE: 1,     # 1 day
    }

    def __init__(self):
        self._reviews: dict[str, PostIncidentReview] = {}

    def create_review(
        self,
        incident_id: str,
        title: str,
        description: str,
        severity: IncidentSeverity,
        detected_by: str,
        detected_at: datetime,
        affected_agent_id: Optional[str] = None,
        affected_patient_ids: Optional[list[str]] = None,
    ) -> PostIncidentReview:
        """Create a new post-incident review."""
        review = PostIncidentReview(
            review_id=f"pir_{datetime.utcnow().timestamp()}_{incident_id}",
            incident_id=incident_id,
            title=title,
            description=description,
            severity=severity,
            status=IncidentStatus.OPEN,
            detected_at=detected_at,
            detected_by=detected_by,
            affected_agent_id=affected_agent_id,
            affected_patient_ids=affected_patient_ids or [],
        )

        self._reviews[review.review_id] = review
        return review

    def assign_investigator(self, review_id: str, investigator: str) -> None:
        """Assign a lead investigator."""
        review = self._reviews.get(review_id)
        if review:
            review.lead_investigator = investigator
            review.review_started_at = datetime.utcnow()
            if review.status == IncidentStatus.OPEN:
                review.status = IncidentStatus.UNDER_INVESTIGATION

    def submit_findings(
        self,
        review_id: str,
        root_cause: str,
        contributing_factors: list[str],
        impact_assessment: str,
        patient_impact: bool,
    ) -> None:
        """Submit investigation findings."""
        review = self._reviews.get(review_id)
        if review:
            review.root_cause = root_cause
            review.contributing_factors = contributing_factors
            review.impact_assessment = impact_assessment
            review.patient_impact = patient_impact
            review.status = IncidentStatus.ROOT_CAUSE_IDENTIFIED

    def submit_remediation(
        self,
        review_id: str,
        immediate_actions: list[str],
        long_term_actions: list[str],
        preventive_measures: list[str],
    ) -> None:
        """Submit remediation plan."""
        review = self._reviews.get(review_id)
        if review:
            review.immediate_actions = immediate_actions
            review.long_term_actions = long_term_actions
            review.preventive_measures = preventive_measures
            review.status = IncidentStatus.REMEDIATION_PLANNED

    def close_review(
        self,
        review_id: str,
        approved_by: str,
        lessons_learned: list[str],
        process_changes: list[str],
        policy_changes: list[str],
    ) -> None:
        """Close a post-incident review."""
        review = self._reviews.get(review_id)
        if review:
            review.lessons_learned = lessons_learned
            review.process_changes = process_changes
            review.policy_changes = policy_changes
            review.approved_by = approved_by
            review.approved_at = datetime.utcnow()
            review.resolved_at = datetime.utcnow()
            review.closed_at = datetime.utcnow()
            review.status = IncidentStatus.CLOSED

    def get_overdue_reviews(self) -> list[PostIncidentReview]:
        """Get reviews past their deadline."""
        overdue = []
        now = datetime.utcnow()
        for review in self._reviews.values():
            if review.status in (IncidentStatus.RESOLVED, IncidentStatus.CLOSED):
                continue
            deadline_days = self.REVIEW_DEADLINES.get(review.severity, 7)
            deadline = review.detected_at + timedelta(days=deadline_days)
            if now > deadline:
                overdue.append(review)
        return overdue
```

---

## 7. Read/Write Separation

### 7.1 Overview

Read/write separation provides operational modes that progressively restrict an AI agent's capabilities. These modes are fundamental to safe deployment -- every agent should start in the most restrictive mode and only be promoted based on demonstrated safety.

---

### 7.2 Read-Only Agent Modes

```python
# agent_modes.py
"""Agent mode management for read/write separation."""

from __future__ import annotations

from enum import Enum
from dataclasses import dataclass
from typing import Optional


class AgentMode(str, Enum):
    """
    Operational modes for clinical AI agents.
    Modes are ordered from most to least restrictive.
    """
    READ_ONLY = "read_only"              # Can only read data, never modify
    DRAFT_ONLY = "draft_only"            # Can create drafts but never commit/send
    PREVIEW = "preview"                  # Can preview changes but manual commit required
    SIMULATION = "simulation"            # All actions are simulated, no real effects
    SUPERVISED_WRITE = "supervised_write" # Write allowed but every action is pre-approved
    AUTONOMOUS_LOW = "autonomous_low"    # Can autonomously use low-risk tools
    AUTONOMOUS_MEDIUM = "autonomous_medium" # Can autonomously use medium-risk tools
    FULL = "full"                        # Full permissions within role (rare)


@dataclass
class ModeConfiguration:
    """Configuration for a specific agent mode."""
    mode: AgentMode
    allowed_classifications: list[str]
    can_commit_writes: bool
    can_send_messages: bool
    requires_approval_for: list[str]
    is_simulation: bool
    max_concurrent_tools: int
    description: str


MODE_CONFIGS = {
    AgentMode.READ_ONLY: ModeConfiguration(
        mode=AgentMode.READ_ONLY,
        allowed_classifications=["read_only"],
        can_commit_writes=False,
        can_send_messages=False,
        requires_approval_for=[],
        is_simulation=False,
        max_concurrent_tools=10,
        description="Agent can only read data. No modifications allowed.",
    ),
    AgentMode.DRAFT_ONLY: ModeConfiguration(
        mode=AgentMode.DRAFT_ONLY,
        allowed_classifications=["read_only", "low_risk_write"],
        can_commit_writes=False,
        can_send_messages=False,
        requires_approval_for=["low_risk_write"],
        is_simulation=False,
        max_concurrent_tools=5,
        description="Agent can create drafts but cannot commit any changes.",
    ),
    AgentMode.PREVIEW: ModeConfiguration(
        mode=AgentMode.PREVIEW,
        allowed_classifications=["read_only", "low_risk_write", "medium_risk_write"],
        can_commit_writes=False,
        can_send_messages=False,
        requires_approval_for=["medium_risk_write"],
        is_simulation=False,
        max_concurrent_tools=5,
        description="Agent can preview changes but manual commit required for writes.",
    ),
    AgentMode.SIMULATION: ModeConfiguration(
        mode=AgentMode.SIMULATION,
        allowed_classifications=["read_only", "low_risk_write", "medium_risk_write",
                                  "high_risk_write"],
        can_commit_writes=True,  # Allowed but all effects are simulated/rolled back
        can_send_messages=False, # Never sends in simulation
        requires_approval_for=[],
        is_simulation=True,
        max_concurrent_tools=20,
        description="All actions are simulated. No real effects on data or patients.",
    ),
    AgentMode.SUPERVISED_WRITE: ModeConfiguration(
        mode=AgentMode.SUPERVISED_WRITE,
        allowed_classifications=["read_only", "low_risk_write", "medium_risk_write",
                                  "high_risk_write"],
        can_commit_writes=True,
        can_send_messages=False,  # Requires explicit approval
        requires_approval_for=["low_risk_write", "medium_risk_write", "high_risk_write"],
        is_simulation=False,
        max_concurrent_tools=3,
        description="Every write action requires explicit human approval.",
    ),
    AgentMode.AUTONOMOUS_LOW: ModeConfiguration(
        mode=AgentMode.AUTONOMOUS_LOW,
        allowed_classifications=["read_only", "low_risk_write"],
        can_commit_writes=True,
        can_send_messages=False,
        requires_approval_for=["medium_risk_write", "high_risk_write"],
        is_simulation=False,
        max_concurrent_tools=10,
        description="Agent can autonomously perform read-only and low-risk write actions.",
    ),
}


class AgentModeManager:
    """Manages operational modes for clinical AI agents."""

    def __init__(self):
        self._agent_modes: dict[str, AgentMode] = {}

    def set_mode(self, agent_id: str, mode: AgentMode) -> ModeConfiguration:
        """Set the operational mode for an agent."""
        self._agent_modes[agent_id] = mode
        return MODE_CONFIGS[mode]

    def get_mode(self, agent_id: str) -> AgentMode:
        """Get current mode for an agent."""
        return self._agent_modes.get(agent_id, AgentMode.READ_ONLY)

    def get_config(self, agent_id: str) -> ModeConfiguration:
        """Get configuration for agent's current mode."""
        mode = self.get_mode(agent_id)
        return MODE_CONFIGS[mode]

    def can_execute_tool(self, agent_id: str, classification: str) -> bool:
        """Check if agent in current mode can execute a tool classification."""
        config = self.get_config(agent_id)
        return classification in config.allowed_classifications

    def requires_approval(self, agent_id: str, classification: str) -> bool:
        """Check if tool requires approval in agent's current mode."""
        config = self.get_config(agent_id)
        return classification in config.requires_approval_for

    def is_simulation(self, agent_id: str) -> bool:
        """Check if agent is running in simulation mode."""
        return self.get_config(agent_id).is_simulation
```

---

### 7.3 Mode Transition Matrix

```
                    ┌─────────────┐
                    │  READ_ONLY  │  <-- Default entry point
                    └──────┬──────┘
                           │ Clinician promotes
                           ▼
                    ┌─────────────┐
                    │  DRAFT_ONLY │  <-- AI can draft, human commits
                    └──────┬──────┘
                           │ Demonstrated safety
                           ▼
                    ┌─────────────┐
                    │   PREVIEW   │  <-- AI previews, human reviews & commits
                    └──────┬──────┘
                           │ Demonstrated safety
                           ▼
              ┌────────────────────────┐
              │    SIMULATION (safe    │  <-- Test changes without effects
              │     test environment)  │
              └──────┬─────────────────┘
                     │ Validated in sim
                     ▼
              ┌────────────────────────┐
              │   SUPERVISED_WRITE     │  <-- Every write pre-approved
              └──────┬─────────────────┘
                     │ Demonstrated reliability
                     ▼
              ┌────────────────────────┐
              │    AUTONOMOUS_LOW      │  <-- Low-risk autonomous
              └────────────────────────┘
                     (rarely progresses further)
```

**Key Rule:** Mode promotion requires documented evidence of safe operation at the current mode. Mode demotion can happen instantly via kill switch.

---

### 7.4 Simulation Mode Deep Dive

Simulation mode is the critical safety layer that allows testing of AI agent behavior without real-world effects. All changes are made against a sandboxed copy and either auto-rolled back or presented as a diff.

```python
# simulation_mode.py
"""Simulation mode implementation for safe AI agent testing."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional
from copy import deepcopy


@dataclass
class SimulatedAction:
    """Record of a simulated action."""
    action_id: str
    tool_name: str
    parameters: dict
    would_modify: dict           # What would be changed
    original_values: dict        # Original values before change
    simulated_result: Any
    timestamp: datetime


class SimulationEngine:
    """
    Executes tool calls in a simulated environment.
    All changes are tracked but never persisted.
    """

    def __init__(self):
        self._simulated_state: dict = {}
        self._actions: list[SimulatedAction] = []
        self._is_active: bool = False

    def start_simulation(self, base_state: dict) -> None:
        """Start a simulation with a copy of base state."""
        self._simulated_state = deepcopy(base_state)
        self._actions = []
        self._is_active = True

    def simulate_action(self, tool_name: str, parameters: dict) -> SimulatedAction:
        """Execute a tool action in simulation."""
        if not self._is_active:
            raise RuntimeError("Simulation not active")

        # Capture original values that would be modified
        original_values = self._capture_original_values(tool_name, parameters)

        # Simulate the action (tool-specific logic would go here)
        simulated_result = self._execute_simulated(tool_name, parameters)

        # Capture what would be modified
        would_modify = self._capture_modified_values(tool_name, parameters)

        action = SimulatedAction(
            action_id=f"sim_{datetime.utcnow().timestamp()}_{tool_name}",
            tool_name=tool_name,
            parameters=parameters,
            would_modify=would_modify,
            original_values=original_values,
            simulated_result=simulated_result,
            timestamp=datetime.utcnow(),
        )

        self._actions.append(action)
        return action

    def get_simulation_report(self) -> dict:
        """Generate a report of all simulated actions."""
        return {
            "total_actions": len(self._actions),
            "actions": [
                {
                    "tool": a.tool_name,
                    "would_modify": a.would_modify,
                    "original_values": a.original_values,
                }
                for a in self._actions
            ],
            "data_changes_summary": self._summarize_changes(),
            "can_safely_apply": self._assess_safety(),
        }

    def end_simulation(self, apply_changes: bool = False) -> None:
        """End simulation. If apply_changes is False, all changes are discarded."""
        self._is_active = False
        if not apply_changes:
            self._simulated_state = {}
            # Note: Actions are preserved for audit even if not applied

    def _capture_original_values(self, tool_name: str, parameters: dict) -> dict:
        # Would capture relevant fields from _simulated_state
        return {}

    def _execute_simulated(self, tool_name: str, parameters: dict) -> Any:
        # Would execute tool logic against _simulated_state
        return None

    def _capture_modified_values(self, tool_name: str, parameters: dict) -> dict:
        # Would capture what changed
        return {}

    def _summarize_changes(self) -> dict:
        return {"fields_changed": len(self._actions), "records_affected": 0}

    def _assess_safety(self) -> bool:
        # Would apply safety checks to simulated actions
        return True
```

---

## 8. Technical Implementation

### 8.1 Middleware Pattern for Tool Gating

The middleware pattern is the core architectural approach for intercepting and controlling tool calls. Each tool invocation flows through a pipeline of middleware functions that can permit, deny, modify, or delay the call.

```python
# tool_gating_middleware.py
"""
Middleware pattern for clinical AI agent tool gating.
Every tool call flows through: Auth -> Classification -> Approval -> Audit -> Execute
"""

from __future__ import annotations

import functools
import asyncio
from dataclasses import dataclass
from datetime import datetime
from typing import Callable, Any, Optional
from enum import Enum


class MiddlewareResult(str, Enum):
    ALLOW = "allow"
    DENY = "deny"
    REQUIRE_APPROVAL = "require_approval"
    DELAY = "delay"
    MODIFY = "modify"


@dataclass
class ToolCallContext:
    """Context passed through the middleware pipeline."""
    agent_id: str
    session_id: str
    session_owner_id: str
    session_owner_role: str
    tool_name: str
    tool_classification: str
    parameters: dict
    patient_id: Optional[str] = None
    timestamp: datetime = None
    middleware_results: list[dict] = None

    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.utcnow()
        if self.middleware_results is None:
            self.middleware_results = []


# ── Middleware Interface ────────────────────────────────────────────────────

class ToolMiddleware:
    """Base class for tool gating middleware."""

    name: str = "base"
    priority: int = 100  # Lower = earlier in pipeline

    async def process(self, context: ToolCallContext) -> tuple[MiddlewareResult, Optional[dict]]:
        """
        Process a tool call. Returns (result, metadata).
        If result is DENY, pipeline stops.
        If result is REQUIRE_APPROVAL, pipeline pauses for human approval.
        """
        return MiddlewareResult.ALLOW, {}


# ── Concrete Middleware Implementations ─────────────────────────────────────

class AuthenticationMiddleware(ToolMiddleware):
    """Verifies session and user authentication."""
    name = "authentication"
    priority = 10

    async def process(self, context: ToolCallContext) -> tuple[MiddlewareResult, Optional[dict]]:
        # Verify session is valid
        if not context.session_id or not context.session_owner_id:
            return MiddlewareResult.DENY, {"reason": "No valid session"}
        return MiddlewareResult.ALLOW, {"authenticated": True}


class AuthorizationMiddleware(ToolMiddleware):
    """Checks RBAC permissions."""
    name = "authorization"
    priority = 20

    def __init__(self, rbac_manager):
        self.rbac = rbac_manager

    async def process(self, context: ToolCallContext) -> tuple[MiddlewareResult, Optional[dict]]:
        decision = self.rbac.evaluate_access(
            context.session_owner_role,
            context.tool_name,
            # Parse classification
            context.tool_classification,
        )
        if not decision.allowed:
            return MiddlewareResult.DENY, {"reason": decision.reason}
        return MiddlewareResult.ALLOW, {"authorized": True, "requires_approval": decision.requires_approval}


class ClassificationMiddleware(ToolMiddleware):
    """Looks up and validates tool classification."""
    name = "classification"
    priority = 15

    def __init__(self, classification_registry):
        self.registry = classification_registry

    async def process(self, context: ToolCallContext) -> tuple[MiddlewareResult, Optional[dict]]:
        metadata = self.registry.get(context.tool_name)
        if not metadata:
            return MiddlewareResult.DENY, {"reason": f"Unknown tool: {context.tool_name}"}

        if metadata["tier"] == "forbidden_autonomous":
            return MiddlewareResult.DENY, {
                "reason": f"Tool {context.tool_name} is FORBIDDEN for autonomous AI use",
                "alert": True,
            }

        context.tool_classification = metadata["tier"]
        return MiddlewareResult.ALLOW, {"classification": metadata["tier"]}


class ApprovalMiddleware(ToolMiddleware):
    """Handles human approval requirements."""
    name = "approval"
    priority = 30

    def __init__(self, approval_workflow):
        self.workflow = approval_workflow

    async def process(self, context: ToolCallContext) -> tuple[MiddlewareResult, Optional[dict]]:
        # Check if this tool/classification requires approval
        from classification_matrix import requires_approval

        if not requires_approval(context.tool_name, context.session_owner_role):
            return MiddlewareResult.ALLOW, {"approval": "not_required"}

        # Create approval request
        approval_req = await self.workflow.create_request(
            session_owner_id=context.session_owner_id,
            requester_id=context.agent_id,
            tool_name=context.tool_name,
            tool_classification=context.tool_classification,
            proposed_action_description=f"Execute {context.tool_name} with params {context.parameters}",
            proposed_parameters=context.parameters,
            patient_id=context.patient_id,
        )

        # Wait for decision
        decision = await self.workflow.wait_for_decision(approval_req.request_id)

        if decision == "approved":
            return MiddlewareResult.ALLOW, {
                "approval": "approved",
                "approval_id": approval_req.request_id,
            }
        elif decision == "denied":
            return MiddlewareResult.DENY, {
                "reason": "Human approval denied",
                "approval_id": approval_req.request_id,
            }
        else:
            return MiddlewareResult.DENY, {
                "reason": f"Approval timed out or escalated: {decision}",
            }


class AuditMiddleware(ToolMiddleware):
    """Logs tool call to audit system."""
    name = "audit"
    priority = 40

    def __init__(self, audit_storage):
        self.storage = audit_storage

    async def process(self, context: ToolCallContext) -> tuple[MiddlewareResult, Optional[dict]]:
        # Audit logging happens regardless of outcome
        record = {
            "agent_id": context.agent_id,
            "session_id": context.session_id,
            "session_owner": context.session_owner_id,
            "tool_name": context.tool_name,
            "classification": context.tool_classification,
            "parameters": context.parameters,
            "timestamp": datetime.utcnow().isoformat(),
            "middleware_checks": context.middleware_results,
        }
        # Store asynchronously
        asyncio.create_task(self._store_audit(record))
        return MiddlewareResult.ALLOW, {"audited": True}

    async def _store_audit(self, record: dict) -> None:
        self.storage.append(record)


class RateLimitMiddleware(ToolMiddleware):
    """Enforces rate limits per tool per user."""
    name = "rate_limit"
    priority = 25

    def __init__(self, rate_limits: dict[str, int]):
        self.rate_limits = rate_limits  # tool_name -> max_calls_per_minute
        self._call_counts: dict[str, list[datetime]] = {}

    async def process(self, context: ToolCallContext) -> tuple[MiddlewareResult, Optional[dict]]:
        key = f"{context.session_owner_id}:{context.tool_name}"
        limit = self.rate_limits.get(context.tool_name, 60)

        now = datetime.utcnow()
        window_start = now - 60  # 1 minute window

        # Get calls in window
        calls = self._call_counts.get(key, [])
        calls_in_window = [c for c in calls if c > window_start]

        if len(calls_in_window) >= limit:
            return MiddlewareResult.DENY, {
                "reason": f"Rate limit exceeded: {limit} calls/minute for {context.tool_name}",
            }

        calls_in_window.append(now)
        self._call_counts[key] = calls_in_window

        return MiddlewareResult.ALLOW, {"rate_limited": False, "calls_in_window": len(calls_in_window)}


class KillSwitchMiddleware(ToolMiddleware):
    """Checks kill switch state before allowing execution."""
    name = "kill_switch"
    priority = 5  # Very early - check before anything else

    def __init__(self, kill_switch):
        self.kill_switch = kill_switch

    async def process(self, context: ToolCallContext) -> tuple[MiddlewareResult, Optional[dict]]:
        if not self.kill_switch.can_execute_tools(context.agent_id):
            state = self.kill_switch.get_state(context.agent_id)
            return MiddlewareResult.DENY, {
                "reason": f"Agent is in state {state.value} - cannot execute tools",
                "agent_state": state.value,
            }
        return MiddlewareResult.ALLOW, {"kill_switch": "clear"}


# ── Middleware Pipeline ─────────────────────────────────────────────────────

class ToolGatingPipeline:
    """Pipeline that executes middleware in priority order."""

    def __init__(self):
        self._middlewares: list[ToolMiddleware] = []

    def add_middleware(self, middleware: ToolMiddleware) -> None:
        """Add a middleware to the pipeline."""
        self._middlewares.append(middleware)
        self._middlewares.sort(key=lambda m: m.priority)

    async def execute(self, context: ToolCallContext) -> dict:
        """
        Execute tool call through middleware pipeline.
        Returns final result with all middleware decisions.
        """
        results = []

        for middleware in self._middlewares:
            result, metadata = await middleware.process(context)

            check_result = {
                "middleware": middleware.name,
                "result": result.value,
                "metadata": metadata or {},
            }
            results.append(check_result)
            context.middleware_results.append(check_result)

            if result == MiddlewareResult.DENY:
                return {
                    "allowed": False,
                    "denied_at": middleware.name,
                    "reason": metadata.get("reason", "Access denied"),
                    "pipeline_results": results,
                }

            if result == MiddlewareResult.REQUIRE_APPROVAL:
                # Pipeline pauses here - approval handled by ApprovalMiddleware
                pass

        return {
            "allowed": True,
            "pipeline_results": results,
            "context": context,
        }
```

---

### 8.2 Decorator-Based Permission Checks

```python
# permission_decorators.py
"""Decorator-based permission checks for clinical AI tool functions."""

from __future__ import annotations

import functools
import asyncio
from typing import Callable, Optional
from enum import Enum


class ToolClassification(str, Enum):
    READ_ONLY = "read_only"
    LOW_RISK_WRITE = "low_risk_write"
    MEDIUM_RISK_WRITE = "medium_risk_write"
    HIGH_RISK_WRITE = "high_risk_write"
    FORBIDDEN = "forbidden_autonomous"


# ── Core Decorators ─────────────────────────────────────────────────────────

def require_permission(
    tool_name: str,
    classification: ToolClassification,
    rbac_manager=None,
):
    """
    Decorator: Require specific permission to execute a tool function.
    Usage:
        @require_permission("book_appointment", ToolClassification.MEDIUM_RISK_WRITE)
        async def book_appointment(params): ...
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs):
            # Extract session context (assumed to be first arg or kwarg)
            context = kwargs.get("context") or (args[0] if args else None)
            if not context:
                raise PermissionError("No session context provided")

            # Check RBAC
            if rbac_manager:
                decision = rbac_manager.evaluate_access(
                    context.get("role", ""),
                    tool_name,
                    classification,
                )
                if not decision.allowed:
                    raise PermissionError(
                        f"Access denied for {tool_name}: {decision.reason}"
                    )

            return await func(*args, **kwargs)

        @functools.wraps(func)
        def sync_wrapper(*args, **kwargs):
            context = kwargs.get("context") or (args[0] if args else None)
            if not context:
                raise PermissionError("No session context provided")

            if rbac_manager:
                decision = rbac_manager.evaluate_access(
                    context.get("role", ""),
                    tool_name,
                    classification,
                )
                if not decision.allowed:
                    raise PermissionError(
                        f"Access denied for {tool_name}: {decision.reason}"
                    )

            return func(*args, **kwargs)

        return async_wrapper if asyncio.iscoroutinefunction(func) else sync_wrapper
    return decorator


def draft_only(func: Callable) -> Callable:
    """
    Decorator: Enforce that a write tool only creates drafts.
    The function should return a draft object, never commit directly.
    """
    @functools.wraps(func)
    async def async_wrapper(*args, **kwargs):
        result = await func(*args, **kwargs)

        # Ensure result is marked as draft
        if isinstance(result, dict):
            result["_meta"] = result.get("_meta", {})
            result["_meta"]["status"] = "draft"
            result["_meta"]["draft_only"] = True
            result["_meta"]["requires_human_commit"] = True
        return result

    @functools.wraps(func)
    def sync_wrapper(*args, **kwargs):
        result = func(*args, **kwargs)
        if isinstance(result, dict):
            result["_meta"] = result.get("_meta", {})
            result["_meta"]["status"] = "draft"
            result["_meta"]["draft_only"] = True
            result["_meta"]["requires_human_commit"] = True
        return result

    return async_wrapper if asyncio.iscoroutinefunction(func) else sync_wrapper


def require_approval(tool_name: str, timeout: int = 300):
    """
    Decorator: Require human approval before executing.
    Usage:
        @require_approval("send_patient_message_clinical", timeout=300)
        async def send_message(params): ...
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            context = kwargs.get("context") or (args[0] if args else None)
            if not context:
                raise PermissionError("No session context for approval")

            # Request approval (would use approval workflow)
            approval_result = await _request_approval(
                tool=tool_name,
                context=context,
                timeout=timeout,
            )

            if not approval_result:
                raise PermissionError(f"Approval denied or timed out for {tool_name}")

            return await func(*args, **kwargs)
        return wrapper
    return decorator


def audit_log(level: str = "standard"):
    """
    Decorator: Log tool execution to audit system.
    Usage:
        @audit_log(level="critical")
        async def access_full_chart(params): ...
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            context = kwargs.get("context") or (args[0] if args else None)
            start_time = datetime.utcnow()

            try:
                result = await func(*args, **kwargs)
                _log_audit(
                    tool=func.__name__,
                    context=context,
                    level=level,
                    outcome="success",
                    start_time=start_time,
                )
                return result
            except Exception as e:
                _log_audit(
                    tool=func.__name__,
                    context=context,
                    level=level,
                    outcome="error",
                    start_time=start_time,
                    error=str(e),
                )
                raise

        return wrapper
    return decorator


def rate_limited(max_calls: int = 60, window_seconds: int = 60):
    """
    Decorator: Enforce rate limiting on a tool.
    Usage:
        @rate_limited(max_calls=100, window_seconds=60)
        async def view_schedule(params): ...
    """
    def decorator(func: Callable) -> Callable:
        call_times = []

        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            from datetime import datetime, timedelta
            now = datetime.utcnow()
            window_start = now - timedelta(seconds=window_seconds)

            # Remove old calls
            nonlocal call_times
            call_times = [t for t in call_times if t > window_start]

            if len(call_times) >= max_calls:
                raise RateLimitExceeded(
                    f"Rate limit: {max_calls} calls per {window_seconds}s exceeded"
                )

            call_times.append(now)
            return await func(*args, **kwargs)

        return wrapper
    return decorator


def forbidden_tool(func: Callable) -> Callable:
    """
    Decorator: Mark a tool as forbidden for autonomous AI use.
    Any call will raise ForbiddenToolInvocationError.
    """
    @functools.wraps(func)
    async def wrapper(*args, **kwargs):
        raise ForbiddenToolInvocationError(
            f"Tool '{func.__name__}' is FORBIDDEN for autonomous AI invocation. "
            f"This tool represents a clinical decision that must be made by a "
            f"licensed human clinician."
        )
    return wrapper


def require_role(allowed_roles: list[str]):
    """
    Decorator: Require one of the specified roles.
    Usage:
        @require_role(["attending_physician", "clinical_director"])
        async def generate_report(params): ...
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            context = kwargs.get("context") or (args[0] if args else None)
            if not context:
                raise PermissionError("No session context")

            role = context.get("role", "")
            if role not in allowed_roles:
                raise PermissionError(
                    f"Role '{role}' not authorized. Required: {allowed_roles}"
                )

            return await func(*args, **kwargs)
        return wrapper
    return decorator


# ── Combined Decorator ──────────────────────────────────────────────────────

def clinical_tool(
    tool_name: str,
    classification: ToolClassification,
    approval_timeout: Optional[int] = None,
    audit_level: str = "standard",
    rate_limit: Optional[tuple[int, int]] = None,
    draft_only_flag: bool = False,
):
    """
    Combined decorator for clinical tool functions.
    Applies all relevant permission checks in one decorator.
    """
    def decorator(func: Callable) -> Callable:
        # Apply decorators in order (bottom to top = execution order)
        wrapped = func

        # Always audit
        wrapped = audit_log(level=audit_level)(wrapped)

        # Rate limit if specified
        if rate_limit:
            wrapped = rate_limited(max_calls=rate_limit[0], window_seconds=rate_limit[1])(wrapped)

        # Approval if high-risk
        if approval_timeout:
            wrapped = require_approval(tool_name, timeout=approval_timeout)(wrapped)

        # Draft only for low-risk writes
        if draft_only_flag:
            wrapped = draft_only(wrapped)

        # Base permission check
        wrapped = require_permission(tool_name, classification)(wrapped)

        return wrapped
    return decorator


# ── Helper Functions ────────────────────────────────────────────────────────

async def _request_approval(tool: str, context: dict, timeout: int) -> bool:
    """Request human approval (placeholder)."""
    # In production, this would use the PreApprovalWorkflow
    return True


def _log_audit(tool: str, context: dict, level: str, outcome: str,
               start_time, error: Optional[str] = None) -> None:
    """Log to audit system (placeholder)."""
    from datetime import datetime
    duration = (datetime.utcnow() - start_time).total_seconds()
    # In production, this would use the AuditStorageManager


class RateLimitExceeded(Exception):
    """Raised when rate limit is exceeded."""


class ForbiddenToolInvocationError(Exception):
    """Raised when a forbidden tool is invoked."""


from datetime import datetime  # noqa: E402


# ── Example Tool Implementations with Decorators ────────────────────────────

class ClinicalTools:
    """Example clinical tool implementations with full permission decorators."""

    @clinical_tool(
        tool_name="view_patient_summary",
        classification=ToolClassification.READ_ONLY,
        audit_level="standard",
        rate_limit=(100, 60),
    )
    async def view_patient_summary(self, patient_id: str, context: dict) -> dict:
        """Read-only: View de-identified patient summary."""
        return {
            "patient_id": patient_id,
            "summary": "Patient summary data...",
            "sensitivity": "phi_limited",
        }

    @clinical_tool(
        tool_name="create_draft_note",
        classification=ToolClassification.LOW_RISK_WRITE,
        audit_level="standard",
        draft_only_flag=True,
    )
    async def create_draft_note(self, patient_id: str, note_content: str, context: dict) -> dict:
        """Low-risk write: Create draft clinical note (never auto-saves)."""
        return {
            "patient_id": patient_id,
            "note_content": note_content,
            "status": "draft",
        }

    @clinical_tool(
        tool_name="book_appointment",
        classification=ToolClassification.MEDIUM_RISK_WRITE,
        audit_level="enhanced",
        rate_limit=(30, 60),
    )
    async def book_appointment(self, patient_id: str, appointment_time: str, context: dict) -> dict:
        """Medium-risk write: Book patient appointment."""
        return {
            "patient_id": patient_id,
            "appointment_time": appointment_time,
            "status": "booked",
            "confirmation_code": "ABC123",
        }

    @clinical_tool(
        tool_name="send_patient_message_clinical",
        classification=ToolClassification.HIGH_RISK_WRITE,
        approval_timeout=300,
        audit_level="critical",
    )
    async def send_patient_message_clinical(
        self, patient_id: str, message: str, context: dict
    ) -> dict:
        """High-risk write: Send clinical message to patient."""
        return {
            "patient_id": patient_id,
            "message": message,
            "sent_at": datetime.utcnow().isoformat(),
            "channel": "secure_portal",
        }

    @forbidden_tool
    async def make_diagnosis(self, patient_id: str, symptoms: list, context: dict) -> dict:
        """
        FORBIDDEN: AI agents cannot make diagnoses.
        This function will never execute - the decorator blocks all calls.
        """
        pass

    @forbidden_tool
    async def prescribe_medication(self, patient_id: str, medication: str, context: dict) -> dict:
        """
        FORBIDDEN: AI agents cannot prescribe medications.
        This function will never execute - the decorator blocks all calls.
        """
        pass
```

---

### 8.3 Policy Engine Integration

#### 8.3.1 Open Policy Agent (OPA) Integration

```python
# opa_integration.py
"""Open Policy Agent integration for clinical AI governance."""

from __future__ import annotations

import requests
import json
from dataclasses import asdict
from typing import Optional


class OPAClient:
    """Client for Open Policy Agent integration."""

    def __init__(self, base_url: str = "http://localhost:8181"):
        self.base_url = base_url
        self.policy_path = "clinical_ai/agent_permissions"

    def evaluate(self, input_data: dict) -> dict:
        """
        Evaluate a permission request against OPA policy.
        Returns the decision document.
        """
        url = f"{self.base_url}/v1/data/{self.policy_path}"
        response = requests.post(
            url,
            json={"input": input_data},
            headers={"Content-Type": "application/json"},
            timeout=5,
        )
        response.raise_for_status()
        return response.json().get("result", {})

    def check_permission(
        self,
        subject_role: str,
        tool_name: str,
        patient_id: Optional[str] = None,
        environment: Optional[dict] = None,
    ) -> dict:
        """Check if a subject can use a tool via OPA."""
        input_data = {
            "subject": {
                "role": subject_role,
            },
            "action": {
                "tool": tool_name,
            },
            "resource": {
                "patient_id": patient_id,
                "consent_status": "active",
            },
            "environment": environment or {
                "is_emergency": False,
                "network_zone": "internal",
            },
        }

        result = self.evaluate(input_data)
        return {
            "allowed": result.get("allow", False),
            "requires_approval": result.get("allow_with_approval", False),
            "break_glass": result.get("break_glass_allow", False),
            "reason": result.get("allow_reason", "unknown"),
            "classification": result.get("tool_classification", "unknown"),
        }

    def load_policy(self, policy_file: str) -> None:
        """Load a Rego policy file into OPA."""
        with open(policy_file) as f:
            policy = f.read()

        response = requests.put(
            f"{self.base_url}/v1/policies/clinical_ai",
            data=policy,
            headers={"Content-Type": "text/plain"},
        )
        response.raise_for_status()

    def load_data(self, data: dict) -> None:
        """Load data into OPA for policy evaluation."""
        response = requests.put(
            f"{self.base_url}/v1/data/clinical_data",
            json=data,
        )
        response.raise_for_status()
```

#### 8.3.2 Casbin Integration

```python
# casbin_integration.py
"""Casbin integration for clinical AI RBAC/ABAC."""

from __future__ import annotations

import casbin
from typing import Optional


class CasbinPolicyEngine:
    """Casbin-based policy engine for clinical AI permissions."""

    def __init__(self, model_path: str = "model.conf", policy_path: str = "policy.csv"):
        self.enforcer = casbin.Enforcer(model_path, policy_path)

    def check_permission(
        self,
        subject: str,       # e.g., "alice"
        domain: str,        # e.g., "cardiology"
        tool: str,          # e.g., "view_patient_summary"
        action: str,        # e.g., "read"
        environment: Optional[dict] = None,
    ) -> bool:
        """
        Check if subject can perform action on tool in domain.
        Uses Casbin's enforce method.
        """
        # Casbin enforcer: enforcer.enforce(sub, dom, obj, act)
        return self.enforcer.enforce(subject, domain, tool, action)

    def get_roles_for_user(self, user: str, domain: str) -> list[str]:
        """Get all roles for a user in a domain."""
        return self.enforcer.get_roles_for_user_in_domain(user, domain)

    def get_permissions_for_role(self, role: str, domain: str) -> list:
        """Get all permissions for a role in a domain."""
        return self.enforcer.get_permissions_for_user_in_domain(role, domain)

    def add_policy(self, role: str, domain: str, tool: str, action: str, rule: str) -> bool:
        """Dynamically add a policy."""
        return self.enforcer.add_named_policy("p", role, domain, tool, action, rule)

    def remove_policy(self, role: str, domain: str, tool: str, action: str, rule: str) -> bool:
        """Dynamically remove a policy."""
        return self.enforcer.remove_named_policy("p", role, domain, tool, action, rule)

    def add_role_for_user(self, user: str, role: str, domain: str) -> bool:
        """Assign a role to a user in a domain."""
        return self.enforcer.add_role_for_user_in_domain(user, role, domain)

    def save_policy(self) -> None:
        """Persist policy changes."""
        self.enforcer.save_policy()
```

---

### 8.4 API Gateway Pattern

```python
# api_gateway.py
"""API Gateway pattern for centralized clinical AI tool governance."""

from __future__ import annotations

from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional, Any
import asyncio
import time

app = FastAPI(title="Clinical AI Tool Gateway")
security = HTTPBearer()


class ToolCallRequest(BaseModel):
    """Request model for tool calls through the gateway."""
    tool_name: str
    parameters: dict[str, Any]
    patient_id: Optional[str] = None
    context: dict[str, Any] = {}


class ToolCallResponse(BaseModel):
    """Response model for tool calls."""
    success: bool
    result: Optional[dict] = None
    error: Optional[str] = None
    execution_time_ms: float
    approval_required: bool = False
    approval_id: Optional[str] = None
    audit_record_id: Optional[str] = None


# ── Gateway Dependencies ────────────────────────────────────────────────────

async def authenticate(request: Request, credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Authenticate the request and extract session context."""
    # Validate JWT, extract session info
    token = credentials.credentials
    # Simplified - would use proper JWT validation
    return {
        "session_id": "sess_123",
        "user_id": "clinician_001",
        "role": "attending_physician",
        "department": "cardiology",
    }

async def rate_limiter(request: Request):
    """Apply rate limiting."""
    # Simplified - would use Redis or similar
    pass


# ── Gateway Endpoints ───────────────────────────────────────────────────────

@app.post("/v1/tools/call", response_model=ToolCallResponse)
async def call_tool(
    request: ToolCallRequest,
    auth: dict = Depends(authenticate),
):
    """
    Centralized tool call endpoint.
    All AI agent tool calls must flow through this gateway.
    """
    start_time = time.time()

    # 1. Validate tool exists and get classification
    from classification_matrix import get_tool_metadata
    tool_meta = get_tool_metadata(request.tool_name)

    if tool_meta["tier"] == "forbidden_autonomous":
        raise HTTPException(status_code=403, detail="Tool is forbidden for autonomous AI use")

    # 2. Check RBAC permissions
    # (Would use RBACManager)

    # 3. Check if approval required
    requires_approval = tool_meta.get("approval", False)

    if requires_approval:
        # Create approval request and return pending
        approval_id = f"apr_{time.time()}"
        return ToolCallResponse(
            success=False,
            error="Approval required",
            execution_time_ms=(time.time() - start_time) * 1000,
            approval_required=True,
            approval_id=approval_id,
        )

    # 4. Execute tool (would dispatch to actual implementation)
    # For demo, return success
    result = {"status": "executed", "tool": request.tool_name}

    # 5. Audit log
    audit_id = f"aud_{time.time()}"

    return ToolCallResponse(
        success=True,
        result=result,
        execution_time_ms=(time.time() - start_time) * 1000,
        audit_record_id=audit_id,
    )


@app.post("/v1/tools/approve/{approval_id}")
async def approve_tool_call(approval_id: str, auth: dict = Depends(authenticate)):
    """Approve a pending tool call."""
    # Would use PreApprovalWorkflow.approve()
    return {"status": "approved", "approval_id": approval_id}


@app.get("/v1/tools/list")
async def list_available_tools(auth: dict = Depends(authenticate)):
    """List tools available to the authenticated role."""
    # Would filter by role permissions
    return {
        "read_only": ["view_patient_summary", "view_schedule", "view_lab_results"],
        "low_risk_write": ["create_draft_note", "draft_task"],
        "medium_risk_write": ["book_appointment", "send_appointment_reminder"],
        "high_risk_write": ["send_patient_message_clinical", "generate_clinical_report"],
        "forbidden": ["make_diagnosis", "prescribe_medication"],
    }


@app.post("/v1/emergency/stop")
async def emergency_stop(auth: dict = Depends(authenticate)):
    """Emergency stop - halt all AI agent tool execution."""
    # Would activate ClinicWideEmergencyStop
    return {"status": "emergency_stop_activated", "affected_agents": "ALL"}
```

---

### 8.5 WebSocket for Real-Time Approvals

```python
# websocket_approvals.py
"""WebSocket-based real-time approval system for clinical AI."""

from __future__ import annotations

import asyncio
import json
from datetime import datetime
from typing import Dict, Set
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

app = FastAPI()


class ApprovalConnectionManager:
    """Manages WebSocket connections for real-time approvals."""

    def __init__(self):
        # user_id -> WebSocket
        self.active_connections: Dict[str, WebSocket] = {}
        # approval_id -> set of user_ids who can approve
        self.approval_routing: Dict[str, Set[str]] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        """Accept a new WebSocket connection."""
        await websocket.accept()
        self.active_connections[user_id] = websocket

    def disconnect(self, user_id: str):
        """Remove a disconnected client."""
        self.active_connections.pop(user_id, None)

    async def send_approval_request(self, approval_id: str, user_ids: list[str], request_data: dict):
        """Send approval request to specified users."""
        self.approval_routing[approval_id] = set(user_ids)

        message = {
            "type": "approval_request",
            "approval_id": approval_id,
            "timestamp": datetime.utcnow().isoformat(),
            "data": request_data,
            "timeout_seconds": request_data.get("timeout_seconds", 300),
        }

        for user_id in user_ids:
            if user_id in self.active_connections:
                try:
                    await self.active_connections[user_id].send_json(message)
                except Exception:
                    pass

    async def send_approval_response(self, approval_id: str, user_id: str, decision: str, reason: str = ""):
        """Send approval decision to all interested parties."""
        message = {
            "type": "approval_response",
            "approval_id": approval_id,
            "user_id": user_id,
            "decision": decision,
            "reason": reason,
            "timestamp": datetime.utcnow().isoformat(),
        }

        # Notify the requesting agent/session
        interested = self.approval_routing.get(approval_id, set())
        for uid in interested:
            if uid in self.active_connections:
                try:
                    await self.active_connections[uid].send_json(message)
                except Exception:
                    pass

    async def broadcast_alert(self, alert: dict):
        """Broadcast a security alert to all connected users."""
        message = {
            "type": "alert",
            "timestamp": datetime.utcnow().isoformat(),
            "alert": alert,
        }

        disconnected = []
        for user_id, ws in self.active_connections.items():
            try:
                await ws.send_json(message)
            except Exception:
                disconnected.append(user_id)

        for user_id in disconnected:
            self.disconnect(user_id)


manager = ApprovalConnectionManager()


@app.websocket("/ws/approvals/{user_id}")
async def approval_websocket(websocket: WebSocket, user_id: str):
    """WebSocket endpoint for real-time approval notifications."""
    await manager.connect(websocket, user_id)

    try:
        while True:
            # Receive messages from client (approval decisions)
            data = await websocket.receive_json()

            if data.get("type") == "approval_decision":
                await manager.send_approval_response(
                    approval_id=data["approval_id"],
                    user_id=user_id,
                    decision=data["decision"],
                    reason=data.get("reason", ""),
                )

            elif data.get("type") == "heartbeat":
                await websocket.send_json({"type": "heartbeat_ack"})

    except WebSocketDisconnect:
        manager.disconnect(user_id)


# ── Integration with Approval Workflow ──────────────────────────────────────

class WebSocketApprovalHandler:
    """Connects the approval workflow to WebSocket notifications."""

    def __init__(self, connection_manager: ApprovalConnectionManager):
        self.manager = connection_manager

    async def on_approval_request(self, request) -> None:
        """Handle new approval request - send via WebSocket."""
        # Determine who can approve
        approvers = self._get_approvers_for(request)

        request_data = {
            "tool_name": request.tool_name,
            "tool_classification": request.tool_classification,
            "proposed_action": request.proposed_action_description,
            "patient_id": request.patient_id,
            "requester": request.requester_id,
            "session_owner": request.session_owner_id,
            "clinical_context": request.clinical_context,
            "ai_reasoning": request.ai_reasoning,
            "timeout_seconds": 300,
        }

        await self.manager.send_approval_request(
            approval_id=request.request_id,
            user_ids=approvers,
            request_data=request_data,
        )

    def _get_approvers_for(self, request) -> list[str]:
        """Determine who can approve a given request."""
        # Simplified - would query role hierarchy
        if request.session_owner_role == "resident_physician":
            return ["dr.smith", "dr.jones", "nurse.supervisor"]
        return [request.session_owner_id, "clinical.director"]
```

---

## 9. Appendices

### Appendix A: Regulatory Compliance Mapping

| Requirement | Source | Implementation |
|------------|--------|----------------|
| Access Control | HIPAA 164.312(a) | RBAC + ABAC + Default Deny |
| Audit Controls | HIPAA 164.312(b) | Tamper-proof audit logging |
| Integrity | HIPAA 164.312(c) | Chain hashing, HMAC |
| Minimum Necessary | HIPAA 164.502(b) | Scope minimization |
| Emergency Access | HIPAA 164.312(a)(2)(ii) | Break-glass procedures |
| Right to Explanation | GDPR Art. 22 | Audit trail, reasoning capture |
| Data Protection by Design | GDPR Art. 25 | Policy-as-code, least privilege |
| Safety Classification | IEC 62304 Class C | 5-tier tool classification |
| Risk Management | ISO 14971 | Risk-based approval gates |
| AI Transparency | NIST AI RMF | Audit logging, explainability |

### Appendix B: Threat Model

| Threat | Likelihood | Impact | Mitigation |
|--------|-----------|--------|------------|
| AI agent invokes forbidden tool | Medium | Critical | Hard-coded denial, alert generation |
| AI agent bypasses approval gate | Low | Critical | Middleware pipeline, tamper-proof audit |
| Compromised clinician credentials | Low | High | MFA, device trust, session limits |
| Prompt injection leading to unauthorized tool use | Medium | High | Input validation, tool classification, RBAC |
| AI agent hallucinates tool parameters | Medium | High | Schema validation, parameter bounds checking |
| Emergency bypass abuse | Low | Medium | Dual control, mandatory review, time limits |
| Audit log tampering | Low | Critical | Chain hashing, HMAC, WORM storage |
| Session hijacking | Low | High | Short sessions, device binding, anomaly detection |

### Appendix C: Implementation Checklist

- [ ] RBAC roles defined for all clinical roles
- [ ] ABAC policies implemented for context-aware access
- [ ] Policy-as-code deployed (OPA or Casbin)
- [ ] 5-tier tool classification applied to all tools
- [ ] Forbidden tools have hard-coded denial with alerting
- [ ] Pre-approval workflow implemented for Tier 4 tools
- [ ] Post-hoc review system active for Tier 3 tools
- [ ] Break-glass procedures documented and tested
- [ ] Tamper-proof audit logging operational
- [ ] Real-time audit stream active
- [ ] Kill switch tested with < 1 second response
- [ ] Clinic-wide emergency stop tested
- [ ] Gradual capability reduction implemented
- [ ] Read-only mode as default entry point
- [ ] Simulation mode available for testing
- [ ] WebSocket approval notifications active
- [ ] Rate limiting configured per tool
- [ ] Session timeout and renewal tested
- [ ] HIPAA compliance report generated
- [ ] Post-incident review process established

### Appendix D: License Notes

| Component | License | Notes |
|-----------|---------|-------|
| Open Policy Agent (OPA) | Apache-2.0 | Policy engine, permissive license |
| Casbin | Apache-2.0 | RBAC/ABAC library, permissive license |
| FastAPI | MIT | Web framework, permissive license |
| Python standard library | PSF | No external dependencies for core |
| Custom code in this report | MIT | Provided as reference implementation |

All code examples in this report are provided as reference implementations under MIT license unless otherwise noted. They are intended for educational and development purposes and should be adapted to specific organizational requirements, validated through security review, and tested thoroughly before production deployment in clinical environments.

### Appendix E: Glossary

| Term | Definition |
|------|-----------|
| **ABAC** | Attribute-Based Access Control - permissions based on attributes of subject, resource, action, and environment |
| **Break-glass** | Emergency procedure to bypass normal access controls |
| **HIPAA** | Health Insurance Portability and Accountability Act - US healthcare privacy law |
| **JIT** | Just-in-Time access - temporary, time-bound permissions |
| **OPA** | Open Policy Agent - open source policy engine |
| **PHI** | Protected Health Information - individually identifiable health information |
| **RBAC** | Role-Based Access Control - permissions based on organizational roles |
| **WORM** | Write Once Read Many - storage that prevents modification after writing |

---

> **Document End.**
>
> This report was generated as a comprehensive technical reference for clinical AI agent tool governance. All implementations should undergo security review, penetration testing, and clinical safety validation before production deployment.
>
> For questions or updates, refer to the latest NIST AI Risk Management Framework, HIPAA Security Rule guidance, and IEC 62304 medical device software standards.
