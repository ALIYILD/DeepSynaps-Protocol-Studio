/**
 * ============================================================================
 * DeepSynaps Protocol Studio — Clinician Sidebar Navigation System
 * ============================================================================
 *
 * THE core architecture file. This module transforms DeepSynaps from a
 * collection of tools into a clinician operating system. It is the single
 * source of truth for ALL navigation items across the entire platform.
 *
 * Design philosophy:
 *   - Role-aware: every item declares who can see it
 *   - Status-aware: active, beta, preview, coming-soon, hidden
 *   - Searchable: every item carries keywords for discovery
 *   - Aliased: routes can have multiple entry points
 *   - Sectioned: 7 clinical question groups organize the sidebar
 *
 * Sections:
 *   1. TODAY        — "What requires my attention?"
 *   2. PATIENTS     — "Who am I managing?"
 *   3. INTERVENTIONS— "What treatments/care plans are we providing?"
 *   4. ANALYZERS    — "What intelligence/analysis do we have?"
 *   5. INTELLIGENCE — "What multimodal synthesis/evidence/AI support?"
 *   6. ECOSYSTEM    — "What external systems/resources/marketplace?"
 *   7. ADMIN        — "How is the clinic, governance, data, finance managed?"
 *
 * @module navigation/clinicianSidebar
 * @version 2.0.0
 * @since 2026-05
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. ROLE DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

/** @enum {string} Individual role identifiers used across the platform. */
const ROLES = {
  PATIENT: 'patient',
  RECEPTIONIST: 'receptionist',
  CLINICIAN: 'clinician',
  REVIEWER: 'reviewer',
  TECHNICIAN: 'technician',
  RESIDENT: 'resident',
  CLINIC_ADMIN: 'clinic_admin',
  RESEARCHER: 'researcher',
  SUPER_ADMIN: 'supervisor',
  INTERNAL: 'admin',
};

/**
 * Pre-defined role groups for convenient shorthand assignment.
 * These groups express common access patterns without repeating arrays.
 */
