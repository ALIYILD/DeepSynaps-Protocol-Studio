"""Canonical package and feature definitions for DeepSynaps Studio.

Commercial package entitlements are separate from clinical governance rules.
Governance restrictions (EV-D block, off-label controls) always apply regardless
of package tier and are never relaxed by upgrading a plan.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class Feature(str, Enum):
    """Machine-readable feature identifiers used for entitlement checks."""

    # Evidence library
    EVIDENCE_LIBRARY_READ = "evidence_library.read"
    EVIDENCE_LIBRARY_FULL = "evidence_library.full"

    # Device registry
    DEVICE_REGISTRY_LIMITED = "device_registry.limited"
    DEVICE_REGISTRY_FULL = "device_registry.full"

    # Conditions & modalities browsing
    CONDITIONS_BROWSE_LIMITED = "conditions.browse_limited"
    CONDITIONS_BROWSE_FULL = "conditions.browse_full"

    # Protocol generator — EV-D is always blocked by governance, not package
    PROTOCOL_GENERATE_LIMITED = "protocol.generate_limited"  # EV-A/B only, no off-label
    PROTOCOL_GENERATE = "protocol.generate"  # full generation
    PROTOCOL_EVC_OVERRIDE = "protocol.ev_c_override"  # clinician-initiated EV-C use

    # Uploads
    UPLOADS_CASE_FILES = "uploads.case_files"

    # Personalized case summaries
    SUMMARIES_PERSONALIZED = "summaries.personalized"

    # Assessment builder
    ASSESSMENT_BUILDER_LIMITED = "assessment.builder_limited"
    ASSESSMENT_BUILDER_FULL = "assessment.builder_full"

    # Handbooks & exports
    HANDBOOK_GENERATE_LIMITED = "handbook.generate_limited"
    HANDBOOK_GENERATE_FULL = "handbook.generate_full"
    EXPORTS_PDF = "exports.pdf"
    EXPORTS_DOCX = "exports.docx"
    EXPORTS_PATIENT_FACING = "exports.patient_facing"

    # Phenotype mapping (add-on for Clinician Pro)
    PHENOTYPE_MAPPING = "phenotype_mapping.use"

    # Review queue
    REVIEW_QUEUE_PERSONAL = "review_queue.personal"
    REVIEW_QUEUE_TEAM = "review_queue.team"

    # Audit trail
    AUDIT_TRAIL_PERSONAL = "audit_trail.personal"
    AUDIT_TRAIL_TEAM = "audit_trail.team"

    # Monitoring
    MONITORING_DIGEST = "monitoring.digest"
    MONITORING_WORKSPACE = "monitoring.workspace"

    # Team management
    SEATS_TEAM_MANAGE = "seats.team_manage"
    TEAM_TEMPLATES = "team.templates"
    TEAM_COMMENTS = "team.comments"

    # Branding
    BRANDING_WHITELABEL_BASIC = "branding.whitelabel_basic"
    BRANDING_WHITELABEL_FULL = "branding.whitelabel_full"

    # API / integrations
    API_ACCESS = "api.access"


@dataclass(frozen=True, slots=True)
class Package:
    id: str
    display_name: str
    monthly_price_usd: int
    annual_price_usd: int | None  # None = custom / not offered
    seat_limit: int | None  # None = unlimited
    features: frozenset[Feature]
    addon_eligible: frozenset[Feature]
    enterprise: bool
    custom_pricing: bool
    best_for: str

    def has(self, feature: Feature) -> bool:
        return feature in self.features

    def can_add_on(self, feature: Feature) -> bool:
        return feature in self.addon_eligible


# ── Feature sets per package ──────────────────────────────────────────────────

_EXPLORER: frozenset[Feature] = frozenset({
    Feature.EVIDENCE_LIBRARY_READ,
    Feature.DEVICE_REGISTRY_LIMITED,
    Feature.CONDITIONS_BROWSE_LIMITED,
})

_RESIDENT: frozenset[Feature] = frozenset({
    Feature.EVIDENCE_LIBRARY_FULL,
    Feature.DEVICE_REGISTRY_FULL,
    Feature.CONDITIONS_BROWSE_FULL,
    Feature.PROTOCOL_GENERATE_LIMITED,
    Feature.ASSESSMENT_BUILDER_LIMITED,
    Feature.HANDBOOK_GENERATE_LIMITED,
    Feature.EXPORTS_PDF,
})

_CLINICIAN_PRO: frozenset[Feature] = frozenset({
    Feature.EVIDENCE_LIBRARY_FULL,
    Feature.DEVICE_REGISTRY_FULL,
    Feature.CONDITIONS_BROWSE_FULL,
    Feature.PROTOCOL_GENERATE,
    Feature.PROTOCOL_EVC_OVERRIDE,
    Feature.UPLOADS_CASE_FILES,
    Feature.SUMMARIES_PERSONALIZED,
    Feature.ASSESSMENT_BUILDER_FULL,
    Feature.HANDBOOK_GENERATE_FULL,
    Feature.EXPORTS_PDF,
    Feature.EXPORTS_DOCX,
    Feature.EXPORTS_PATIENT_FACING,
    Feature.REVIEW_QUEUE_PERSONAL,
    Feature.AUDIT_TRAIL_PERSONAL,
    Feature.MONITORING_DIGEST,
})

_CLINIC_TEAM: frozenset[Feature] = frozenset({
    Feature.EVIDENCE_LIBRARY_FULL,
    Feature.DEVICE_REGISTRY_FULL,
    Feature.CONDITIONS_BROWSE_FULL,
    Feature.PROTOCOL_GENERATE,
    Feature.PROTOCOL_EVC_OVERRIDE,
    Feature.UPLOADS_CASE_FILES,
    Feature.SUMMARIES_PERSONALIZED,
    Feature.ASSESSMENT_BUILDER_FULL,
    Feature.HANDBOOK_GENERATE_FULL,
    Feature.EXPORTS_PDF,
    Feature.EXPORTS_DOCX,
    Feature.EXPORTS_PATIENT_FACING,
    Feature.PHENOTYPE_MAPPING,
    Feature.REVIEW_QUEUE_PERSONAL,
    Feature.REVIEW_QUEUE_TEAM,
    Feature.AUDIT_TRAIL_PERSONAL,
    Feature.AUDIT_TRAIL_TEAM,
    Feature.MONITORING_DIGEST,
    Feature.SEATS_TEAM_MANAGE,
    Feature.TEAM_TEMPLATES,
    Feature.TEAM_COMMENTS,
    Feature.BRANDING_WHITELABEL_BASIC,
})

_ENTERPRISE: frozenset[Feature] = frozenset({
    Feature.EVIDENCE_LIBRARY_FULL,
    Feature.DEVICE_REGISTRY_FULL,
    Feature.CONDITIONS_BROWSE_FULL,
    Feature.PROTOCOL_GENERATE,
    Feature.PROTOCOL_EVC_OVERRIDE,
    Feature.UPLOADS_CASE_FILES,
    Feature.SUMMARIES_PERSONALIZED,
    Feature.ASSESSMENT_BUILDER_FULL,
    Feature.HANDBOOK_GENERATE_FULL,
    Feature.EXPORTS_PDF,
    Feature.EXPORTS_DOCX,
    Feature.EXPORTS_PATIENT_FACING,
    Feature.PHENOTYPE_MAPPING,
    Feature.REVIEW_QUEUE_PERSONAL,
    Feature.REVIEW_QUEUE_TEAM,
    Feature.AUDIT_TRAIL_PERSONAL,
    Feature.AUDIT_TRAIL_TEAM,
    Feature.MONITORING_DIGEST,
    Feature.MONITORING_WORKSPACE,
    Feature.SEATS_TEAM_MANAGE,
    Feature.TEAM_TEMPLATES,
    Feature.TEAM_COMMENTS,
    Feature.BRANDING_WHITELABEL_BASIC,
    Feature.BRANDING_WHITELABEL_FULL,
    Feature.API_ACCESS,
})


# ── Package registry ──────────────────────────────────────────────────────────

PACKAGES: dict[str, Package] = {
    "explorer": Package(
        id="explorer",
        display_name="Explorer",
        monthly_price_usd=0,
        annual_price_usd=0,
        seat_limit=1,
        features=_EXPLORER,
        addon_eligible=frozenset(),
        enterprise=False,
        custom_pricing=False,
        best_for="Evaluators exploring the platform before committing",
    ),
    "resident": Package(
        id="resident",
        display_name="Resident / Fellow",
        monthly_price_usd=99,
        annual_price_usd=990,
        seat_limit=1,
        features=_RESIDENT,
        addon_eligible=frozenset(),
        enterprise=False,
        custom_pricing=False,
        best_for="Trainees and early-career clinicians building protocol knowledge",
    ),
    "clinician_pro": Package(
        id="clinician_pro",
        display_name="Clinician Pro",
        monthly_price_usd=199,
        annual_price_usd=1990,
        seat_limit=1,
        features=_CLINICIAN_PRO,
        addon_eligible=frozenset({Feature.PHENOTYPE_MAPPING}),
        enterprise=False,
        custom_pricing=False,
        best_for="Independent clinicians managing individual patient protocols",
    ),
    "clinic_team": Package(
        id="clinic_team",
        display_name="Clinic Team",
        monthly_price_usd=699,
        annual_price_usd=6990,
        seat_limit=10,
        features=_CLINIC_TEAM,
        addon_eligible=frozenset(),
        enterprise=False,
        custom_pricing=False,
        best_for="Clinical teams sharing review queues and governance workflows",
    ),
    "enterprise": Package(
        id="enterprise",
        display_name="Enterprise",
        monthly_price_usd=2500,
        annual_price_usd=None,
        seat_limit=None,
        features=_ENTERPRISE,
        addon_eligible=frozenset(),
        enterprise=True,
        custom_pricing=True,
        best_for="Organizations requiring custom governance, branding, and API access",
    ),
}

DEFAULT_PACKAGE_ID = "explorer"

# Ordered lowest → highest for minimum-package lookups
PACKAGE_ORDER: list[str] = ["explorer", "resident", "clinician_pro", "clinic_team", "enterprise"]


def minimum_package_for(feature: Feature) -> Package | None:
    """Return the lowest package that includes the given feature, or None."""
    for pid in PACKAGE_ORDER:
        if PACKAGES[pid].has(feature):
            return PACKAGES[pid]
    return None
