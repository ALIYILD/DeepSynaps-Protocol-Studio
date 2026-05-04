"""Shared agent-skills router payloads.

Promoted out of ``apps/api/app/routers/agent_skills_router.py`` per
Architect Rec #5. These response types are consumed by the API contract
and should not live inline inside the router module.
"""

from __future__ import annotations

from pydantic import BaseModel


class OpenClawWrapperDefaultsOut(BaseModel):
    requires_clinician_review: bool
    governance_policy_ref: str
    wrapper_version: str


class OpenClawCuratedSkillOut(BaseModel):
    source_skill_name: str
    domain: str
    status: str
    license_note: str
    rationale: str
    patient_facing_default_allowed: bool
    notes: list[str]
    wrapper_defaults: OpenClawWrapperDefaultsOut


class OpenClawCuratedSkillCatalogResponse(BaseModel):
    allowlisted: list[OpenClawCuratedSkillOut]
    rejected: list[OpenClawCuratedSkillOut]
    allowlisted_total: int
    rejected_total: int


class CuratedClinicalLayerUseCaseOut(BaseModel):
    id: str
    label: str
    summary: str
    execution_mode: str
    allowed_source_skills: list[str]
    native_backing_services: list[str]
    supported_claim_types: list[str]
    patient_facing_possible: bool
    requires_citations: bool
    notes: list[str]
    wrapper_defaults: OpenClawWrapperDefaultsOut


class CuratedClinicalLayerResponse(BaseModel):
    use_cases: list[CuratedClinicalLayerUseCaseOut]
    total: int
