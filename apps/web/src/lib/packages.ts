/**
 * Canonical package and feature definitions for DeepSynaps Studio.
 *
 * This mirrors the backend app/packages.py. When adding features or packages,
 * update both files to keep them in sync.
 *
 * Governance restrictions (EV-D block, off-label rules) are independent of
 * commercial package tiers and are never relaxed by upgrading a plan.
 */

import { PackageId } from "../types/domain";

// ── Feature identifiers ───────────────────────────────────────────────────────

export const FEATURES = {
  // Evidence library
  EVIDENCE_LIBRARY_READ: "evidence_library.read",
  EVIDENCE_LIBRARY_FULL: "evidence_library.full",
  // Device registry
  DEVICE_REGISTRY_LIMITED: "device_registry.limited",
  DEVICE_REGISTRY_FULL: "device_registry.full",
  // Conditions & modalities
  CONDITIONS_BROWSE_LIMITED: "conditions.browse_limited",
  CONDITIONS_BROWSE_FULL: "conditions.browse_full",
  // Protocol generator
  PROTOCOL_GENERATE_LIMITED: "protocol.generate_limited",
  PROTOCOL_GENERATE: "protocol.generate",
  PROTOCOL_EVC_OVERRIDE: "protocol.ev_c_override",
  // Uploads
  UPLOADS_CASE_FILES: "uploads.case_files",
  // Summaries
  SUMMARIES_PERSONALIZED: "summaries.personalized",
  // Assessment builder
  ASSESSMENT_BUILDER_LIMITED: "assessment.builder_limited",
  ASSESSMENT_BUILDER_FULL: "assessment.builder_full",
  // Handbooks & exports
  HANDBOOK_GENERATE_LIMITED: "handbook.generate_limited",
  HANDBOOK_GENERATE_FULL: "handbook.generate_full",
  EXPORTS_PDF: "exports.pdf",
  EXPORTS_DOCX: "exports.docx",
  EXPORTS_PATIENT_FACING: "exports.patient_facing",
  // Phenotype mapping
  PHENOTYPE_MAPPING: "phenotype_mapping.use",
  // Review queue
  REVIEW_QUEUE_PERSONAL: "review_queue.personal",
  REVIEW_QUEUE_TEAM: "review_queue.team",
  // Audit trail
  AUDIT_TRAIL_PERSONAL: "audit_trail.personal",
  AUDIT_TRAIL_TEAM: "audit_trail.team",
  // Monitoring
  MONITORING_DIGEST: "monitoring.digest",
  MONITORING_WORKSPACE: "monitoring.workspace",
  // Team management
  SEATS_TEAM_MANAGE: "seats.team_manage",
  TEAM_TEMPLATES: "team.templates",
  TEAM_COMMENTS: "team.comments",
  // Branding
  BRANDING_WHITELABEL_BASIC: "branding.whitelabel_basic",
  BRANDING_WHITELABEL_FULL: "branding.whitelabel_full",
  // API
  API_ACCESS: "api.access",
} as const;

export type Feature = (typeof FEATURES)[keyof typeof FEATURES];

// ── Package tier type ─────────────────────────────────────────────────────────

export type PackageTier = {
  id: PackageId;
  displayName: string;
  monthlyPriceUsd: number;
  annualPriceUsd: number | null;
  seatLimit: number | null;
  features: ReadonlySet<Feature>;
  addonEligible: Feature[];
  enterprise: boolean;
  customPricing: boolean;
  bestFor: string;
};

// ── Feature sets ──────────────────────────────────────────────────────────────

const EXPLORER_FEATURES: Feature[] = [
  FEATURES.EVIDENCE_LIBRARY_READ,
  FEATURES.DEVICE_REGISTRY_LIMITED,
  FEATURES.CONDITIONS_BROWSE_LIMITED,
];

const RESIDENT_FEATURES: Feature[] = [
  FEATURES.EVIDENCE_LIBRARY_FULL,
  FEATURES.DEVICE_REGISTRY_FULL,
  FEATURES.CONDITIONS_BROWSE_FULL,
  FEATURES.PROTOCOL_GENERATE_LIMITED,
  FEATURES.ASSESSMENT_BUILDER_LIMITED,
  FEATURES.HANDBOOK_GENERATE_LIMITED,
  FEATURES.EXPORTS_PDF,
];

const CLINICIAN_PRO_FEATURES: Feature[] = [
  FEATURES.EVIDENCE_LIBRARY_FULL,
  FEATURES.DEVICE_REGISTRY_FULL,
  FEATURES.CONDITIONS_BROWSE_FULL,
  FEATURES.PROTOCOL_GENERATE,
  FEATURES.PROTOCOL_EVC_OVERRIDE,
  FEATURES.UPLOADS_CASE_FILES,
  FEATURES.SUMMARIES_PERSONALIZED,
  FEATURES.ASSESSMENT_BUILDER_FULL,
  FEATURES.HANDBOOK_GENERATE_FULL,
  FEATURES.EXPORTS_PDF,
  FEATURES.EXPORTS_DOCX,
  FEATURES.EXPORTS_PATIENT_FACING,
  FEATURES.REVIEW_QUEUE_PERSONAL,
  FEATURES.AUDIT_TRAIL_PERSONAL,
  FEATURES.MONITORING_DIGEST,
];

