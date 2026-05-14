/**
 * SIDEBAR CONFIGURATION
 * DeepSynaps Clinician OS - Route Groupings
 * 
 * This file defines the sidebar structure with 6 main groups:
 * TODAY, PATIENTS, INTERVENTIONS, ANALYZERS, ECOSYSTEM, ADMIN
 */

export const SIDEBAR_GROUPS = [
  {
    id: 'today',
    label: 'Today',
    icon: '🏠',
    roles: ['clinician', 'admin', 'supervisor'],
    routes: [
      { id: 'dashboard', label: 'Dashboard', icon: '📊' },
      { id: 'inbox', label: 'Inbox', icon: '📬' },
      { id: 'clinician-digest', label: 'Daily Digest', icon: '📋' },
      { id: 'scheduling-hub', label: 'Schedule', icon: '📅' },
    ]
  },

  {
    id: 'patients',
    label: 'Patients',
    icon: '👥',
    roles: ['clinician', 'admin', 'supervisor'],
    routes: [
      { id: 'patients-hub', label: 'Patients Hub', icon: '👥' },
      { id: 'patient-profile', label: 'Patient Profile', icon: '👤' },
      { id: 'assessments-hub', label: 'Assessments', icon: '✓' },
      { id: 'documents', label: 'Documents', icon: '📄' },
      { id: 'virtual-care', label: 'Virtual Care', icon: '💻' },
      { id: 'patient-timeline', label: 'Timeline', icon: '📈' },
    ]
  },

  {
    id: 'interventions',
    label: 'Interventions',
    icon: '⚙️',
    roles: ['clinician', 'admin', 'supervisor'],
    nested: [
      {
        id: 'neuromodulation-studio',
        label: 'Neuromodulation Studio',
        icon: '🧠',
        routes: [
          { id: 'protocol-builder', label: 'Protocol Builder', icon: '🔧' },
          { id: 'brain-map-planner', label: 'Brain Map Planner', icon: '🧬' },
          { id: 'session-planning', label: 'Session Planning', icon: '📋' },
          { id: 'device-management', label: 'Device Management', icon: '⚡' },
        ]
      },
      {
        id: 'medication-studio',
        label: 'Medication Studio',
        icon: '💊',
        routes: [
          { id: 'medication-protocols', label: 'Protocols', icon: '📋' },
          { id: 'drug-interactions', label: 'Interactions', icon: '⚠️' },
          { id: 'dosing-calculator', label: 'Dosing', icon: '📊' },
        ]
      },
      {
        id: 'rehab-physio',
        label: 'Rehab & Physiotherapy',
        icon: '🏃',
        routes: [
          { id: 'rehab-programs', label: 'Programs', icon: '📋' },
          { id: 'exercise-library', label: 'Exercises', icon: '💪' },
          { id: 'progress-tracking', label: 'Progress', icon: '📈' },
        ]
      },
      {
        id: 'handbooks',
        label: 'Handbooks',
        icon: '📚',
        routes: [
          { id: 'clinical-handbooks', label: 'Clinical', icon: '📖' },
          { id: 'patient-handbooks', label: 'Patient Education', icon: '📕' },
          { id: 'caregiver-guides', label: 'Caregiver Guides', icon: '👨‍⚕️' },
        ]
      },
    ]
  },

  {
    id: 'analyzers',
    label: 'Analyzers',
    icon: '📊',
    roles: ['clinician', 'admin', 'supervisor'],
    nested: [
      {
        id: 'risk-biomarkers',
        label: 'Risk & Biomarkers',
        icon: '⚠️',
        routes: [
          { id: 'risk-triage', label: 'Risk Triage', icon: '🚨' },
          { id: 'biomarkers', label: 'Biomarkers', icon: '🔬' },
          { id: 'labs-analyzer', label: 'Labs Analyzer', icon: '🧪' },
        ]
      },
      {
        id: 'neuroimaging',
        label: 'Neuroimaging',
        icon: '🧠',
        routes: [
          { id: 'qeeg-analyzer', label: 'qEEG Analyzer', icon: '📡' },
          { id: 'mri-analyzer', label: 'MRI Analyzer', icon: '🖼️' },
          { id: 'brain-maps', label: 'Brain Maps', icon: '🧬' },
        ]
      },
      {
        id: 'behavioral-phenotype',
        label: 'Behavioral',
        icon: '🎯',
        routes: [
          { id: 'digital-phenotyping', label: 'Digital Phenotyping', icon: '📱' },
          { id: 'biometrics', label: 'Biometrics', icon: '❤️' },
          { id: 'movement-analyzer', label: 'Movement', icon: '🚶' },
        ]
      },
      {
        id: 'multimodal',
        label: 'Multimodal',
        icon: '🔗',
        routes: [
          { id: 'voice-analyzer', label: 'Voice Analyzer', icon: '🎤' },
          { id: 'text-analyzer', label: 'Text Analyzer', icon: '📝' },
          { id: 'video-assessments', label: 'Video Assessments', icon: '📹' },
          { id: 'sessions-analyzer', label: 'Sessions', icon: '📊' },
          { id: 'deeptwin', label: 'DeepTwin', icon: '🤖' },
        ]
      },
      {
        id: 'nutrition',
        label: 'Nutrition',
        icon: '🥗',
        routes: [
          { id: 'nutrition-analyzer', label: 'Nutrition Analyzer', icon: '🍎' },
          { id: 'supplement-tracker', label: 'Supplements', icon: '💊' },
        ]
      },
    ]
  },

  {
    id: 'ecosystem',
    label: 'Ecosystem',
    icon: '🌍',
    roles: ['clinician', 'admin', 'supervisor'],
    routes: [
      { id: 'ai-agents', label: 'AI Agents', icon: '🤖' },
      { id: 'marketplace', label: 'Marketplace', icon: '🛒' },
      { id: 'academy', label: 'Academy', icon: '🎓' },
      { id: 'research-portal', label: 'Research', icon: '🔬' },
      { id: 'monitor', label: 'Monitor', icon: '📡' },
    ]
  },

  {
    id: 'admin',
    label: 'Admin',
    icon: '⚙️',
    roles: ['admin', 'supervisor'],
    nested: [
      {
        id: 'reports-compliance',
        label: 'Reports & Compliance',
        icon: '📋',
        routes: [
          { id: 'population-reports', label: 'Population Reports', icon: '📊' },
          { id: 'audit-trail', label: 'Audit Trail', icon: '🔍' },
          { id: 'compliance-dashboard', label: 'Compliance', icon: '✓' },
        ]
      },
      {
        id: 'organization',
        label: 'Organization',
        icon: '🏢',
        routes: [
          { id: 'clinic-settings', label: 'Clinic Settings', icon: '⚙️' },
          { id: 'user-management', label: 'Users', icon: '👤' },
          { id: 'team-management', label: 'Teams', icon: '👥' },
          { id: 'roles-permissions', label: 'Roles & Permissions', icon: '🔐' },
        ]
      },
      {
        id: 'finance-operations',
        label: 'Finance & Operations',
        icon: '💰',
        routes: [
          { id: 'billing', label: 'Billing', icon: '💳' },
          { id: 'insurance', label: 'Insurance', icon: '📋' },
          { id: 'scheduling-admin', label: 'Scheduling', icon: '📅' },
        ]
      },
      {
        id: 'data-governance',
        label: 'Data & Governance',
        icon: '🔐',
        routes: [
          { id: 'data-governance', label: 'Data Governance', icon: '📊' },
          { id: 'consent-management', label: 'Consent', icon: '✓' },
          { id: 'privacy-controls', label: 'Privacy', icon: '🔒' },
        ]
      },
    ]
  },
];