const ROLE_GROUPS = {
  /** All clinical staff who need broad patient-facing access. */
  ALL_CLINICAL: [
    ROLES.CLINICIAN, ROLES.RESIDENT, ROLES.REVIEWER,
    ROLES.TECHNICIAN, ROLES.CLINIC_ADMIN, ROLES.SUPER_ADMIN, ROLES.INTERNAL,
  ],
  /** Clinicians plus elevated admin — for sensitive clinical tools. */
  CLINICIAN_PLUS: [
    ROLES.CLINICIAN, ROLES.CLINIC_ADMIN, ROLES.SUPER_ADMIN, ROLES.INTERNAL,
  ],
  /** Admin-only features — clinic operations, governance, finance. */
  ADMIN_ONLY: [
    ROLES.CLINIC_ADMIN, ROLES.SUPER_ADMIN, ROLES.INTERNAL,
  ],
  /** Super-admin only — system-level destructive or sensitive operations. */
  SUPER_ONLY: [
    ROLES.SUPER_ADMIN, ROLES.INTERNAL,
  ],
  /** Patient-facing portal views. */
  PATIENT: [
    ROLES.PATIENT,
  ],
  /** Receptionist and above — scheduling, basic patient management. */
  RECEPTIONIST: [
    ROLES.RECEPTIONIST, ROLES.CLINIC_ADMIN, ROLES.SUPER_ADMIN, ROLES.INTERNAL,
  ],
  /** Researcher and clinical collaborators — evidence, datasets, studies. */
  RESEARCHER: [
    ROLES.RESEARCHER, ROLES.CLINICIAN, ROLES.CLINIC_ADMIN,
    ROLES.SUPER_ADMIN, ROLES.INTERNAL,
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. NAVIGATION STATUS ENUM
// ─────────────────────────────────────────────────────────────────────────────

/** @enum {string} Visual lifecycle state rendered as a badge on nav items. */
const STATUS = {
  /** Fully launched and actively maintained. */
  ACTIVE: 'active',
  /** Available but tagged as early release — may have rough edges. */
  BETA: 'beta',
  /** Visible to select users before general availability. */
  PREVIEW: 'preview',
  /** Visible in nav but disabled (non-interactive, shows future intent). */
  COMING_SOON: 'comingSoon',
  /** Registered but never rendered (feature-flagged off). */
  HIDDEN: 'hidden',
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. ICON REGISTRY — Lucide-style SVG icons keyed by icon name
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SVG icon strings (viewBox="0 0 24 24") keyed by short name.
 * These are injected into the DOM as inline SVG for instant rendering
 * without external network requests.
 */
const ICONS = {
  'layout-grid': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>`,
  'inbox': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>`,
  'newspaper': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/></svg>`,
  'calendar': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>`,
  'users': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  'clipboard-check': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/></svg>`,
  'file-text': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
  'video': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 8-6 4 6 4V8z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>`,
  'zap': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  'brain': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-1.07-3 2.5 2.5 0 0 1 .49-4.78 2.5 2.5 0 0 1 1.5-4.58A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 1.07-3 2.5 2.5 0 0 0-.49-4.78 2.5 2.5 0 0 0-1.5-4.58A2.5 2.5 0 0 0 14.5 2Z"/><circle cx="12" cy="12" r="2" fill="currentColor" opacity=".4"/></svg>`,
  'activity': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`,
  'map-pin': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`,
  'hard-drive': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" x2="2" y1="12" y2="12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="6" x2="6.01" y1="16" y2="16"/><line x1="10" x2="10.01" y1="16" y2="16"/></svg>`,
  'book-open': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`,
  'microscope': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18h8"/><path d="M3 22h18"/><path d="M14 22a7 7 0 1 0 0-14h-1"/><path d="M9 14h2"/><path d="M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z"/><path d="M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3"/></svg>`,
  'shield-alert': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>`,
  'dna': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 15 5.66-5.66a2 2 0 0 1 2.83 0L15 14"/><path d="m9 22 5.66-5.66a2 2 0 0 1 2.83 0L23 22"/><path d="M2 9l3.66-3.66a2 2 0 0 1 2.83 0L14 10"/><path d="M15 16l3.66-3.66a2 2 0 0 1 2.83 0L23 15"/><circle cx="12" cy="5" r="1" fill="currentColor"/><circle cx="18" cy="12" r="1" fill="currentColor"/><circle cx="6" cy="18" r="1" fill="currentColor"/></svg>`,
  'heart-pulse': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"/></svg>`,
  'pill': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/></svg>`,
  ' Accessibility': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1"/><path d="m9 20 3-6 3 6"/><path d="m6 8 6 2 6-2"/><path d="M12 10V4"/></svg>`,
  'heart': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
  'sparkles': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/></svg>`,
  'mic': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>`,
  'align-left': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" x2="3" y1="10" y2="10"/><line x1="21" x2="3" y1="6" y2="6"/><line x1="21" x2="3" y1="14" y2="14"/><line x1="21" x2="3" y1="18" y2="18"/></svg>`,
  'scan-eye': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="1"/><path d="M18 12q-2.5 4-6 4t-6-4q2.5-4 6-4t6 4Z"/></svg>`,
  'move': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"/><path d="m15 19-3 3-3-3"/><path d="m19 9 3 3-3 3"/><path d="M2 12h20"/><path d="m5 9-3 3 3 3"/><path d="m9 5 3-3 3 3"/></svg>`,
  'smartphone': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg>`,
  'puzzle': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15.5 2H12a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h3a1 1 0 0 1 1 1v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V6a4 4 0 0 0-4.5-4z"/><path d="M8.5 22H12a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1h-3a1 1 0 0 1-1-1v-3a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v3a4 4 0 0 0 4.5 4z"/><path d="M5.5 2H5a3 3 0 0 0-3 3v.5"/><path d="M18.5 22h.5a3 3 0 0 0 3-3v-.5"/></svg>`,
  'scan': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3"/></svg>`,
  'database': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>`,
  'bar-chart-3': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>`,
  'cpu': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/></svg>`,
  'git-branch': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>`,
  'binary': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="14" y="14" width="4" height="6" rx="2"/><rect x="6" y="4" width="4" height="6" rx="2"/><path d="M6 20h4"/><path d="M14 10h4"/><path d="M6 14h12v6H6z"/><path d="M6 4h12v6H6z"/></svg>`,
  'bot': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="10" x="3" y="11" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" x2="8" y1="16" y2="16"/><line x1="16" x2="16" y1="16" y2="16"/></svg>`,
  'bot-message-square': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 13 1-1"/><path d="m20 13 1-1"/><path d="M12 22a8 8 0 1 1 0-16 8 8 0 0 1 0 16z"/><path d="M9 9h.01"/><path d="M15 9h.01"/></svg>`,
  'shopping-cart': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>`,
  'graduation-cap': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`,
  'activity-pulse': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`,
  'bar-chart-2': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/></svg>`,
  'coins': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/></svg>`,
  'table-2': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><line x1="3" x2="21" y1="9" y2="9"/><line x1="3" x2="21" y1="15" y2="15"/><line x1="12" x2="12" y1="3" y2="21"/></svg>`,
  'clipboard-list': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>`,
  'settings': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
  'users-cog': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><circle cx="19" cy="12" r="1"/><path d="m18 10-1 2 1 2"/><path d="m20 10 1 2-1 2"/></svg>`,
  'file-bar-chart': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M12 18v-6"/><path d="M8 18v-4"/><path d="M16 18v-2"/></svg>`,
  'layers': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
  'radar': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M12 2a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1 1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><path d="M12 19a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1 1 1 0 0 1-1-1v-1a1 1 0 0 1 1-1z"/><path d="M20.39 7.39a1 1 0 0 1 0 1.42l-.71.7a1 1 0 0 1-1.42 0 1 1 0 0 1 0-1.41l.71-.71a1 1 0 0 1 1.42 0z"/><path d="M5.74 14.26a1 1 0 0 1 0 1.42l-.71.7a1 1 0 0 1-1.42 0 1 1 0 0 1 0-1.41l.71-.72a1 1 0 0 1 1.42 0z"/><path d="M22 12a1 1 0 0 1-1 1h-1a1 1 0 0 1 0-2h1a1 1 0 0 1 1 1z"/><path d="M4 12a1 1 0 0 1-1 1H2a1 1 0 0 1 0-2h1a1 1 0 0 1 1 1z"/><path d="M20.39 16.61a1 1 0 0 1-1.42 0l-.71-.71a1 1 0 0 1 0-1.42 1 1 0 0 1 1.42 0l.71.72a1 1 0 0 1 0 1.41z"/><path d="M5.74 9.74a1 1 0 0 1-1.42 0l-.71-.71a1 1 0 0 1 0-1.42 1 1 0 0 1 1.42 0l.71.71a1 1 0 0 1 0 1.42z"/></svg>`,
  'atom': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><path d="M20.2 20.2c2.04-2.03.02-7.36-4.5-11.9-4.54-4.52-9.87-6.54-11.9-4.5-2.04 2.03-.02 7.36 4.5 11.9 4.54 4.52 9.87 6.54 11.9 4.5Z"/><path d="M15.7 15.7c4.52-4.54 6.54-9.87 4.5-11.9-2.03-2.04-7.36-.02-11.9 4.5-4.52 4.54-6.54 9.87-4.5 11.9 2.03 2.04 7.36.02 11.9-4.5Z"/><path d="M12 12v.01"/></svg>`,
  'search': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
  'bell': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`,
  'lock': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  'ticket': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/></svg>`,
  'flask-conical': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2"/><path d="M8.5 2h7"/><path d="M7 16h10"/></svg>`,
  'wand-2': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H5"/><path d="M19 16h-2"/><path d="m15 22-1-1"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>`,
  'scroll-text': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h12a2 2 0 0 0 2-2v-2H10v2a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v3h4"/><path d="M19 17V5a2 2 0 0 0-2-2H6"/></svg>`,
  'user-check': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>`,
  'circle-dot': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>`,
  'trending-up': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
  'network': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><path d="M5 5v4h4"/><path d="M15 19v-4h-4"/><path d="m19 5-4 4"/><path d="m5 19 4-4"/></svg>`,
  'timer': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/></svg>`,
  'circle-plus': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>`,
  'cone': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 2 8.66 15H3.34z"/></svg>`,
  'target': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
  'umbrella': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12a10.06 10.06 0 0 0-20 0Z"/><path d="M12 12v8a2 2 0 0 0 4 0"/><path d="M12 2v1"/></svg>`,
  'eye': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. NAVIGATION ITEMS — 70+ items across 7 sections
// ─────────────────────────────────────────────────────────────────────────────

/**
 * THE source of truth. Every navigation item in the DeepSynaps platform.
 *
 * @typedef {Object} NavItem
 * @property {string} id           — Unique identifier (used for keys, lookups)
 * @property {string} label        — Display label (human-readable)
 * @property {string} route        — Primary route path
 * @property {string[]} [aliases]  — Alternative route paths that highlight this item
 * @property {string} icon         — Key into the ICONS registry
 * @property {string} section      — Section name (TODAY|PATIENTS|INTERVENTIONS|ANALYZERS|INTELLIGENCE|ECOSYSTEM|ADMIN)
 * @property {string[]} requiredRoles — Roles that can see this item
 * @property {string} status       — One of STATUS values
 * @property {string} description  — Short description for tooltips/search
 * @property {string[]} keywords   — Searchable keywords
 * @property {NavItem[]} [children] — Nested sub-items (for expandable groups)
 * @property {boolean} [ai]        — Whether this item uses AI (renders AI badge)
 * @property {string} [badge]      — Optional counter/badge text
 */

/** @type {NavItem[]} */
const NAV_ITEMS = [

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 1 — TODAY: "What requires my attention?"
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'dashboard',
    label: 'Dashboard',
    route: '/',
    aliases: ['/dashboard', '/home'],
    icon: 'layout-grid',
    section: 'TODAY',
    requiredRoles: ROLE_GROUPS.ALL_CLINICAL,
    status: STATUS.ACTIVE,
    description: 'Overview of clinic activity, alerts, and daily metrics',
    keywords: ['home', 'overview', 'summary', 'start', 'landing', 'main'],
  },
  {
    id: 'clinician-inbox',
    label: 'Inbox',
    route: '/inbox',
    aliases: ['/clinician-inbox', '/notifications'],
    icon: 'inbox',
    section: 'TODAY',
    requiredRoles: ROLE_GROUPS.ALL_CLINICAL,
    status: STATUS.ACTIVE,
    description: 'Messages, tasks, and notifications requiring attention',
    keywords: ['messages', 'tasks', 'notifications', 'alerts', 'communication', 'mail'],
    badge: '!3',
  },
  {
    id: 'clinician-digest',
    label: 'Clinician Digest',
    route: '/digest',
    aliases: ['/clinician-digest', '/daily-digest'],
    icon: 'newspaper',
    section: 'TODAY',
    requiredRoles: ROLE_GROUPS.ALL_CLINICAL,
    status: STATUS.ACTIVE,
    description: 'Daily summary of patient events, adherence flags, and wellness alerts',
    keywords: ['digest', 'daily', 'summary', 'report', 'briefing', 'rounds'],
  },
  {
    id: 'schedule-v2',
    label: 'Schedule',
    route: '/schedule',
    aliases: ['/schedule-v2', '/calendar', '/appointments'],
    icon: 'calendar',
    section: 'TODAY',
    requiredRoles: ROLE_GROUPS.ALL_CLINICAL,
    status: STATUS.ACTIVE,
    description: 'Appointments, sessions, and calendar management',
    keywords: ['calendar', 'appointments', 'bookings', 'sessions', 'time', 'slots'],
  },
  {
    id: 'quick-actions',
    label: 'Quick Actions',
    route: '/quick-actions',
    aliases: ['/quick-actions', '/actions', '/shortcuts'],
    icon: 'zap',
    section: 'TODAY',
    requiredRoles: ROLE_GROUPS.ALL_CLINICAL,
    status: STATUS.ACTIVE,
    description: 'Frequently used actions and workflow shortcuts',
    keywords: ['quick', 'actions', 'shortcuts', 'frequent', 'workflow', 'speed'],
  },
  {
    id: 'clinician-adherence',
    label: 'Adherence Hub',
    route: '/adherence-hub',
    aliases: ['/clinician-adherence', '/adherence', '/compliance'],
    icon: 'clipboard-check',
    section: 'TODAY',
    requiredRoles: ROLE_GROUPS.ALL_CLINICAL,
    status: STATUS.BETA,
    description: 'Cross-patient adherence monitoring and intervention triage',
    keywords: ['adherence', 'compliance', 'hub', 'monitoring', 'medication', 'follow-up'],
  },
  {
    id: 'clinician-wellness',
    label: 'Wellness Hub',
    route: '/wellness-hub',
    aliases: ['/clinician-wellness', '/wellness-triage', '/staff-wellness'],
    icon: 'heart-pulse',
    section: 'TODAY',
    requiredRoles: ROLE_GROUPS.ALL_CLINICAL,
    status: STATUS.BETA,
    description: 'Staff wellness monitoring and burnout prevention dashboard',
    keywords: ['wellness', 'staff', 'burnout', 'hub', 'triage', 'self-care'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 2 — PATIENTS: "Who am I managing?"
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'patients-v2',
    label: 'Patients',
    route: '/patients',
    aliases: ['/patients-v2', '/patient-list', '/roster'],
    icon: 'users',
    section: 'PATIENTS',
    requiredRoles: ROLE_GROUPS.ALL_CLINICAL,
    status: STATUS.ACTIVE,
    description: 'Patient roster, profiles, and case management',
    keywords: ['patients', 'roster', 'cases', 'clients', 'profiles', 'list'],
  },
  {
    id: 'assessments-v2',
    label: 'Assessments',
    route: '/assessments',
    aliases: ['/assessments-v2', '/assessment-hub'],
    icon: 'clipboard-check',
    section: 'PATIENTS',
    requiredRoles: ROLE_GROUPS.ALL_CLINICAL,
    status: STATUS.ACTIVE,
    description: 'Clinical assessments, scales, and evaluation tools',
    keywords: ['assessments', 'scales', 'evaluations', 'tests', 'forms', 'questionnaires'],
  },
  {
    id: 'documents-v2',
    label: 'Documents',
    route: '/documents',
    aliases: ['/documents-v2', '/files', '/records'],
    icon: 'file-text',
    section: 'PATIENTS',
    requiredRoles: ROLE_GROUPS.CLINICIAN_PLUS,
    status: STATUS.ACTIVE,
    description: 'Patient documents, files, and medical records',
    keywords: ['documents', 'files', 'records', 'pdfs', 'charts', 'notes'],
  },
  {
    id: 'live-session',
    label: 'Virtual Care',
    route: '/virtual-care',
    aliases: ['/live-session', '/telehealth', '/video-call'],
    icon: 'video',
    section: 'PATIENTS',
    requiredRoles: ROLE_GROUPS.CLINICIAN_PLUS,
    status: STATUS.ACTIVE,
    description: 'Telehealth sessions and virtual patient consultations',
    keywords: ['virtual', 'telehealth', 'video', 'call', 'remote', 'consultation', 'session'],
    ai: true,
  },
  {
    id: 'patient-timeline',
    label: 'Patient Timeline',
    route: '/patient-timeline',
    aliases: ['/patient-timeline', '/timeline', '/history'],
    icon: 'timer',
    section: 'PATIENTS',
    requiredRoles: ROLE_GROUPS.ALL_CLINICAL,
    status: STATUS.ACTIVE,
    description: 'Chronological patient event timeline and clinical history',
    keywords: ['timeline', 'history', 'chronology', 'events', 'journey', 'audit'],
  },
  {
    id: 'patient-goals',
    label: 'Patient Goals',
    route: '/patient-goals',
    aliases: ['/patient-goals', '/goals', '/care-plan'],
    icon: 'target',
    section: 'PATIENTS',
    requiredRoles: ROLE_GROUPS.ALL_CLINICAL,
    status: STATUS.BETA,
    description: 'Goal-oriented care planning and patient milestone tracking',
    keywords: ['goals', 'milestones', 'care plan', 'objectives', 'targets', 'recovery'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 3 — INTERVENTIONS: "What treatments/care plans are we providing?"
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'protocol-studio',
    label: 'Neuromodulation Studio',
    route: '/protocol-studio',
    aliases: ['/protocols', '/protocol-builder', '/neuromodulation'],
    icon: 'zap',
    section: 'INTERVENTIONS',
    requiredRoles: ROLE_GROUPS.CLINICIAN_PLUS,
    status: STATUS.ACTIVE,
    description: 'Design, review, and manage neuromodulation treatment protocols',
    keywords: ['protocol', 'neuromodulation', 'tms', 'tdcs', 'stimulation', 'treatment', 'plan', 'builder'],
    ai: true,
    children: [
      {
        id: 'protocol-builder',
        label: 'Protocol Builder',
        route: '/protocol-studio/builder',
        icon: 'circle-plus',
        section: 'INTERVENTIONS',
        requiredRoles: ROLE_GROUPS.CLINICIAN_PLUS,
        status: STATUS.ACTIVE,
        description: 'Step-by-step protocol creation wizard',
        keywords: ['wizard', 'create', 'new', 'builder'],
      },
      {
        id: 'brainmap-v2',
        label: 'Brain Map Planner',
        route: '/protocol-studio/brain-map',
        icon: 'brain',
        section: 'INTERVENTIONS',
        requiredRoles: ROLE_GROUPS.CLINICIAN_PLUS,
        status: STATUS.ACTIVE,
        description: 'Plan stimulation targets using brain mapping data',
        keywords: ['brain', 'map', 'targeting', 'planning', 'montage'],
      },
      {
        id: 'stimulation-targets',
        label: 'Stimulation Targets',
        route: '/protocol-studio/targets',
        icon: 'target',
        section: 'INTERVENTIONS',
        requiredRoles: ROLE_GROUPS.CLINICIAN_PLUS,
        status: STATUS.ACTIVE,
        description: 'Manage and review stimulation target libraries',
        keywords: ['targets', 'coordinates', 'montage', 'regions', 'focality'],
      },
      {
        id: 'device-planning',
        label: 'Device Planning',
        route: '/protocol-studio/devices',
        icon: 'hard-drive',
        section: 'INTERVENTIONS',
        requiredRoles: ROLE_GROUPS.CLINICIAN_PLUS,
        status: STATUS.BETA,
        description: 'Device selection and configuration planning',
        keywords: ['device', 'coil', 'electrode', 'hardware', 'equipment'],
      },
      {
        id: 'session-planning',
        label: 'Session Planning',
        route: '/protocol-studio/sessions',
        icon: 'calendar',
        section: 'INTERVENTIONS',
        requiredRoles: ROLE_GROUPS.CLINICIAN_PLUS,
        status: STATUS.ACTIVE,
        description: 'Schedule and plan individual treatment sessions',
        keywords: ['sessions', 'scheduling', 'planning', 'dosing', 'parameters'],
      },
      {
        id: 'protocol-deeptwin-sim',
        label: 'DeepTwin Simulation',
        route: '/protocol-studio/deeptwin-sim',
        icon: 'atom',
        section: 'INTERVENTIONS',
        requiredRoles: ROLE_GROUPS.CLINICIAN_PLUS,
        status: STATUS.PREVIEW,
        description: 'AI-powered treatment response simulation',
        keywords: ['simulation', 'prediction', 'forecast', 'ai', 'modeling'],
        ai: true,
      },
    ],
  },
  {
    id: 'medication-studio',
    label: 'Medication Studio',
    route: '/medication-studio',
    aliases: ['/medication', '/meds', '/pharmacy'],
    icon: 'pill',
    section: 'INTERVENTIONS',
    requiredRoles: ROLE_GROUPS.CLINICIAN_PLUS,
    status: STATUS.BETA,
    description: 'Medication management, interactions, and adherence tracking',
    keywords: ['medication', 'drugs', 'pharmacy', 'prescriptions', 'pills', 'meds'],
  },
  {
    id: 'rehab-physio',
    label: 'Rehab / Physiotherapy',
    route: '/rehab',
    aliases: ['/physiotherapy', '/physical-therapy', '/rehabilitation'],
    icon: ' Accessibility',
    section: 'INTERVENTIONS',
    requiredRoles: ROLE_GROUPS.ALL_CLINICAL,
    status: STATUS.ACTIVE,
    description: 'Physical rehabilitation programs and physiotherapy plans',
    keywords: ['rehab', 'physiotherapy', 'physical', 'therapy', 'exercise', 'movement', 'pt'],
  },
  {
    id: 'nutrition-metabolic',
    label: 'Nutrition & Metabolic',
    route: '/nutrition',
    aliases: ['/nutrition-metabolic', '/diet', '/metabolic'],
    icon: 'heart-pulse',
    section: 'INTERVENTIONS',
    requiredRoles: ROLE_GROUPS.ALL_CLINICAL,
    status: STATUS.ACTIVE,
    description: 'Nutritional assessment and metabolic intervention planning',
    keywords: ['nutrition', 'diet', 'metabolic', 'food', 'supplements', 'wellness'],
  },
  {
    id: 'wellness-lifestyle',
    label: 'Wellness & Lifestyle',
    route: '/wellness',
    aliases: ['/lifestyle', '/wellness-hub'],
    icon: 'heart',
    section: 'INTERVENTIONS',
    requiredRoles: ROLE_GROUPS.ALL_CLINICAL,
    status: STATUS.ACTIVE,
    description: 'Holistic wellness, lifestyle interventions, and self-management',
    keywords: ['wellness', 'lifestyle', 'holistic', 'self-care', 'mindfulness', 'stress'],
  },
  {
    id: 'complementary-interventions',
    label: 'Complementary Interventions',
    route: '/complementary',
    aliases: ['/complementary', '/integrative', '/alternative'],
    icon: 'sparkles',
    section: 'INTERVENTIONS',
    requiredRoles: ROLE_GROUPS.CLINICIAN_PLUS,
    status: STATUS.COMING_SOON,
    description: 'Integrative and complementary therapy options',
    keywords: ['complementary', 'integrative', 'alternative', 'holistic', 'cam'],
  },
  {
    id: 'handbooks-v2',
    label: 'Handbooks',
    route: '/handbooks',
    aliases: ['/handbooks-v2', '/clinical-guides', '/reference'],
    icon: 'book-open',
    section: 'INTERVENTIONS',
    requiredRoles: ROLE_GROUPS.ALL_CLINICAL,
    status: STATUS.ACTIVE,
    description: 'Clinical handbooks, reference guides, and protocols',
    keywords: ['handbooks', 'guides', 'reference', 'clinical', 'manuals', 'sop'],
  },
  {
    id: 'home-program',
    label: 'Home Program',
    route: '/home-program',
    aliases: ['/home-program', '/home-tasks', '/remote-program'],
    icon: 'scroll-text',
    section: 'INTERVENTIONS',
    requiredRoles: ROLE_GROUPS.ALL_CLINICAL,
    status: STATUS.ACTIVE,
    description: 'Remote patient home programs, exercises, and task assignments',
    keywords: ['home', 'remote', 'exercises', 'tasks', 'program', 'assignments', 'distance'],
  },
  {
    id: 'outcome-measures',
    label: 'Outcome Measures',
    route: '/outcomes',
    aliases: ['/outcome-measures', '/results', '/measures'],
    icon: 'bar-chart-2',
    section: 'INTERVENTIONS',
    requiredRoles: ROLE_GROUPS.ALL_CLINICAL,
    status: STATUS.ACTIVE,
    description: 'Track patient-reported outcomes and clinical response metrics',
    keywords: ['outcomes', 'results', 'measures', 'response', 'progress', 'tracking', 'proms'],
  },
  {
    id: 'group-therapy',
    label: 'Group Therapy',
    route: '/group-therapy',
    aliases: ['/group-therapy', '/groups', '/cohort-sessions'],
    icon: 'users',
    section: 'INTERVENTIONS',
    requiredRoles: ROLE_GROUPS.CLINICIAN_PLUS,
    status: STATUS.COMING_SOON,
    description: 'Group therapy session planning, scheduling, and cohort management',
    keywords: ['group', 'therapy', 'cohort', 'sessions', 'collective', 'peer'],
  },
  {
    id: 'surgical-planning',
    label: 'Surgical Planning',
    route: '/surgical-planning',
    aliases: ['/surgical-planning', '/surgery', '/operative'],
    icon: 'cone',
    section: 'INTERVENTIONS',
    requiredRoles: ROLE_GROUPS.CLINICIAN_PLUS,
    status: STATUS.COMING_SOON,
    description: 'Pre-operative planning and surgical intervention workflows',
    keywords: ['surgical', 'surgery', 'operative', 'planning', 'pre-op', 'invasive'],
  },
  {
    id: 'research-evidence',
    label: 'Research Evidence',
    route: '/evidence',
    aliases: ['/research-evidence', '/evidence-base', '/literature'],
    icon: 'microscope',
    section: 'INTERVENTIONS',
    requiredRoles: ROLE_GROUPS.RESEARCHER,
    status: STATUS.ACTIVE,
    description: 'Evidence-based research, literature reviews, and clinical trials',
    keywords: ['research', 'evidence', 'literature', 'trials', 'studies', 'papers'],
    ai: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 4 — ANALYZERS: "What intelligence/analysis do we have?"
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Risk & Safety ──
  {
    id: 'risk-analyzer',
    label: 'Risk Analyzer',
    route: '/analyzers/risk',
    aliases: ['/risk-analyzer', '/risk-triage', '/safety'],
    icon: 'shield-alert',
    section: 'ANALYZERS',
    requiredRoles: ROLE_GROUPS.ALL_CLINICAL,
    status: STATUS.ACTIVE,
    description: 'Clinical risk stratification and safety triage',
    keywords: ['risk', 'safety', 'triage', 'stratification', 'screening', 'flags'],
    ai: true,
  },

  // ── Biomarkers & Biometrics ──
  {
    id: 'biomarkers',
    label: 'Biomarkers',
    route: '/analyzers/biomarkers',
    aliases: ['/biomarkers', '/bio-markers'],
    icon: 'dna',
    section: 'ANALYZERS',
    requiredRoles: ROLE_GROUPS.RESEARCHER,
    status: STATUS.ACTIVE,
    description: 'Biomarker analysis and reference ranges',
    keywords: ['biomarkers', 'biological', 'markers', 'lab', 'blood', 'genetic'],
  },
  {
    id: 'wearables',
    label: 'Biometrics Analyzer',
    route: '/analyzers/biometrics',
    aliases: ['/wearables', '/biometrics', '/wearable-data'],
    icon: 'activity',
    section: 'ANALYZERS',
    requiredRoles: ROLE_GROUPS.ALL_CLINICAL,
    status: STATUS.ACTIVE,
    description: 'Wearable device data analysis (HRV, sleep, activity)',
    keywords: ['wearables', 'biometrics', 'hrv', 'sleep', 'activity', 'fitness', 'tracker'],
    ai: true,
  },
  {
    id: 'labs-analyzer',
    label: 'Labs Analyzer',
    route: '/analyzers/labs',
    aliases: ['/labs-analyzer', '/lab-results', '/laboratory'],
    icon: 'flask-conical',
    section: 'ANALYZERS',
    requiredRoles: ROLE_GROUPS.CLINICIAN_PLUS,
    status: STATUS.ACTIVE,
    description: 'Laboratory result analysis and trend visualization',
    keywords: ['labs', 'laboratory', 'bloodwork', 'results', 'panel', 'cbc', 'metabolic'],
    ai: true,
  },
  {
    id: 'nutrition-analyzer',
    label: 'Nutrition Analyzer',
    route: '/analyzers/nutrition',
    aliases: ['/nutrition-analyzer', '/diet-analysis'],
    icon: 'heart-pulse',
    section: 'ANALYZERS',
    requiredRoles: ROLE_GROUPS.ALL_CLINICAL,
    status: STATUS.ACTIVE,
    description: 'Nutritional intake analysis and dietary pattern detection',
    keywords: ['nutrition', 'diet', 'food', 'intake', 'analysis', 'dietary'],
    ai: true,
  },
  {
    id: 'bio-database',
    label: 'Bio Database',
    route: '/analyzers/bio-db',
    aliases: ['/bio-database', '/bio-db', '/biological-data'],
    icon: 'database',
    section: 'ANALYZERS',
    requiredRoles: ROLE_GROUPS.RESEARCHER,
    status: STATUS.BETA,
    description: 'Biological reference database and normative data',
    keywords: ['database', 'reference', 'normative', 'biological', 'catalog'],
    ai: true,
  },

  // ── Treatment & Adherence ──
  {
    id: 'treatment-sessions-analyzer',
    label: 'Intervention Analyzer',
    route: '/analyzers/intervention',
    aliases: ['/treatment-sessions-analyzer', '/sessions-analyzer', '/intervention'],
    icon: 'bar-chart-3',
    section: 'ANALYZERS',
    requiredRoles: ROLE_GROUPS.CLINICIAN_PLUS,
    status: STATUS.ACTIVE,
    description: 'Treatment session analysis and outcome tracking',
    keywords: ['sessions', 'intervention', 'treatment', 'outcomes', 'response', 'analysis'],
    ai: true,
  },

  // ── Multimodal Analyzers ──
  {
    id: 'voice-analyzer',
    label: 'Voice Analyzer',
    route: '/analyzers/voice',
    aliases: ['/voice-analyzer', '/speech', '/audio'],
    icon: 'mic',
    section: 'ANALYZERS',
    requiredRoles: ROLE_GROUPS.ALL_CLINICAL,
    status: STATUS.ACTIVE,
    description: 'Voice biomarker analysis for mood and cognitive assessment',
    keywords: ['voice', 'speech', 'audio', 'acoustic', 'prosody', 'vocal'],
    ai: true,
  },
  {
    id: 'text-analyzer',
    label: 'Text Analyzer',
    route: '/analyzers/text',
    aliases: ['/text-analyzer', '/nlp', '/clinical-text'],
    icon: 'align-left',
    section: 'ANALYZERS',
    requiredRoles: ROLE_GROUPS.ALL_CLINICAL,
    status: STATUS.ACTIVE,
    description: 'Clinical text analysis and NLP processing',
    keywords: ['text', 'nlp', 'language', 'clinical', 'notes', 'documentation'],
    ai: true,
  },
  {
    id: 'video-assessments',
    label: 'Video Assessments',
    route: '/analyzers/video',
    aliases: ['/video-assessments', '/video-analysis'],
    icon: 'scan-eye',
    section: 'ANALYZERS',
    requiredRoles: ROLE_GROUPS.ALL_CLINICAL,
    status: STATUS.ACTIVE,
    description: 'Video-based behavioral and motor assessment analysis',
    keywords: ['video', 'assessment', 'behavioral', 'motor', 'observation', 'camera'],
    ai: true,
  },
  {
    id: 'movement-analyzer',
    label: 'Movement Analyzer',
    route: '/analyzers/movement',
    aliases: ['/movement-analyzer', '/motion', '/gait'],
    icon: 'move',
    section: 'ANALYZERS',
    requiredRoles: ROLE_GROUPS.ALL_CLINICAL,
    status: STATUS.ACTIVE,
    description: 'Movement pattern analysis and motor assessment',
    keywords: ['movement', 'motion', 'gait', 'motor', 'kinematics', 'walk'],
    ai: true,
  },
  {
    id: 'digital-phenotyping-analyzer',
    label: 'Digital Phenotyping',
    route: '/analyzers/phenotyping',
    aliases: ['/digital-phenotyping-analyzer', '/phenotyping', '/digital-behavior'],
    icon: 'smartphone',
    section: 'ANALYZERS',
    requiredRoles: ROLE_GROUPS.RESEARCHER,
    status: STATUS.BETA,
    description: 'Digital behavior pattern analysis from smartphone sensors',
    keywords: ['phenotyping', 'digital', 'behavior', 'smartphone', 'passive', 'sensing'],
    ai: true,
  },
  {
    id: 'behaviour',
    label: 'Behaviour Workspace',
    route: '/analyzers/behaviour',
    aliases: ['/behaviour', '/behavior', '/behavioral-analysis'],
    icon: 'puzzle',
    section: 'ANALYZERS',
    requiredRoles: ROLE_GROUPS.ALL_CLINICAL,
    status: STATUS.ACTIVE,
    description: 'Comprehensive behavioral analysis workspace',
    keywords: ['behavior', 'behaviour', 'analysis', 'workspace', 'patterns', 'actions'],
    ai: true,
  },

  // ── Imaging & Neuro ──
  {
    id: 'mri-analysis',
    label: 'MRI Analyzer',
    route: '/analyzers/mri',
    aliases: ['/mri-analysis', '/mri', '/neuroimaging'],
    icon: 'scan',
    section: 'ANALYZERS',
    requiredRoles: ROLE_GROUPS.CLINICIAN_PLUS,
    status: STATUS.ACTIVE,
    description: 'MRI neuroimaging analysis and structural assessment',
    keywords: ['mri', 'neuroimaging', 'brain', 'structural', 'imaging', 'scan'],
    ai: true,
  },
  {
    id: 'qeeg-launcher',
    label: 'qEEG Analyzer',
    route: '/analyzers/qeeg',
    aliases: ['/qeeg-launcher', '/qeeg', '/eeg', '/quantitative-eeg'],
    icon: 'activity-pulse',
    section: 'ANALYZERS',
    requiredRoles: ROLE_GROUPS.CLINICIAN_PLUS,
    status: STATUS.ACTIVE,
    description: 'Quantitative EEG analysis and brain mapping',
    keywords: ['qeeg', 'eeg', 'brainwaves', 'electroencephalography', 'quantitative'],
    ai: true,
  },
  {
    id: 'medication-analyzer',
    label: 'Genetic Medication Analyzer',
    route: '/analyzers/medication',
    aliases: ['/medication-analyzer', '/pharmacogenomics', '/drug-analysis'],
    icon: 'pill',
    section: 'ANALYZERS',
    requiredRoles: ROLE_GROUPS.CLINICIAN_PLUS,
    status: STATUS.ACTIVE,
    description: 'Medication response analysis and pharmacogenomic insights',
    keywords: ['medication', 'pharmacogenomics', 'drug', 'response', 'genetic', 'pharma'],
    ai: true,
  },
  {
    id: 'phenotype-analyzer',
    label: 'Phenotype Analyzer',
    route: '/analyzers/phenotype',
    aliases: ['/phenotype-analyzer', '/clinical-phenotype'],
    icon: 'git-branch',
    section: 'ANALYZERS',
    requiredRoles: ROLE_GROUPS.RESEARCHER,
    status: STATUS.BETA,
    description: 'Clinical phenotype classification and subtype analysis',
    keywords: ['phenotype', 'subtype', 'classification', 'clustering', 'profile'],
    ai: true,
  },
  {
    id: 'deeptwin-insights',
    label: 'DeepTwin Insights',
    route: '/analyzers/deeptwin-insights',
    aliases: ['/deeptwin-insights', '/twin-analyzer'],
    icon: 'atom',
    section: 'ANALYZERS',
    requiredRoles: ROLE_GROUPS.CLINICIAN_PLUS,
    status: STATUS.PREVIEW,
    description: 'DeepTwin digital twin analysis and patient-specific insights',
    keywords: ['deeptwin', 'digital twin', 'simulation', 'model', 'patient-specific'],
    ai: true,
  },

  // ── Additional Analyzers ──
  {
    id: 'genomic-analyzer',
    label: 'Genomic Analyzer',
    route: '/analyzers/genomic',
    aliases: ['/genomic-analyzer', '/genomics', '/genetics'],
    icon: 'dna',
    section: 'ANALYZERS',
    requiredRoles: ROLE_GROUPS.RESEARCHER,
    status: STATUS.PREVIEW,
    description: 'Genomic variant analysis and polygenic risk scoring',
    keywords: ['genomic', 'genetics', 'dna', 'variants', 'polygenic', 'sequencing'],
    ai: true,
  },
  {
    id: 'fnirs-analyzer',
    label: 'fNIRS Analyzer',
    route: '/analyzers/fnirs',
    aliases: ['/fnirs-analyzer', '/fnirs', '/nirs'],
    icon: 'radar',
    section: 'ANALYZERS',
    requiredRoles: ROLE_GROUPS.RESEARCHER,
    status: STATUS.BETA,
    description: 'Functional near-infrared spectroscopy analysis',
    keywords: ['fnirs', 'nirs', 'spectroscopy', 'hemodynamic', 'cortex', 'oxygenation'],
    ai: true,
  },
  {
    id: 'pet-analyzer',
    label: 'PET Analyzer',
    route: '/analyzers/pet',
    aliases: ['/pet-analyzer', '/pet', '/positron'],
    icon: 'atom',
    section: 'ANALYZERS',
    requiredRoles: ROLE_GROUPS.RESEARCHER,
    status: STATUS.COMING_SOON,
    description: 'PET imaging analysis and metabolic tracer assessment',
    keywords: ['pet', 'positron', 'metabolic', 'tracer', 'neuroimaging', 'glucose'],
    ai: true,
  },
  {
    id: 'neurophysiology-analyzer',
    label: 'Neurophysiology',
    route: '/analyzers/neurophysiology',
    aliases: ['/neurophysiology-analyzer', '/neurophysiology', '/ephys'],
    icon: 'activity-pulse',
    section: 'ANALYZERS',
    requiredRoles: ROLE_GROUPS.CLINICIAN_PLUS,
    status: STATUS.COMING_SOON,
    description: 'Electrophysiology analysis including ERP and evoked potentials',
    keywords: ['neurophysiology', 'ephys', 'erp', 'potentials', 'evoked', 'electrical'],
    ai: true,
  },
  {
    id: 'sleep-analyzer',
    label: 'Sleep Analyzer',
    route: '/analyzers/sleep',
    aliases: ['/sleep-analyzer', '/sleep', '/polysomnography'],
    icon: 'timer',
    section: 'ANALYZERS',
    requiredRoles: ROLE_GROUPS.CLINICIAN_PLUS,
    status: STATUS.BETA,
    description: 'Sleep architecture analysis and polysomnography review',
    keywords: ['sleep', 'polysomnography', 'psg', 'architecture', 'rem', 'stages'],
    ai: true,
  },
  {
    id: 'cognitive-analyzer',
    label: 'Cognitive Analyzer',
    route: '/analyzers/cognitive',
    aliases: ['/cognitive-analyzer', '/cognition', '/neuropsych'],
    icon: 'brain',
    section: 'ANALYZERS',
    requiredRoles: ROLE_GROUPS.ALL_CLINICAL,
    status: STATUS.BETA,
    description: 'Cognitive assessment analysis and neuropsychological profiling',
    keywords: ['cognitive', 'cognition', 'neuropsych', 'memory', 'attention', 'executive'],
    ai: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 5 — INTELLIGENCE: "What multimodal synthesis/evidence/AI support?"
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'deeptwin',
    label: 'DeepTwin',
    route: '/intelligence/deeptwin',
    aliases: ['/deeptwin', '/digital-twin', '/brain-twin'],
    icon: 'atom',
    section: 'INTELLIGENCE',
    requiredRoles: ROLE_GROUPS.CLINICIAN_PLUS,
    status: STATUS.ACTIVE,
    description: 'Patient digital twin for multimodal data synthesis and simulation',
    keywords: ['deeptwin', 'digital twin', 'synthesis', 'simulation', 'multimodal', 'ai'],
    ai: true,
  },
  {
    id: 'evidence-research',
    label: 'Evidence Research',
    route: '/intelligence/evidence',
    aliases: ['/evidence-research', '/evidence-search', '/literature-review'],
    icon: 'microscope',
    section: 'INTELLIGENCE',
    requiredRoles: ROLE_GROUPS.RESEARCHER,
    status: STATUS.ACTIVE,
    description: 'AI-powered evidence search and literature synthesis',
    keywords: ['evidence', 'research', 'literature', 'search', 'synthesis', 'review'],
    ai: true,
  },
  {
    id: 'longitudinal-insights',
    label: 'Longitudinal Insights',
    route: '/intelligence/longitudinal',
    aliases: ['/longitudinal-insights', '/trajectory', '/progress'],
    icon: 'trending-up',
    section: 'INTELLIGENCE',
    requiredRoles: ROLE_GROUPS.CLINICIAN_PLUS,
    status: STATUS.ACTIVE,
    description: 'Long-term patient trajectory analysis and progression tracking',
    keywords: ['longitudinal', 'trajectory', 'progression', 'timeline', 'history', 'trends'],
    ai: true,
  },
  {
    id: 'ai-clinical-intelligence',
    label: 'AI Clinical Intelligence',
    route: '/intelligence/ai-clinical',
    aliases: ['/ai-clinical-intelligence', '/clinical-ai', '/decision-support'],
    icon: 'brain',
    section: 'INTELLIGENCE',
    requiredRoles: ROLE_GROUPS.CLINICIAN_PLUS,
    status: STATUS.BETA,
    description: 'AI-powered clinical decision support and differential analysis',
    keywords: ['ai', 'clinical', 'intelligence', 'decision', 'support', 'differential'],
    ai: true,
  },
  {
    id: 'multimodal-correlations',
    label: 'Multimodal Correlations',
    route: '/intelligence/correlations',
    aliases: ['/multimodal-correlations', '/correlation', '/fusion'],
    icon: 'network',
    section: 'INTELLIGENCE',
    requiredRoles: ROLE_GROUPS.RESEARCHER,
    status: STATUS.PREVIEW,
    description: 'Cross-modality correlation discovery and data fusion',
    keywords: ['multimodal', 'correlation', 'fusion', 'cross-modal', 'integration'],
    ai: true,
  },
  {
    id: 'forecast-simulation',
    label: 'Forecast & Simulation',
    route: '/intelligence/forecast',
    aliases: ['/forecast-simulation', '/prediction', '/simulation'],
    icon: 'radar',
    section: 'INTELLIGENCE',
    requiredRoles: ROLE_GROUPS.CLINICIAN_PLUS,
    status: STATUS.PREVIEW,
    description: 'Predictive forecasting and clinical scenario simulation',
    keywords: ['forecast', 'prediction', 'simulation', 'modeling', 'scenario', 'future'],
    ai: true,
  },
  {
    id: 'knowledge-graph',
    label: 'Knowledge Graph',
    route: '/intelligence/knowledge-graph',
    aliases: ['/knowledge-graph', '/kg', '/ontology-graph'],
    icon: 'network',
    section: 'INTELLIGENCE',
    requiredRoles: ROLE_GROUPS.RESEARCHER,
    status: STATUS.PREVIEW,
    description: 'Clinical knowledge graph exploration and relationship mapping',
    keywords: ['knowledge', 'graph', 'ontology', 'relationships', 'entities', 'connected'],
    ai: true,
  },
  {
    id: 'trial-matcher',
    label: 'Trial Matcher',
    route: '/intelligence/trial-matcher',
    aliases: ['/trial-matcher', '/clinical-trials', '/matching'],
    icon: 'microscope',
    section: 'INTELLIGENCE',
    requiredRoles: ROLE_GROUPS.CLINICIAN_PLUS,
    status: STATUS.PREVIEW,
    description: 'AI-powered clinical trial matching for patients',
    keywords: ['trials', 'clinical', 'matching', 'enrollment', 'eligibility', 'recruitment'],
    ai: true,
  },
  {
    id: 'knowledge-layer',
    label: 'Knowledge Layer',
    route: '/intelligence/knowledge-layer',
    aliases: ['/knowledge-layer', '/knowledge', '/kl'],
    icon: 'database',
    section: 'INTELLIGENCE',
    requiredRoles: ROLE_GROUPS.RESEARCHER,
    status: STATUS.BETA,
    description: ' Governed multimodal neurohealth knowledge layer — 16 database adapters, provenance tracking, confidence scoring',
    keywords: ['knowledge', 'databases', 'adapters', 'provenance', 'confidence', 'rxnorm', 'pharmgkb', 'clinvar', 'faers'],
    ai: true,
  },
  {
    id: 'population-analytics',
    label: 'Population Analytics',
    route: '/intelligence/population',
    aliases: ['/population-analytics', '/population', '/cohort'],
    icon: 'bar-chart-2',
    section: 'INTELLIGENCE',
    requiredRoles: ROLE_GROUPS.ADMIN_ONLY,
    status: STATUS.ACTIVE,
    description: 'Population-level analytics and cohort comparison studies',
    keywords: ['population', 'cohort', 'analytics', 'epidemiology', 'public health'],
    ai: true,
  },
  {
    id: 'research-datasets',
    label: 'Research Datasets',
    route: '/intelligence/datasets',
    aliases: ['/research-datasets', '/datasets', '/data-repository'],
    icon: 'database',
    section: 'INTELLIGENCE',
    requiredRoles: ROLE_GROUPS.SUPER_ONLY,
    status: STATUS.BETA,
    description: 'Curated research datasets and data export tools',
    keywords: ['datasets', 'research', 'data', 'export', 'repository', 'download'],
  },
  {
    id: 'knowledge-explorer',
    label: 'Knowledge Explorer',
    icon: 'search',
    route: '/knowledge-explorer',
    section: 'INTELLIGENCE',
    badge: '66 DBs',
    requiredRoles: ROLE_GROUPS.ALL_CLINICAL,
    status: STATUS.ACTIVE,
    description: 'Multi-database clinical evidence search across 66 connected databases with adapter-based querying',
    keywords: ['database', 'search', 'adapter', 'evidence'],
    ai: true,
  },
  {
    id: 'brain-twin',
    label: 'Brain Twin',
    icon: 'brain',
    route: '/brain-twin',
    section: 'INTELLIGENCE',
    badge: 'AI',
    requiredRoles: ROLE_GROUPS.CLINICIAN_PLUS,
    status: STATUS.ACTIVE,
    description: 'AI-powered brain twin for multimodal synthesis and clinical intelligence',
    keywords: ['ai', 'synthesis', 'intelligence', 'multimodal'],
    ai: true,
  },
  {
    id: 'protocol-builder',
    label: 'Protocol Builder',
    icon: 'zap',
    route: '/protocol-studio/builder',
    section: 'INTELLIGENCE',
    badge: 'NEW',
    requiredRoles: ROLE_GROUPS.CLINICIAN_PLUS,
    status: STATUS.ACTIVE,
    description: 'Visual protocol builder for tDCS, TMS, PBM, and neurofeedback interventions',
    keywords: ['protocol', 'tdcs', 'tms', 'pbm', 'neurofeedback'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 6 — ECOSYSTEM: "What external systems/resources/marketplace?"
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'ai-agent-v2',
    label: 'AI Agents',
    route: '/ecosystem/agents',
    aliases: ['/ai-agent-v2', '/agents', '/ai-assistants'],
    icon: 'bot',
    section: 'ECOSYSTEM',
    requiredRoles: ROLE_GROUPS.ALL_CLINICAL,
    status: STATUS.ACTIVE,
    description: 'AI agents and assistants for clinical workflow automation',
    keywords: ['ai', 'agents', 'assistants', 'automation', 'workflow', 'bot'],
    ai: true,
  },
  {
    id: 'marketplace',
    label: 'Marketplace',
    route: '/ecosystem/marketplace',
    aliases: ['/marketplace', '/store', '/apps'],
    icon: 'shopping-cart',
    section: 'ECOSYSTEM',
    requiredRoles: ROLE_GROUPS.ALL_CLINICAL,
    status: STATUS.ACTIVE,
    description: 'Clinical apps, integrations, and third-party tools',
    keywords: ['marketplace', 'store', 'apps', 'integrations', 'tools', 'plugins'],
  },
  {
    id: 'academy',
    label: 'Academy',
    route: '/ecosystem/academy',
    aliases: ['/academy', '/training', '/courses', '/learning'],
    icon: 'graduation-cap',
    section: 'ECOSYSTEM',
    requiredRoles: ROLE_GROUPS.ALL_CLINICAL,
    status: STATUS.ACTIVE,
    description: 'Training courses, certifications, and clinical education',
    keywords: ['academy', 'training', 'courses', 'learning', 'education', 'certification'],
  },
  {
    id: 'referral-network',
    label: 'Referral Network',
    route: '/ecosystem/referrals',
    aliases: ['/referral-network', '/referrals', '/network'],
    icon: 'network',
    section: 'ECOSYSTEM',
    requiredRoles: ROLE_GROUPS.CLINICIAN_PLUS,
    status: STATUS.BETA,
    description: 'External referral network and specialist consultation hub',
    keywords: ['referral', 'network', 'specialist', 'consultation', 'external', 'partners'],
  },
  {
    id: 'insurance-portal',
    label: 'Insurance Portal',
    route: '/ecosystem/insurance',
    aliases: ['/insurance-portal', '/insurance', '/billing-portal'],
    icon: 'umbrella',
    section: 'ECOSYSTEM',
    requiredRoles: ROLE_GROUPS.RECEPTIONIST,
    status: STATUS.ACTIVE,
    description: 'Insurance verification, prior authorization, and claims portal',
    keywords: ['insurance', 'claims', 'verification', 'authorization', 'coverage', 'billing'],
  },
  {
    id: 'monitor',
    label: 'Monitor',
    route: '/ecosystem/monitor',
    aliases: ['/monitor', '/system-health', '/status'],
    icon: 'activity-pulse',
    section: 'ECOSYSTEM',
    requiredRoles: ROLE_GROUPS.ADMIN_ONLY,
    status: STATUS.ACTIVE,
    description: 'System health monitoring and operational dashboards',
    keywords: ['monitor', 'health', 'status', 'system', 'operations', 'uptime'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 7 — ADMIN: "How is the clinic, governance, data, finance managed?"
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'reports-v2',
    label: 'Reports',
    route: '/admin/reports',
    aliases: ['/reports-v2', '/reporting', '/analytics'],
    icon: 'bar-chart-2',
    section: 'ADMIN',
    requiredRoles: ROLE_GROUPS.ADMIN_ONLY,
    status: STATUS.ACTIVE,
    description: 'Clinical reports, analytics, and population insights',
    keywords: ['reports', 'analytics', 'population', 'insights', 'metrics', 'dashboards'],
  },
  {
    id: 'finance-v2',
    label: 'Finance',
    route: '/admin/finance',
    aliases: ['/finance-v2', '/billing', '/revenue'],
    icon: 'coins',
    section: 'ADMIN',
    requiredRoles: ROLE_GROUPS.ADMIN_ONLY,
    status: STATUS.ACTIVE,
    description: 'Financial management, billing, and revenue tracking',
    keywords: ['finance', 'billing', 'revenue', 'payments', 'invoicing', 'money'],
  },
  {
    id: 'data-console',
    label: 'Data Console',
    route: '/admin/data-console',
    aliases: ['/data-console', '/data', '/tables'],
    icon: 'table-2',
    section: 'ADMIN',
    requiredRoles: ROLE_GROUPS.ADMIN_ONLY,
    status: STATUS.ACTIVE,
    description: 'Data exploration console for clinical datasets',
    keywords: ['data', 'console', 'tables', 'exploration', 'query', 'database'],
  },
  {
    id: 'audit-trail',
    label: 'Audit Trail',
    route: '/admin/audit',
    aliases: ['/audit-trail', '/audit', '/logs'],
    icon: 'clipboard-list',
    section: 'ADMIN',
    requiredRoles: ROLE_GROUPS.SUPER_ONLY,
    status: STATUS.ACTIVE,
    description: 'Comprehensive audit trail of all system activities',
    keywords: ['audit', 'trail', 'logs', 'compliance', 'history', 'activity'],
  },
  {
    id: 'consent-governance',
    label: 'Consent & Governance',
    route: '/admin/consent',
    aliases: ['/consent-governance', '/consent', '/governance', '/irb'],
    icon: 'lock',
    section: 'ADMIN',
    requiredRoles: ROLE_GROUPS.ADMIN_ONLY,
    status: STATUS.ACTIVE,
    description: 'Patient consent management and research governance',
    keywords: ['consent', 'governance', 'compliance', 'irb', 'ethics', 'privacy'],
  },
  {
    id: 'device-management',
    label: 'Device Management',
    route: '/admin/devices',
    aliases: ['/device-management', '/devices', '/equipment'],
    icon: 'cpu',
    section: 'ADMIN',
    requiredRoles: ROLE_GROUPS.ADMIN_ONLY,
    status: STATUS.ACTIVE,
    description: 'Medical device inventory, maintenance, and calibration',
    keywords: ['devices', 'equipment', 'inventory', 'calibration', 'maintenance', 'hardware'],
  },
  {
    id: 'user-clinic-management',
    label: 'User & Clinic Management',
    route: '/admin/users',
    aliases: ['/user-clinic-management', '/users', '/clinic', '/staff'],
    icon: 'users-cog',
    section: 'ADMIN',
    requiredRoles: ROLE_GROUPS.SUPER_ONLY,
    status: STATUS.ACTIVE,
    description: 'User accounts, roles, clinic configuration, and staff management',
    keywords: ['users', 'clinic', 'staff', 'management', 'roles', 'permissions', 'admin'],
  },
  {
    id: 'admin-research-datasets',
    label: 'Research Datasets',
    route: '/admin/research-datasets',
    aliases: ['/admin-research-datasets', '/admin-datasets'],
    icon: 'database',
    section: 'ADMIN',
    requiredRoles: ROLE_GROUPS.SUPER_ONLY,
    status: STATUS.BETA,
    description: 'Research dataset curation, export, and governance',
    keywords: ['datasets', 'research', 'export', 'curation', 'data', 'repository'],
  },
  {
    id: 'tickets',
    label: 'Support Tickets',
    route: '/admin/tickets',
    aliases: ['/tickets', '/support', '/helpdesk'],
    icon: 'ticket',
    section: 'ADMIN',
    requiredRoles: ROLE_GROUPS.ALL_CLINICAL,
    status: STATUS.ACTIVE,
    description: 'Support tickets, helpdesk, and technical issue tracking',
    keywords: ['tickets', 'support', 'helpdesk', 'issues', 'bugs', 'requests'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MISSING PAGES — Added to make all built pages visible
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'brain-twin',
    label: 'Brain Twin',
    route: '/intelligence/brain-twin',
    aliases: ['/brain-twin', '/braintwin'],
    icon: 'brain',
    section: 'INTELLIGENCE',
    requiredRoles: ROLE_GROUPS.CLINICIAN_PLUS,
    status: STATUS.ACTIVE,
    description: 'Brain Twin AI analysis and multimodal patient intelligence',
    keywords: ['brain', 'twin', 'ai', 'multimodal', 'synthesis'],
    ai: true,
  },
  {
    id: 'crm',
    label: 'CRM',
    route: '/admin/crm',
    aliases: ['/crm', '/customer-relations'],
    icon: 'users',
    section: 'ADMIN',
    requiredRoles: ROLE_GROUPS.ADMIN_ONLY,
    status: STATUS.ACTIVE,
    description: 'Customer relationship management and patient outreach',
    keywords: ['crm', 'customers', 'relations', 'outreach', 'engagement'],
  },
  {
    id: 'clinical-tools-v2',
    label: 'Clinical Tools',
    route: '/clinical-tools',
    aliases: ['/clinical-tools', '/tools'],
    icon: 'heart-pulse',
    section: 'ANALYZERS',
    requiredRoles: ROLE_GROUPS.ALL_CLINICAL,
    status: STATUS.ACTIVE,
    description: 'Clinical decision support tools and calculators',
    keywords: ['clinical', 'tools', 'calculators', 'decision', 'support'],
  },
  {
    id: 'clinical-hubs',
    label: 'Clinical Hubs',
    route: '/clinical-hubs',
    aliases: ['/clinical-hubs', '/hubs'],
    icon: 'activity-pulse',
    section: 'INTERVENTIONS',
    requiredRoles: ROLE_GROUPS.ALL_CLINICAL,
    status: STATUS.BETA,
    description: 'Specialty clinical hubs and focused care pathways',
    keywords: ['clinical', 'hubs', 'specialty', 'pathways', 'care'],
  },
  {
    id: 'conditions-library',
    label: 'Conditions',
    route: '/conditions',
    aliases: ['/conditions', '/diagnoses', '/disorders'],
    icon: 'clipboard-list',
    section: 'INTERVENTIONS',
    requiredRoles: ROLE_GROUPS.ALL_CLINICAL,
    status: STATUS.ACTIVE,
    description: 'Clinical conditions library with evidence-based protocols',
    keywords: ['conditions', 'diagnoses', 'disorders', 'library', 'evidence'],
  },
  {
    id: 'consent-forms',
    label: 'Consent Forms',
    route: '/consent',
    aliases: ['/consent', '/forms', '/agreements'],
    icon: 'clipboard-check',
    section: 'ADMIN',
    requiredRoles: ROLE_GROUPS.CLINICIAN_PLUS,
    status: STATUS.ACTIVE,
    description: 'Digital consent forms and patient agreement management',
    keywords: ['consent', 'forms', 'agreements', 'digital', 'signature'],
  },
  {
    id: 'courses-training',
    label: 'Courses',
    route: '/courses',
    aliases: ['/courses', '/training', '/learning'],
    icon: 'book-open',
    section: 'ECOSYSTEM',
    requiredRoles: ROLE_GROUPS.ALL_CLINICAL,
    status: STATUS.ACTIVE,
    description: 'Training courses and clinical education materials',
    keywords: ['courses', 'training', 'learning', 'education', 'certification'],
  },
  {
    id: 'fusion-workbench',
    label: 'Fusion Workbench',
    route: '/fusion-workbench',
    aliases: ['/fusion', '/multimodal-fusion'],
    icon: 'git-branch',
    section: 'INTELLIGENCE',
    requiredRoles: ROLE_GROUPS.CLINICIAN_PLUS,
    status: STATUS.BETA,
    description: 'Multimodal data fusion workbench for combining EEG, MRI, and biomarker data',
    keywords: ['fusion', 'multimodal', 'workbench', 'combine', 'eeg', 'mri'],
    ai: true,
  },
  {
    id: 'handbooks-v2',
    label: 'Handbooks v2',
    route: '/handbooks-v2',
    aliases: ['/handbooks-v2', '/handbooks2'],
    icon: 'book-open',
    section: 'INTERVENTIONS',
    requiredRoles: ROLE_GROUPS.CLINICIAN_PLUS,
    status: STATUS.ACTIVE,
    description: 'Next-generation clinical handbooks with evidence integration',
    keywords: ['handbooks', 'v2', 'evidence', 'protocols', 'guides'],
  },
  {
    id: 'home-therapy',
    label: 'Home Therapy',
    route: '/home-therapy',
    aliases: ['/home-therapy', '/home-programs'],
    icon: 'heart',
    section: 'PATIENTS',
    requiredRoles: ROLE_GROUPS.CLINICIAN_PLUS,
    status: STATUS.ACTIVE,
    description: 'Home therapy programs and remote patient treatment plans',
    keywords: ['home', 'therapy', 'remote', 'programs', 'treatment'],
  },
  {
    id: 'knowledge-base',
    label: 'Knowledge Base',
    route: '/intelligence/knowledge',
    aliases: ['/knowledge-base', '/kb'],
    icon: 'book-open',
    section: 'INTELLIGENCE',
    requiredRoles: ROLE_GROUPS.ALL_CLINICAL,
    status: STATUS.ACTIVE,
    description: 'Clinical knowledge base with searchable evidence and protocols',
    keywords: ['knowledge', 'base', 'evidence', 'protocols', 'search'],
  },
  {
    id: 'knowledge-extras',
    label: 'Knowledge Extras',
    route: '/intelligence/knowledge-extras',
    aliases: ['/knowledge-extras', '/knowledge-plus'],
    icon: 'circle-plus',
    section: 'INTELLIGENCE',
    requiredRoles: ROLE_GROUPS.RESEARCHER,
    status: STATUS.BETA,
    description: 'Extended knowledge tools and research integrations',
    keywords: ['knowledge', 'extras', 'research', 'extended', 'tools'],
  },
  {
    id: 'monitoring-dashboard',
    label: 'Monitoring',
    route: '/monitoring',
    aliases: ['/monitoring', '/patient-monitoring'],
    icon: 'activity',
    section: 'PATIENTS',
    requiredRoles: ROLE_GROUPS.ALL_CLINICAL,
    status: STATUS.ACTIVE,
    description: 'Real-time patient monitoring and physiological tracking',
    keywords: ['monitoring', 'patients', 'real-time', 'physiological', 'tracking'],
  },
  {
    id: 'patient-analytics-v2',
    label: 'Patient Analytics',
    route: '/patient-analytics',
    aliases: ['/patient-analytics', '/analytics'],
    icon: 'bar-chart-2',
    section: 'PATIENTS',
    requiredRoles: ROLE_GROUPS.CLINICIAN_PLUS,
    status: STATUS.ACTIVE,
    description: 'Advanced patient analytics and outcome visualization',
    keywords: ['patient', 'analytics', 'outcomes', 'visualization', 'reports'],
    ai: true,
  },
  {
    id: 'practice-management',
    label: 'Practice',
    route: '/practice',
    aliases: ['/practice', '/clinic-management'],
    icon: 'file-text',
    section: 'ADMIN',
    requiredRoles: ROLE_GROUPS.ADMIN_ONLY,
    status: STATUS.ACTIVE,
    description: 'Practice management and clinic operations dashboard',
    keywords: ['practice', 'management', 'clinic', 'operations', 'admin'],
  },
  {
    id: 'public-pages',
    label: 'Public Pages',
    route: '/public',
    aliases: ['/public', '/external'],
    icon: 'network',
    section: 'ECOSYSTEM',
    requiredRoles: ROLE_GROUPS.SUPER_ONLY,
    status: STATUS.BETA,
    description: 'Public-facing pages and external resources',
    keywords: ['public', 'external', 'pages', 'resources', 'portal'],
  },
  {
    id: 'qeeg-raw',
    label: 'qEEG Raw',
    route: '/analyzers/qeeg-raw',
    aliases: ['/qeeg-raw', '/raw-eeg'],
    icon: 'activity-pulse',
    section: 'ANALYZERS',
    requiredRoles: ROLE_GROUPS.ALL_CLINICAL,
    status: STATUS.ACTIVE,
    description: 'Raw qEEG signal analysis and frequency decomposition',
    keywords: ['qeeg', 'raw', 'eeg', 'signal', 'frequency'],
  },
  {
    id: 'qeeg-raw-workbench',
    label: 'qEEG Raw Workbench',
    route: '/analyzers/qeeg-raw-workbench',
    aliases: ['/qeeg-raw-workbench', '/raw-workbench'],
    icon: 'activity',
    section: 'ANALYZERS',
    requiredRoles: ROLE_GROUPS.ALL_CLINICAL,
    status: STATUS.BETA,
    description: 'Advanced qEEG raw signal workbench with custom analysis pipelines',
    keywords: ['qeeg', 'raw', 'workbench', 'advanced', 'pipelines'],
  },
  {
    id: 'qeeg-viz',
    label: 'qEEG Viz',
    route: '/analyzers/qeeg-viz',
    aliases: ['/qeeg-viz', '/eeg-visualization'],
    icon: 'bar-chart-2',
    section: 'ANALYZERS',
    requiredRoles: ROLE_GROUPS.ALL_CLINICAL,
    status: STATUS.ACTIVE,
    description: 'qEEG data visualization and interactive brain mapping',
    keywords: ['qeeg', 'viz', 'visualization', 'brain', 'mapping'],
  },
  {
    id: 'qeeg-launcher',
    label: 'qEEG Launcher',
    route: '/analyzers/qeeg-launcher',
    aliases: ['/qeeg-launcher', '/eeg-launch'],
    icon: 'video',
    section: 'ANALYZERS',
    requiredRoles: ROLE_GROUPS.ALL_CLINICAL,
    status: STATUS.ACTIVE,
    description: 'Quick-launch qEEG analysis with pre-configured protocols',
    keywords: ['qeeg', 'launcher', 'quick', 'protocols', 'analysis'],
  },
  {
    id: 'qeeg-raw-launcher',
    label: 'qEEG Raw Launcher',
    route: '/analyzers/qeeg-raw-launcher',
    aliases: ['/qeeg-raw-launcher'],
    icon: 'zap',
    section: 'ANALYZERS',
    requiredRoles: ROLE_GROUPS.ALL_CLINICAL,
    status: STATUS.ACTIVE,
    description: 'Quick-launch raw qEEG signal processing',
    keywords: ['qeeg', 'raw', 'launcher', 'quick', 'signal'],
  },
  {
    id: 'registries',
    label: 'Registries',
    route: '/registries',
    aliases: ['/registries', '/patient-registries'],
    icon: 'database',
    section: 'ADMIN',
    requiredRoles: ROLE_GROUPS.ADMIN_ONLY,
    status: STATUS.BETA,
    description: 'Patient registries and cohort management',
    keywords: ['registries', 'patients', 'cohort', 'management', 'tracking'],
  },
  {
    id: 'research-portal',
    label: 'Research',
    route: '/research',
    aliases: ['/research', '/studies'],
    icon: 'microscope',
    section: 'INTELLIGENCE',
    requiredRoles: ROLE_GROUPS.RESEARCHER,
    status: STATUS.BETA,
    description: 'Research portal for clinical studies and trials',
    keywords: ['research', 'studies', 'trials', 'clinical', 'portal'],
  },
  {
    id: 'biomarkers-mri',
    label: 'MRI Biomarkers',
    route: '/analyzers/biomarkers-mri',
    aliases: ['/biomarkers-mri', '/mri-biomarkers'],
    icon: 'scan',
    section: 'ANALYZERS',
    requiredRoles: ROLE_GROUPS.ALL_CLINICAL,
    status: STATUS.BETA,
    description: 'MRI-derived biomarker analysis and quantification',
    keywords: ['biomarkers', 'mri', 'quantification', 'analysis', 'imaging'],
  },
  {
    id: 'webhooks',
    label: 'Webhooks',
    route: '/webhooks',
    aliases: ['/webhooks', '/integrations'],
    icon: 'git-branch',
    section: 'ADMIN',
    requiredRoles: ROLE_GROUPS.SUPER_ONLY,
    status: STATUS.BETA,
    description: 'Webhook management and third-party integrations',
    keywords: ['webhooks', 'integrations', 'api', 'third-party', 'connectors'],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 5. SECTION METADATA
// ─────────────────────────────────────────────────────────────────────────────

/** Display metadata for each section — used by the renderer. */
const SECTION_META = {
  TODAY: {
    label: 'Today',
    order: 1,
    description: 'What requires my attention?',
    defaultCollapsed: false,
    tint: 'var(--nav-section-clinical, #38bdf8)',
  },
  PATIENTS: {
    label: 'Patients',
    order: 2,
    description: 'Who am I managing?',
    defaultCollapsed: false,
    tint: 'var(--nav-section-patients, #818cf8)',
  },
  INTERVENTIONS: {
    label: 'Interventions',
    order: 3,
    description: 'What treatments/care plans are we providing?',
    defaultCollapsed: false,
    tint: 'var(--nav-section-protocol, #fbbf24)',
  },
  ANALYZERS: {
    label: 'Analyzers',
    order: 4,
    description: 'What intelligence/analysis do we have?',
    defaultCollapsed: true,
    tint: 'var(--nav-section-analyzers, #a78bfa)',
  },
  INTELLIGENCE: {
    label: 'Intelligence',
    order: 5,
    description: 'What multimodal synthesis/evidence/AI support?',
    defaultCollapsed: true,
    tint: 'var(--nav-section-intelligence, #2dd4bf)',
  },
  ECOSYSTEM: {
    label: 'Ecosystem',
    order: 6,
    description: 'What external systems/resources/marketplace?',
    defaultCollapsed: false,
    tint: 'var(--nav-section-marketplace, #34d399)',
  },
  ADMIN: {
    label: 'Admin',
    order: 7,
    description: 'How is the clinic, governance, data, finance managed?',
    defaultCollapsed: true,
    tint: 'var(--nav-section-admin, #94a3b8)',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. HELPER FUNCTIONS — Role filtering, grouping, routing, search
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get all navigation items visible to a given role.
 * Super admins and internal admins see everything. Hidden items are excluded.
 *
 * @param {string} role — One of ROLES values
 * @param {NavItem[]} [items] — Optional item array (defaults to NAV_ITEMS)
 * @returns {NavItem[]} Filtered visible items
 */
function getVisibleItems(role, items = NAV_ITEMS) {
  // Flatten: if any parent passes the role filter, include it (with filtered children)
  const result = [];

  for (const item of items) {
    // Super admin / internal sees everything except HIDDEN
    const isSuper = role === ROLES.SUPER_ADMIN || role === ROLES.INTERNAL;

    if (item.status === STATUS.HIDDEN) continue;

    if (!isSuper && !item.requiredRoles.includes(role)) continue;

    // If item has children, filter them too
    if (item.children && item.children.length > 0) {
      const visibleChildren = getVisibleItems(role, item.children);
      result.push({ ...item, children: visibleChildren });
    } else {
      result.push(item);
    }
  }

  return result;
}

/**
 * Group a flat list of items by their section property.
 * Returns an object keyed by section name, with items in section order.
 *
 * @param {NavItem[]} items — Items to group
 * @returns {Object<string, NavItem[]>} Grouped items
 */
function groupBySection(items) {
  const groups = {};

  // Initialize all sections in order
  for (const sectionKey of Object.keys(SECTION_META).sort(
    (a, b) => SECTION_META[a].order - SECTION_META[b].order
  )) {
    groups[sectionKey] = [];
  }

  // Distribute items
  for (const item of items) {
    const section = item.section;
    if (!groups[section]) groups[section] = [];
    groups[section].push(item);
  }

  return groups;
}

/**
 * Find a navigation item by its primary route or any alias.
 * Falls back to parent route matching (e.g., /patients/123 matches /patients).
 *
 * @param {string} route — Route path to look up
 * @param {NavItem[]} [items] — Item array to search (defaults to NAV_ITEMS)
 * @returns {NavItem|null} Matching item or null
 */
function getItemByRoute(route, items = NAV_ITEMS) {
  // Normalize route
  const normalized = route.replace(/\/$/, '') || '/';

  // Flatten items (including children) for search
  const allItems = _flattenItems(items);

  // Direct match on route
  let item = allItems.find(i => i.route === normalized);
  if (item) return item;

  // Alias match
  item = allItems.find(
    i => i.aliases && i.aliases.some(a => a === normalized)
  );
  if (item) return item;

  // Parent route match (e.g., /patients/123 → /patients)
  const parentRoute = normalized.replace(/\/[^/]+$/, '');
  if (parentRoute && parentRoute !== normalized && parentRoute !== '') {
    return getItemByRoute(parentRoute, items);
  }

  // Root fallback
  if (normalized !== '/') {
    item = allItems.find(i => i.route === '/');
    if (item) return item;
  }

  return null;
}

/**
 * Check if a given route should highlight a specific nav item route.
 * Handles exact matches and child-route prefix matching.
 *
 * @param {string} itemRoute — The nav item's route
 * @param {string} currentRoute — The current active route
 * @returns {boolean}
 */
function isRouteActive(itemRoute, currentRoute) {
  const item = itemRoute.replace(/\/$/, '') || '/';
  const current = currentRoute.replace(/\/$/, '') || '/';

  if (item === current) return true;
  if (current.startsWith(item + '/')) return true;

  // Also check aliases
  const allItems = _flattenItems(NAV_ITEMS);
  const navItem = allItems.find(i => i.route === item);
  if (navItem && navItem.aliases) {
    return navItem.aliases.some(
      alias => alias === current || current.startsWith(alias + '/')
    );
  }

  return false;
}

/**
 * Search navigation items by keyword query.
 * Searches labels, keywords, and descriptions. Respects role visibility.
 *
 * @param {string} query — Search query string
 * @param {string} role — Current user role
 * @returns {NavItem[]} Matching visible items
 */
function searchItems(query, role) {
  if (!query || query.trim().length === 0) return [];

  const visible = getVisibleItems(role);
  const lower = query.toLowerCase().trim();

  return visible.filter(item => {
    const inLabel = item.label.toLowerCase().includes(lower);
    const inKeywords =
      item.keywords && item.keywords.some(k => k.toLowerCase().includes(lower));
    const inDescription =
      item.description && item.description.toLowerCase().includes(lower);
    const inRoute = item.route.toLowerCase().includes(lower);

    return inLabel || inKeywords || inDescription || inRoute;
  });
}

/**
 * Flatten a nested item array (including children) into a single-level array.
 * @param {NavItem[]} items
 * @returns {NavItem[]}
 * @private
 */
function _flattenItems(items) {
  const result = [];
  for (const item of items) {
    result.push(item);
    if (item.children) {
      result.push(..._flattenItems(item.children));
    }
  }
  return result;
}

/**
 * Get a human-readable badge label for a status value.
 * @param {string} status — One of STATUS values
 * @returns {string|null} Badge text or null for active items
 */
function getStatusBadge(status) {
  switch (status) {
    case STATUS.BETA: return 'beta';
    case STATUS.PREVIEW: return 'preview';
    case STATUS.COMING_SOON: return 'soon';
    default: return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. SIDEBAR RENDERER — Generates HTML string for the sidebar
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Escape HTML special characters to prevent XSS.
 * @param {string} v — Raw string
 * @returns {string} Escaped string
 */
function _esc(v) {
  if (v == null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Render the sidebar as an HTML string.
 *
 * @param {Object} options
 * @param {string} options.currentRoute — Active route path
 * @param {string} options.currentRole — Current user role
 * @param {boolean} [options.collapsed=false] — Whether sidebar is in collapsed mode
 * @param {Object} [options.sectionState={}] — Collapsed state per section { [sectionId]: boolean }
 * @returns {string} HTML string
 */
function renderSidebar({
  currentRoute,
  currentRole,
  collapsed = false,
  sectionState = {},
}) {
  const visibleItems = getVisibleItems(currentRole);
  const grouped = groupBySection(visibleItems);
  const html = [];

  // Container open
  html.push(
    `<nav class="ds-sidebar${collapsed ? ' ds-sidebar--collapsed' : ''}" ` +
    `aria-label="Main navigation" role="navigation">`
  );

  // Search input (hidden when collapsed)
  if (!collapsed) {
    html.push(`<div class="ds-sidebar__search">`);
    html.push(
      `<svg class="ds-sidebar__search-icon" viewBox="0 0 24 24" ` +
      `fill="none" stroke="currentColor" stroke-width="2" ` +
      `stroke-linecap="round" stroke-linejoin="round">` +
      `<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`
    );
    html.push(
      `<input type="text" class="ds-sidebar__search-input" ` +
      `placeholder="Search modules..." ` +
      `aria-label="Search navigation modules" ` +
      `data-nav-search ` +
      `oninput="window._sidebarHandleSearch?.(this.value)" />`
    );
    html.push(`</div>`);
  } else {
    // Collapsed: icon-only search trigger
    html.push(
      `<div class="ds-sidebar__search ds-sidebar__search--collapsed">` +
      `<svg class="ds-sidebar__search-icon" viewBox="0 0 24 24" ` +
      `fill="none" stroke="currentColor" stroke-width="2" ` +
      `stroke-linecap="round" stroke-linejoin="round">` +
      `<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>` +
      `</div>`
    );
  }

  // Sections
  const sectionKeys = Object.keys(SECTION_META).sort(
    (a, b) => SECTION_META[a].order - SECTION_META[b].order
  );

  for (const sectionKey of sectionKeys) {
    const sectionItems = grouped[sectionKey] || [];
    if (sectionItems.length === 0) continue;

    const meta = SECTION_META[sectionKey];
    const isCollapsed = sectionState[sectionKey] ?? meta.defaultCollapsed;

    html.push(
      `<div class="ds-sidebar__section" data-section="${sectionKey}" ` +
      `style="--section-tint: ${meta.tint}">`
    );

    // Section header
    html.push(
      `<div class="ds-sidebar__section-header" ` +
      `onclick="window._sidebarToggleSection?.('${sectionKey}')" ` +
      `onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window._sidebarToggleSection?.('${sectionKey}')}" ` +
      `role="button" tabindex="0" ` +
      `aria-expanded="${!isCollapsed}" ` +
      `aria-controls="ds-sec-${sectionKey}">`
    );
    if (!collapsed) {
      html.push(`<span class="ds-sidebar__section-label">${_esc(meta.label)}</span>`);
      html.push(
        `<span class="ds-sidebar__section-chevron${isCollapsed ? ' ds-sidebar__section-chevron--collapsed' : ''}" ` +
        `aria-hidden="true">&#8250;</span>`
      );
    }
    html.push(`</div>`); // end header

    // Section items
    if (!isCollapsed || collapsed) {
      html.push(
        `<div class="ds-sidebar__section-items" ` +
        `id="ds-sec-${sectionKey}" ` +
        `${isCollapsed ? 'style="display:none"' : ''}>`
      );

      for (const item of sectionItems) {
        html.push(_renderNavItem(item, currentRoute, collapsed));
      }

      html.push(`</div>`); // end items
    }

    html.push(`</div>`); // end section
  }

  // Footer (settings, help)
  html.push(`<div class="ds-sidebar__footer">`);
  html.push(
    `<div class="ds-sidebar__item" ` +
    `onclick="window._nav?.('settings-v2')" ` +
    `role="menuitem" tabindex="0">` +
    `<span class="ds-sidebar__icon" aria-hidden="true">${ICONS.settings}</span>`
  );
  if (!collapsed) {
    html.push(`<span class="ds-sidebar__label">Settings</span>`);
  }
  html.push(`</div>`);

  html.push(
    `<div class="ds-sidebar__item" ` +
    `onclick="window._nav?.('help')" ` +
    `role="menuitem" tabindex="0">` +
    `<span class="ds-sidebar__icon" aria-hidden="true">${ICONS.eye}</span>`
  );
  if (!collapsed) {
    html.push(`<span class="ds-sidebar__label">Help</span>`);
  }
  html.push(`</div>`);
  html.push(`</div>`); // end footer

  html.push(`</nav>`); // end container

  return html.join('');
}

/**
 * Render a single navigation item (and its children if any).
 *
 * @param {NavItem} item — The nav item
 * @param {string} currentRoute — Current active route
 * @param {boolean} collapsed — Whether sidebar is collapsed
 * @returns {string} HTML string
 * @private
 */
function _renderNavItem(item, currentRoute, collapsed) {
  const html = [];
  const isActive = isRouteActive(item.route, currentRoute);
  const hasChildren = item.children && item.children.length > 0;
  const statusBadge = getStatusBadge(item.status);
  const isComingSoon = item.status === STATUS.COMING_SOON;

  let classes = 'ds-sidebar__item';
  if (isActive) classes += ' ds-sidebar__item--active';
  if (isComingSoon) classes += ' ds-sidebar__item--coming-soon';
  if (item.status === STATUS.BETA) classes += ' ds-sidebar__item--beta';
  if (item.status === STATUS.PREVIEW) classes += ' ds-sidebar__item--preview';

  const onclick = isComingSoon
    ? ''
    : `onclick="window._nav?.('${item.id}')"`;
  const onkeydown = isComingSoon
    ? ''
    : `onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window._nav?.('${item.id}')}"`;
  const role = 'menuitem';
  const ariaCurrent = isActive ? 'page' : 'false';
  const tabindex = isComingSoon ? '-1' : '0';

  html.push(
    `<div class="${classes}" ${onclick} ${onkeydown} ` +
    `role="${role}" tabindex="${tabindex}" ` +
    `aria-current="${ariaCurrent}" ` +
    `data-nav-id="${item.id}" ` +
    `${isComingSoon ? 'aria-disabled="true"' : ''}>`
  );

  // Icon
  const iconSvg = ICONS[item.icon] || ICONS.circleDot;
  html.push(
    `<span class="ds-sidebar__icon" aria-hidden="true">${iconSvg}</span>`
  );

  if (!collapsed) {
    // Label
    html.push(`<span class="ds-sidebar__label">${_esc(item.label)}</span>`);

    // Badges
    if (statusBadge) {
      html.push(
        `<span class="ds-sidebar__badge ds-sidebar__badge--${item.status}">` +
        `${statusBadge}</span>`
      );
    }
    if (item.ai) {
      html.push(`<span class="ds-sidebar__badge ds-sidebar__badge--ai">AI</span>`);
    }
    if (item.badge) {
      const isUrgent = String(item.badge).startsWith('!');
      const badgeText = isUrgent ? String(item.badge).slice(1) : item.badge;
      html.push(
        `<span class="ds-sidebar__badge${isUrgent ? ' ds-sidebar__badge--urgent' : ''}">` +
        `${badgeText}</span>`
      );
    }
  } else {
    // Collapsed mode: tooltips rendered as title attributes
    html.push(`<span class="ds-sidebar__tooltip">${_esc(item.label)}</span>`);
  }

  html.push(`</div>`); // end item

  // Render children if present and not collapsed
  if (hasChildren && !collapsed) {
    html.push(`<div class="ds-sidebar__subitems">`);
    for (const child of item.children) {
      html.push(_renderNavItem(child, currentRoute, collapsed));
    }
    html.push(`</div>`);
  }

  return html.join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. SECTION TOGGLE HANDLER — Persist collapse state in localStorage
// ─────────────────────────────────────────────────────────────────────────────

const SIDEBAR_COLLAPSE_KEY = 'ds_sidebar_collapsed_sections';

/**
 * Get persisted section collapse state from localStorage.
 * @returns {Object<string, boolean>}
 */
function getSectionCollapseState() {
  try {
    const raw = localStorage.getItem(SIDEBAR_COLLAPSE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Toggle a section's collapsed state and persist it.
 * @param {string} sectionKey — Section identifier
 */
function toggleSection(sectionKey) {
  const state = getSectionCollapseState();
  state[sectionKey] = !state[sectionKey];
  try {
    localStorage.setItem(SIDEBAR_COLLAPSE_KEY, JSON.stringify(state));
  } catch {
    // localStorage may be unavailable
  }
  // Emit event for consumers to re-render
  window.dispatchEvent(
    new CustomEvent('sidebar:sectionToggle', {
      detail: { section: sectionKey, collapsed: state[sectionKey] },
    })
  );
}

/**
 * Check if a section is collapsed.
 * @param {string} sectionKey
 * @returns {boolean}
 */
function isSectionCollapsed(sectionKey) {
  const state = getSectionCollapseState();
  const meta = SECTION_META[sectionKey];
  return state[sectionKey] ?? (meta ? meta.defaultCollapsed : false);
}

// Expose handlers on window for inline onclick handlers
if (typeof window !== 'undefined') {
  window._sidebarToggleSection = toggleSection;
  window._sidebarGetCollapseState = getSectionCollapseState;
  window._sidebarIsCollapsed = isSectionCollapsed;
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. SIDEBAR CSS GENERATOR — Optional inline styles for the sidebar
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate CSS string for sidebar styling.
 * These are BEM-style class names matching the render output.
 * @returns {string} CSS text
 */
function generateSidebarStyles() {
  return `
/* ── DeepSynaps Sidebar ── */
.ds-sidebar {
  display: flex;
  flex-direction: column;
  width: 260px;
  height: 100vh;
  background: var(--sidebar-bg, #0b1120);
  border-right: 1px solid var(--border, rgba(255,255,255,0.08));
  overflow-y: auto;
  overflow-x: hidden;
  transition: width 0.2s ease;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.1) transparent;
}
.ds-sidebar::-webkit-scrollbar { width: 4px; }
.ds-sidebar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }

.ds-sidebar--collapsed { width: 60px; }

/* Search */
.ds-sidebar__search {
  position: relative;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border, rgba(255,255,255,0.08));
}
.ds-sidebar__search--collapsed {
  padding: 12px 0;
  display: flex;
  justify-content: center;
  cursor: pointer;
}
.ds-sidebar__search-icon {
  position: absolute;
  left: 22px;
  top: 50%;
  transform: translateY(-50%);
  width: 14px;
  height: 14px;
  stroke: var(--text-tertiary, #64748b);
  pointer-events: none;
}
.ds-sidebar__search--collapsed .ds-sidebar__search-icon {
  position: static;
  transform: none;
}
.ds-sidebar__search-input {
  width: 100%;
  padding: 7px 10px 7px 32px;
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--border, rgba(255,255,255,0.08));
  border-radius: 8px;
  color: var(--text-primary, #e2e8f0);
  font-size: 12.5px;
  outline: none;
  transition: border-color 0.15s;
}
.ds-sidebar__search-input::placeholder { color: var(--text-tertiary, #64748b); }
.ds-sidebar__search-input:focus { border-color: var(--teal, #00d4bc); }

/* Sections */
.ds-sidebar__section { margin-bottom: 4px; }
.ds-sidebar__section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  cursor: pointer;
  user-select: none;
  border-radius: 6px;
  margin: 0 8px;
  transition: background 0.1s;
}
.ds-sidebar__section-header:hover { background: rgba(255,255,255,0.04); }
.ds-sidebar__section-label {
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-tertiary, #64748b);
}
.ds-sidebar__section-chevron {
  font-size: 12px;
  color: var(--text-tertiary, #64748b);
  transform: rotate(90deg);
  transition: transform 0.15s;
}
.ds-sidebar__section-chevron--collapsed { transform: rotate(0deg); }

/* Nav Items */
.ds-sidebar__item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 14px;
  margin: 1px 8px;
  border-radius: 7px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary, #94a3b8);
  transition: all 0.1s;
  position: relative;
  white-space: nowrap;
}
.ds-sidebar__item:hover {
  background: rgba(255,255,255,0.05);
  color: var(--text-primary, #e2e8f0);
}
.ds-sidebar__item--active {
  background: rgba(255,255,255,0.08);
  color: var(--text-primary, #e2e8f0);
  font-weight: 600;
}
.ds-sidebar__item--active::before {
  content: '';
  position: absolute;
  left: -8px;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 18px;
  background: var(--section-tint, var(--teal, #00d4bc));
  border-radius: 0 2px 2px 0;
}
.ds-sidebar__item--coming-soon {
  opacity: 0.45;
  cursor: not-allowed;
}
.ds-sidebar__item--beta,
.ds-sidebar__item--preview {
  opacity: 0.85;
}

/* Icons */
.ds-sidebar__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}
.ds-sidebar__icon svg {
  width: 100%;
  height: 100%;
  stroke: currentColor;
  fill: none;
}

/* Labels */
.ds-sidebar__label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

/* Tooltips (collapsed mode) */
.ds-sidebar__tooltip {
  position: absolute;
  left: calc(100% + 10px);
  top: 50%;
  transform: translateY(-50%);
  background: var(--bg-card, #1e293b);
  border: 1px solid var(--border, rgba(255,255,255,0.12));
  border-radius: 6px;
  padding: 5px 10px;
  font-size: 12px;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s;
  z-index: 1000;
}
.ds-sidebar__item:hover .ds-sidebar__tooltip { opacity: 1; }

/* Badges */
.ds-sidebar__badge {
  font-size: 9.5px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 10px;
  background: rgba(255,255,255,0.1);
  color: var(--text-secondary, #94a3b8);
  flex-shrink: 0;
}
.ds-sidebar__badge--beta {
  background: rgba(251,191,36,0.15);
  color: #fbbf24;
}
.ds-sidebar__badge--preview {
  background: rgba(45,212,191,0.15);
  color: #2dd4bf;
}
.ds-sidebar__badge--comingSoon {
  background: rgba(148,163,184,0.15);
  color: #94a3b8;
}
.ds-sidebar__badge--ai {
  background: rgba(139,92,246,0.15);
  color: #a78bfa;
}
.ds-sidebar__badge--urgent {
  background: rgba(239,68,68,0.2);
  color: #ef4444;
}

/* Sub-items */
.ds-sidebar__subitems {
  padding-left: 18px;
  border-left: 1px solid rgba(255,255,255,0.06);
  margin-left: 22px;
}
.ds-sidebar__subitems .ds-sidebar__item {
  font-size: 12px;
  padding: 5px 10px;
  margin: 1px 0;
}
.ds-sidebar__subitems .ds-sidebar__icon {
  width: 14px;
  height: 14px;
}

/* Footer */
.ds-sidebar__footer {
  margin-top: auto;
  padding: 8px 0 12px;
  border-top: 1px solid var(--border, rgba(255,255,255,0.08));
}

/* Section tint — applied via data attribute */
[data-section="TODAY"] .ds-sidebar__item--active::before { background: var(--nav-section-clinical, #38bdf8); }
[data-section="PATIENTS"] .ds-sidebar__item--active::before { background: var(--nav-section-patients, #818cf8); }
[data-section="INTERVENTIONS"] .ds-sidebar__item--active::before { background: var(--nav-section-protocol, #fbbf24); }
[data-section="ANALYZERS"] .ds-sidebar__item--active::before { background: var(--nav-section-analyzers, #a78bfa); }
[data-section="INTELLIGENCE"] .ds-sidebar__item--active::before { background: var(--nav-section-intelligence, #2dd4bf); }
[data-section="ECOSYSTEM"] .ds-sidebar__item--active::before { background: var(--nav-section-marketplace, #34d399); }
[data-section="ADMIN"] .ds-sidebar__item--active::before { background: var(--nav-section-admin, #94a3b8); }
`.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. SEARCH HIGHLIGHTING — Client-side DOM helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Highlight search matches in the sidebar DOM.
 * Call this after rendering search results.
 *
 * @param {string} query — Search query
 * @param {HTMLElement} container — Sidebar container element
 */
function highlightSearchMatches(query, container) {
  if (!container || !query) return;
  const lower = query.toLowerCase();
  const items = container.querySelectorAll('.ds-sidebar__item');

  items.forEach(el => {
    const label = el.querySelector('.ds-sidebar__label');
    if (!label) return;

    const text = label.textContent || '';
    if (text.toLowerCase().includes(lower)) {
      el.classList.add('ds-sidebar__item--search-match');
      const regex = new RegExp(`(${lower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      label.innerHTML = _esc(text).replace(regex, '<mark>$1</mark>');
    } else {
      el.classList.remove('ds-sidebar__item--search-match');
    }
  });
}

/**
 * Clear search highlights from the sidebar.
 * @param {HTMLElement} container — Sidebar container element
 */
function clearSearchHighlights(container) {
  if (!container) return;
  const items = container.querySelectorAll('.ds-sidebar__item--search-match');
  items.forEach(el => {
    el.classList.remove('ds-sidebar__item--search-match');
    const label = el.querySelector('.ds-sidebar__label');
    if (label) {
      const itemId = el.getAttribute('data-nav-id');
      const navItem = _flattenItems(NAV_ITEMS).find(i => i.id === itemId);
      if (navItem) label.textContent = navItem.label;
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export {
  // Constants
  ROLES,
  ROLE_GROUPS,
  STATUS,
  NAV_ITEMS,
  SECTION_META,
  ICONS,

  // Filtering & lookup
  getVisibleItems,
  groupBySection,
  getItemByRoute,
  isRouteActive,
  searchItems,

  // Rendering
  renderSidebar,
  generateSidebarStyles,

  // Section state
  getSectionCollapseState,
  toggleSection,
  isSectionCollapsed,

  // Search highlighting
  highlightSearchMatches,
  clearSearchHighlights,

  // Utilities
  getStatusBadge,
};

// ─────────────────────────────────────────────────────────────────────────────
// 12. TEST API — Complete surface for unit testing
// ─────────────────────────────────────────────────────────────────────────────

export const __sidebarTestApi__ = {
  // Constants
  ROLES,
  ROLE_GROUPS,
  STATUS,
  NAV_ITEMS,
  SECTION_META,
  ICONS,

  // Core functions
  getVisibleItems,
  groupBySection,
  getItemByRoute,
  isRouteActive,
  searchItems,
  renderSidebar,
  generateSidebarStyles,

  // Section state
  getSectionCollapseState,
  toggleSection,
  isSectionCollapsed,

  // Search
  highlightSearchMatches,
  clearSearchHighlights,

  // Utilities
  getStatusBadge,

  // Internal helpers (exposed for testing)
  _flattenItems,
  _esc,

  // Validation
  validateRegistry() {
    const errors = [];
    const ids = new Set();

    for (const item of NAV_ITEMS) {
      // Check required fields
      if (!item.id) errors.push('Missing id on item');
      if (!item.label) errors.push(`Missing label on item: ${item.id}`);
      if (!item.route) errors.push(`Missing route on item: ${item.id}`);
      if (!item.icon) errors.push(`Missing icon on item: ${item.id}`);
      if (!item.section) errors.push(`Missing section on item: ${item.id}`);
      if (!item.requiredRoles || item.requiredRoles.length === 0) {
        errors.push(`Missing requiredRoles on item: ${item.id}`);
      }
      if (!item.status) errors.push(`Missing status on item: ${item.id}`);
      if (!item.description) errors.push(`Missing description on item: ${item.id}`);
      if (!item.keywords || item.keywords.length === 0) {
        errors.push(`Missing keywords on item: ${item.id}`);
      }

      // Check unique IDs
      if (ids.has(item.id)) errors.push(`Duplicate id: ${item.id}`);
      ids.add(item.id);

      // Check section is valid
      if (!SECTION_META[item.section]) {
        errors.push(`Invalid section "${item.section}" on item: ${item.id}`);
      }

      // Check status is valid
      if (!Object.values(STATUS).includes(item.status)) {
        errors.push(`Invalid status "${item.status}" on item: ${item.id}`);
      }

      // Check icon exists
      if (!ICONS[item.icon]) {
        errors.push(`Missing icon "${item.icon}" for item: ${item.id}`);
      }

      // Validate children
      if (item.children) {
        for (const child of item.children) {
          if (!child.id) errors.push(`Child missing id under: ${item.id}`);
          if (ids.has(child.id)) errors.push(`Duplicate child id: ${child.id}`);
          ids.add(child.id);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      itemCount: NAV_ITEMS.length,
      totalItemCount: _flattenItems(NAV_ITEMS).length,
    };
  },

  // Statistics
  getStats() {
    const allItems = _flattenItems(NAV_ITEMS);
    const bySection = {};
    const byStatus = {};
    const byRole = {};

    for (const item of allItems) {
      bySection[item.section] = (bySection[item.section] || 0) + 1;
      byStatus[item.status] = (byStatus[item.status] || 0) + 1;
      for (const role of item.requiredRoles) {
        byRole[role] = (byRole[role] || 0) + 1;
      }
    }

    return {
      totalItems: NAV_ITEMS.length,
      totalFlattenedItems: allItems.length,
      bySection,
      byStatus,
      byRole,
      sectionCount: Object.keys(SECTION_META).length,
      iconCount: Object.keys(ICONS).length,
    };
  },
};
