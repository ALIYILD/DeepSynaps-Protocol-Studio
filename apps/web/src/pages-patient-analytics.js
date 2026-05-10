// ─────────────────────────────────────────────────────────────────────────────
// pages-patient-analytics.js — Patient Analytics Dashboard (Clinical Portal)
//
// This page displays comprehensive analytics for a single patient:
// - Summary cards: AI analysis count/status, safety flags by severity, consent status
// - Timeline: last 90 days of events (AI runs, uploads, flags) sorted descending
// - Risk dashboard: active flags grouped by severity (critical/high/warning/info)
// - Audit log table: read-only access trail (last 50 events)
//
// All data fetched from GET /api/v1/patients/{patientId}/analytics/* endpoints
// Route: /patients/:patientId/analytics
//
// Features:
// - Loading states and error handling with user-friendly messages
// - Empty state messages for each section
// - Responsive layout with card-based design
// - Security banner: "Data shown is masked and audit-logged. Clinic-scoped access only."
// - No write operations or delete buttons (read-only)
// - Follows existing code patterns from pages-patient.js and pages-clinical.js
// ─────────────────────────────────────────────────────────────────────────────

import { api } from './api.js';
import { cardWrap, spinner, emptyState } from './helpers.js';

// ── Module state ────────────────────────────────────────────────────────────
let _patientId = null;
let _analyticsData = {
  summary: null,
  timeline: null,
  auditLog: null,
  signals: null,
};
let _loading = {
  summary: false,
  timeline: false,
  auditLog: false,
  signals: false,
};
let _errors = {
  summary: null,
  timeline: null,
  auditLog: null,
  signals: null,
};

// ── Format helpers ──────────────────────────────────────────────────────────
function _formatDate(isoString) {
  if (!isoString) return '—';
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch { return isoString; }
}

function _formatDateTime(isoString) {
  if (!isoString) return '—';
  try {
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch { return isoString; }
}

function _relativeTime(isoString) {
  if (!isoString) return '—';
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return _formatDate(isoString);
  } catch { return isoString; }
}

function _statusColor(status) {
  const map = {
    pending: '#fbbf24',      // amber
    processing: '#60a5fa',   // blue
    completed: '#4ade80',    // green
    failed: '#f87171',       // red
    'pending_review': '#fbbf24', // amber
    'active': '#4ade80',     // green
    'withdrawn': '#f87171',  // red
    'expired': '#fbbf24',    // amber
    'allowed': '#4ade80',    // green
    'denied': '#f87171',     // red
  };
  return map[status] || '#94a3b8';
}

function _severityColor(severity) {
  const map = {
    critical: '#dc2626', // red-600
    high: '#f97316',     // orange-500
    warning: '#eab308',  // yellow-400
    info: '#3b82f6',     // blue-500
  };
  return map[severity] || '#94a3b8';
}

function _severityLabel(severity) {
  const map = {
    critical: '🔴 Critical',
    high: '🟠 High',
    warning: '🟡 Warning',
    info: '🔵 Info',
  };
  return map[severity] || severity;
}