/**
 * ROUTE_TO_GROUP MAPPING
 * Maps route IDs to their group ID for active highlighting
 */
export const ROUTE_TO_GROUP = {};

// Build reverse mapping for fast lookup
function buildRouteToGroupMap() {
  const map = {};

  const addRoute = (groupId, routeId) => {
    map[routeId] = groupId;
  };

  SIDEBAR_GROUPS.forEach(group => {
    // Direct routes
    if (group.routes) {
      group.routes.forEach(route => {
        addRoute(group.id, route.id);
      });
    }
    // Nested routes
    if (group.nested) {
      group.nested.forEach(nestedGroup => {
        if (nestedGroup.routes) {
          nestedGroup.routes.forEach(route => {
            addRoute(group.id, route.id);
            addRoute(nestedGroup.id, route.id); // Also map to nested group
          });
        }
      });
    }
  });

  return map;
}

Object.assign(ROUTE_TO_GROUP, buildRouteToGroupMap());

/**
 * BADGE CONFIGURATION
 * Maps route IDs to badge data (type, count, etc.)
 * Used to display alerts, unread counts, etc.
 */
export const SIDEBAR_BADGES = {
  // Example badges - to be populated at runtime from API
  // 'inbox': { type: 'alert', count: 3 },
  // 'risk-triage': { type: 'warning', count: 5 },
  // 'assessments-hub': { type: 'info', count: 12 },
};

/**
 * Helper function to get current badges
 * Can be called periodically or on demand to update badge state
 */
export function getCurrentBadges() {
  return SIDEBAR_BADGES;
}

/**
 * Helper function to set a badge
 */
export function setBadge(routeId, type, count) {
  SIDEBAR_BADGES[routeId] = { type, count };
}

/**
 * Helper function to clear a badge
 */
export function clearBadge(routeId) {
  delete SIDEBAR_BADGES[routeId];
}

export default {
  SIDEBAR_GROUPS,
  ROUTE_TO_GROUP,
  SIDEBAR_BADGES,
  getCurrentBadges,
  setBadge,
  clearBadge,
};