const CLINIC_TEAM_FEATURES: Feature[] = [
  ...CLINICIAN_PRO_FEATURES,
  FEATURES.PHENOTYPE_MAPPING,
  FEATURES.REVIEW_QUEUE_TEAM,
  FEATURES.AUDIT_TRAIL_TEAM,
  FEATURES.SEATS_TEAM_MANAGE,
  FEATURES.TEAM_TEMPLATES,
  FEATURES.TEAM_COMMENTS,
  FEATURES.BRANDING_WHITELABEL_BASIC,
];

const ENTERPRISE_FEATURES: Feature[] = [
  ...CLINIC_TEAM_FEATURES,
  FEATURES.MONITORING_WORKSPACE,
  FEATURES.BRANDING_WHITELABEL_FULL,
  FEATURES.API_ACCESS,
];

// ── Package registry ──────────────────────────────────────────────────────────

export const PACKAGES: Record<PackageId, PackageTier> = {
  explorer: {
    id: "explorer",
    displayName: "Explorer",
    monthlyPriceUsd: 0,
    annualPriceUsd: 0,
    seatLimit: 1,
    features: new Set(EXPLORER_FEATURES),
    addonEligible: [],
    enterprise: false,
    customPricing: false,
    bestFor: "Evaluators exploring the platform before committing",
  },
  resident: {
    id: "resident",
    displayName: "Resident / Fellow",
    monthlyPriceUsd: 99,
    annualPriceUsd: 990,
    seatLimit: 1,
    features: new Set(RESIDENT_FEATURES),
    addonEligible: [],
    enterprise: false,
    customPricing: false,
    bestFor: "Trainees and early-career clinicians building protocol knowledge",
  },
  clinician_pro: {
    id: "clinician_pro",
    displayName: "Clinician Pro",
    monthlyPriceUsd: 199,
    annualPriceUsd: 1990,
    seatLimit: 1,
    features: new Set(CLINICIAN_PRO_FEATURES),
    addonEligible: [FEATURES.PHENOTYPE_MAPPING],
    enterprise: false,
    customPricing: false,
    bestFor: "Independent clinicians managing individual patient protocols",
  },
  clinic_team: {
    id: "clinic_team",
    displayName: "Clinic Team",
    monthlyPriceUsd: 699,
    annualPriceUsd: 6990,
    seatLimit: 10,
    features: new Set(CLINIC_TEAM_FEATURES),
    addonEligible: [],
    enterprise: false,
    customPricing: false,
    bestFor: "Clinical teams sharing review queues and governance workflows",
  },
  enterprise: {
    id: "enterprise",
    displayName: "Enterprise",
    monthlyPriceUsd: 2500,
    annualPriceUsd: null,
    seatLimit: null,
    features: new Set(ENTERPRISE_FEATURES),
    addonEligible: [],
    enterprise: true,
    customPricing: true,
    bestFor: "Organizations requiring custom governance, branding, and API access",
  },
};

export const PACKAGE_ORDER: PackageId[] = [
  "explorer",
  "resident",
  "clinician_pro",
  "clinic_team",
  "enterprise",
];

// ── Entitlement helpers ───────────────────────────────────────────────────────

export function hasFeature(packageId: PackageId, feature: Feature): boolean {
  return PACKAGES[packageId]?.features.has(feature) ?? false;
}

/** Return the lowest package that includes the given feature, or null. */
export function minimumPackageFor(feature: Feature): PackageTier | null {
  for (const id of PACKAGE_ORDER) {
    if (PACKAGES[id].features.has(feature)) return PACKAGES[id];
  }
  return null;
}

export function formatPrice(pkg: PackageTier): string {
  if (pkg.customPricing) return "Custom pricing";
  if (pkg.monthlyPriceUsd === 0) return "Free";
  return `$${pkg.monthlyPriceUsd} / month`;
}

export function formatAnnualPrice(pkg: PackageTier): string | null {
  if (pkg.customPricing || pkg.annualPriceUsd === null) return null;
  if (pkg.annualPriceUsd === 0) return "Free";
  return `$${pkg.annualPriceUsd} / year`;
}

export function formatSeatLimit(pkg: PackageTier): string {
  if (pkg.seatLimit === null) return "Unlimited seats";
  if (pkg.seatLimit === 1) return "Single seat";
  return `Up to ${pkg.seatLimit} seats`;
}