// ── Render summary cards ────────────────────────────────────────────────────
function _renderSummaryCards() {
  const summary = _analyticsData.summary;
  if (_loading.summary) {
    return `<div style="padding: 40px; text-align: center;">${spinner()}</div>`;
  }
  if (_errors.summary) {
    return `<div style="padding: 20px; background: rgba(248,113,113,0.1); border-radius: 8px; color: #dc2626; font-size: 14px; border: 1px solid #fecaca;">
      Error loading summary: ${_errors.summary}
    </div>`;
  }
  if (!summary) {
    return emptyState('No summary data available', 'Unable to load analytics summary for this patient.');
  }

  const ai = summary.ai_analysis || {};
  const flags = summary.risk_flags || {};
  const consent = summary.consent || {};

  const cards = [
    {
      title: 'AI Analysis',
      icon: '🤖',
      stats: [
        { label: 'Total', value: ai.total || 0 },
        { label: 'Completed', value: ai.completed || 0 },
        { label: 'Pending Review', value: ai.pending_review || 0 },
        { label: 'Failed', value: ai.failed || 0, color: '#f87171' },
      ],
    },
    {
      title: 'Safety Flags',
      icon: '⚠️',
      stats: [
        { label: 'Active', value: flags.active || 0, color: '#f87171' },
        { label: 'Critical', value: flags.by_severity?.critical?.length || 0, color: '#dc2626' },
        { label: 'High', value: flags.by_severity?.high?.length || 0, color: '#f97316' },
        { label: 'Warning', value: flags.by_severity?.warning?.length || 0, color: '#eab308' },
      ],
    },
    {
      title: 'Consent Status',
      icon: '✓',
      stats: [
        { label: 'Active', value: consent.active || 0, color: '#4ade80' },
        { label: 'Withdrawn', value: consent.withdrawn || 0, color: '#f87171' },
        { label: 'Expired', value: consent.expired || 0, color: '#fbbf24' },
      ],
    },
    {
      title: 'Data Assets',
      icon: '📊',
      stats: [
        { label: 'Total', value: summary.data_assets?.total || 0 },
        ...Object.entries(summary.data_assets?.by_type || {}).map(([type, count]) => ({
          label: type.replace(/_/g, ' '),
          value: count,
        })),
      ],
    },
  ];

  return cards.map(card => `
    <div style="padding: 16px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface-secondary);">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
        <span style="font-size: 20px;">${card.icon}</span>
        <h3 style="margin: 0; font-size: 15px; font-weight: 600;">${card.title}</h3>
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px;">
        ${card.stats.map(stat => `
          <div style="text-align: center;">
            <div style="font-size: 24px; font-weight: 700; color: ${stat.color || 'var(--text-primary)'}; margin-bottom: 4px;">
              ${stat.value}
            </div>
            <div style="font-size: 12px; color: var(--text-secondary);">${stat.label}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

// ── Render timeline section ─────────────────────────────────────────────────
function _renderTimeline() {
  const timeline = _analyticsData.timeline;
  if (_loading.timeline) {
    return `<div style="padding: 40px; text-align: center;">${spinner()}</div>`;
  }
  if (_errors.timeline) {
    return `<div style="padding: 20px; background: rgba(248,113,113,0.1); border-radius: 8px; color: #dc2626; font-size: 14px; border: 1px solid #fecaca;">
      Error loading timeline: ${_errors.timeline}
    </div>`;
  }
  if (!timeline || !timeline.events || timeline.events.length === 0) {
    return emptyState('No events', 'No activity recorded in the last 90 days.');
  }

  const events = timeline.events || [];
  const typeIcons = {
    ai_analysis: '🤖',
    data_upload: '📤',
    safety_flag: '⚠️',
    consent_change: '✓',
  };

  return `<div style="display: flex; flex-direction: column; gap: 12px;">
    ${events.map((event, idx) => {
      const icon = typeIcons[event.type] || '•';
      const statusBg = _statusColor(event.status);
      return `
        <div style="padding: 12px; border-radius: 6px; border: 1px solid var(--border); background: var(--surface-secondary);">
          <div style="display: flex; align-items: flex-start; gap: 12px;">
            <span style="font-size: 18px; flex-shrink: 0;">${icon}</span>
            <div style="flex: 1; min-width: 0;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                <span style="font-weight: 600; font-size: 14px; text-transform: capitalize;">
                  ${(event.type || '').replace(/_/g, ' ')}
                </span>
                ${event.status ? `<span style="font-size: 11px; padding: 2px 6px; border-radius: 3px; background: ${statusBg}20; color: ${statusBg}; font-weight: 500; text-transform: capitalize;">${event.status}</span>` : ''}
              </div>
              ${event.details?.message ? `<div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 4px;">${event.details.message}</div>` : ''}
              <div style="font-size: 12px; color: var(--text-tertiary);">
                ${_formatDateTime(event.timestamp)}
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('')}
  </div>`;
}

// ── Render risk dashboard ───────────────────────────────────────────────────
function _renderRiskDashboard() {
  const summary = _analyticsData.summary;
  if (_loading.summary) {
    return `<div style="padding: 40px; text-align: center;">${spinner()}</div>`;
  }
  if (_errors.summary) {
    return `<div style="padding: 20px; background: rgba(248,113,113,0.1); border-radius: 8px; color: #dc2626; font-size: 14px; border: 1px solid #fecaca;">
      Error loading risk data: ${_errors.summary}
    </div>`;
  }

  const flags = summary?.risk_flags || {};
  const severities = ['critical', 'high', 'warning', 'info'];
  const hasSomeFlags = severities.some(sev => (flags.by_severity?.[sev]?.length || 0) > 0);

  if (!hasSomeFlags) {
    return emptyState('No active flags', 'No safety flags recorded for this patient.');
  }

  return severities.map(severity => {
    const flagList = flags.by_severity?.[severity] || [];
    if (flagList.length === 0) return '';

    return `
      <div style="margin-bottom: 16px;">
        <div style="padding: 12px; border-radius: 6px; border-left: 4px solid ${_severityColor(severity)}; background: ${_severityColor(severity)}15; margin-bottom: 8px;">
          <span style="font-weight: 600; color: ${_severityColor(severity)};">
            ${_severityLabel(severity)} (${flagList.length})
          </span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${flagList.map(flag => `
            <div style="padding: 10px; border-radius: 4px; border: 1px solid var(--border); background: var(--surface-secondary);">
              <div style="font-weight: 500; font-size: 13px; margin-bottom: 2px;">${flag.flag_type}</div>
              <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">${flag.message}</div>
              <div style="font-size: 11px; color: var(--text-tertiary);">
                Created: ${_formatDateTime(flag.created_at)}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).filter(Boolean).join('');
}

// ── Render audit log table ──────────────────────────────────────────────────
function _renderAuditLog() {
  const auditLog = _analyticsData.auditLog;
  if (_loading.auditLog) {
    return `<div style="padding: 40px; text-align: center;">${spinner()}</div>`;
  }
  if (_errors.auditLog) {
    return `<div style="padding: 20px; background: rgba(248,113,113,0.1); border-radius: 8px; color: #dc2626; font-size: 14px; border: 1px solid #fecaca;">
      Error loading audit log: ${_errors.auditLog}
    </div>`;
  }
  if (!auditLog || !auditLog.events || auditLog.events.length === 0) {
    return emptyState('No audit events', 'No PHI access audit trail available.');
  }

  const events = auditLog.events || [];

  return `
    <div style="overflow-x: auto;">
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <thead>
          <tr style="border-bottom: 2px solid var(--border); background: var(--surface-secondary);">
            <th style="padding: 12px; text-align: left; font-weight: 600; color: var(--text-secondary);">User</th>
            <th style="padding: 12px; text-align: left; font-weight: 600; color: var(--text-secondary);">Action</th>
            <th style="padding: 12px; text-align: left; font-weight: 600; color: var(--text-secondary);">Resource</th>
            <th style="padding: 12px; text-align: left; font-weight: 600; color: var(--text-secondary);">Result</th>
            <th style="padding: 12px; text-align: left; font-weight: 600; color: var(--text-secondary);">Timestamp</th>
          </tr>
        </thead>
        <tbody>
          ${events.map((event, idx) => {
            const resultColor = _statusColor(event.result);
            return `
              <tr style="border-bottom: 1px solid var(--border); ${idx % 2 === 0 ? 'background: var(--surface-secondary)' : ''}">
                <td style="padding: 10px; font-family: var(--font-mono); font-size: 12px;">${event.actor_id || '—'}</td>
                <td style="padding: 10px; text-transform: capitalize;">${(event.action || '').replace(/_/g, ' ')}</td>
                <td style="padding: 10px; text-transform: capitalize;">${(event.resource_type || '').replace(/_/g, ' ')}</td>
                <td style="padding: 10px;">
                  <span style="padding: 2px 6px; border-radius: 3px; background: ${resultColor}20; color: ${resultColor}; font-weight: 500; font-size: 11px; text-transform: capitalize;">
                    ${event.result}
                  </span>
                </td>
                <td style="padding: 10px; color: var(--text-secondary); white-space: nowrap;">
                  ${_relativeTime(event.timestamp)}
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ── Fetch analytics data ────────────────────────────────────────────────────
async function _fetchAnalytics() {
  if (!_patientId) return;

  // Fetch summary
  _loading.summary = true;
  try {
    _analyticsData.summary = await api.getPatientAnalyticsSummary(_patientId);
    _errors.summary = null;
  } catch (err) {
    _errors.summary = err.message || 'Failed to load summary';
  }
  _loading.summary = false;

  // Fetch timeline
  _loading.timeline = true;
  try {
    _analyticsData.timeline = await api.getPatientAnalyticsTimeline(_patientId, { days: 90, limit: 100 });
    _errors.timeline = null;
  } catch (err) {
    _errors.timeline = err.message || 'Failed to load timeline';
  }
  _loading.timeline = false;

  // Fetch audit log
  _loading.auditLog = true;
  try {
    _analyticsData.auditLog = await api.getPatientAnalyticsAuditLog(_patientId, { days: 30, limit: 50 });
    _errors.auditLog = null;
  } catch (err) {
    _errors.auditLog = err.message || 'Failed to load audit log';
  }
  _loading.auditLog = false;

  _render();
}

// ── Main render function ────────────────────────────────────────────────────
function _render() {
  const content = document.getElementById('content');
  if (!content) return;

  content.innerHTML = `
    <div style="max-width: 1200px; margin: 0 auto; padding: 20px; background: var(--surface-primary); min-height: 100vh;">
      <!-- Security banner -->
      <div style="margin-bottom: 24px; padding: 12px 16px; border-radius: 8px; border-left: 4px solid #3b82f6; background: rgba(59, 130, 246, 0.1); color: #1e40af; font-size: 13px; line-height: 1.5;">
        <strong>📋 Compliance Notice:</strong> Data shown is masked and audit-logged. Clinic-scoped access only. All access is tracked and logged for compliance purposes.
      </div>

      <!-- Summary cards -->
      <h2 style="font-size: 18px; font-weight: 700; margin-bottom: 16px;">Overview</h2>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-bottom: 32px;">
        ${_renderSummaryCards()}
      </div>

      <!-- Timeline section -->
      <h2 style="font-size: 18px; font-weight: 700; margin-bottom: 16px;">Activity Timeline (Last 90 Days)</h2>
      <div style="margin-bottom: 32px; padding: 16px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface-secondary);">
        ${_renderTimeline()}
      </div>

      <!-- Risk dashboard -->
      <h2 style="font-size: 18px; font-weight: 700; margin-bottom: 16px;">Active Risk Flags</h2>
      <div style="margin-bottom: 32px; padding: 16px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface-secondary);">
        ${_renderRiskDashboard()}
      </div>

      <!-- Audit log -->
      <h2 style="font-size: 18px; font-weight: 700; margin-bottom: 16px;">PHI Access Audit Trail (Last 30 Days)</h2>
      <div style="margin-bottom: 32px; padding: 16px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface-secondary);">
        ${_renderAuditLog()}
      </div>
    </div>
  `;
}

// ── Main page function (analytics view) ────────────────────────────────────
export async function pgPatientAnalytics(patientId) {
  _patientId = patientId;

  // Render initial state
  _render();

  // Fetch all analytics data
  await _fetchAnalytics();
}

// ── Alternative page function (evidence-based analytics detail) ────────────
// Used by test suite and alternative routing patterns
export async function pgPatientAnalyticsDetail(updateTopbar, patientId) {
  _patientId = patientId;

  // Call updateTopbar if provided
  if (typeof updateTopbar === 'function') {
    updateTopbar('Patient Analytics Detail', []);
  }

  // Render initial state
  _render();

  // Fetch all analytics data
  await _fetchAnalytics();
}

// Export for testing
export { _analyticsData, _errors, _loading, _patientId };
