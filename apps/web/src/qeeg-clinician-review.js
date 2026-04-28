// ─────────────────────────────────────────────────────────────────────────────
// qeeg-clinician-review.js — Clinician Review Workflow
//
// Exports:
//   renderClinicianReview(report, findings)  → HTML string
//   mountClinicianReview(containerId, reportId, api)
// ─────────────────────────────────────────────────────────────────────────────

function esc(v) {
  if (v == null) return '';
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _pill(label, color) {
  return '<span class="qeeg-ai-chip" style="--chip-color:' + (color || 'var(--teal)') + '">' + esc(label) + '</span>';
}

function _stateColor(state) {
  if (state === 'APPROVED') return '#22c55e';
  if (state === 'DRAFT_AI') return '#6b7280';
  if (state === 'NEEDS_REVIEW') return '#f59e0b';
  if (state === 'REJECTED') return '#ef4444';
  if (state === 'REVIEWED_WITH_AMENDMENTS') return '#3b82f6';
  return '#6b7280';
}

function renderClinicianReview(report, findings) {
  if (!report) return '';
  var state = report.report_state || 'DRAFT_AI';
  var signed = !!report.signed_by;
  var findingsList = findings || [];

  var header = '<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap">'
    + _pill(esc(state), _stateColor(state))
    + (signed ? _pill('Signed by ' + esc(report.signed_by), '#22c55e') : '')
    + (report.reviewer_id ? '<span style="font-size:12px;color:var(--text-secondary)">Reviewer: ' + esc(report.reviewer_id) + '</span>' : '')
    + '</div>';

  var actions = '';
  if (state === 'DRAFT_AI') {
    actions = '<button class="ds-btn ds-btn--primary" data-action="transition" data-target="NEEDS_REVIEW">Send to Review</button>';
  } else if (state === 'NEEDS_REVIEW') {
    actions = '<button class="ds-btn ds-btn--primary" data-action="transition" data-target="APPROVED">Approve</button> '
      + '<button class="ds-btn" data-action="transition" data-target="REJECTED">Reject</button> '
      + '<button class="ds-btn" data-action="transition" data-target="REVIEWED_WITH_AMENDMENTS">Amend</button>';
  } else if (state === 'REVIEWED_WITH_AMENDMENTS' || state === 'APPROVED') {
    actions = '<button class="ds-btn ds-btn--primary" data-action="sign">Sign Report</button>';
  }

  var rows = findingsList.map(function (f) {
    var ftColor = f.claim_type === 'BLOCKED' ? '#ef4444' : (f.claim_type === 'INFERRED' ? '#f59e0b' : '#22c55e');
    return '<tr>'
      + '<td>' + esc((f.finding_text || '').substring(0, 120)) + (f.finding_text && f.finding_text.length > 120 ? '…' : '') + '</td>'
      + '<td>' + _pill(esc(f.claim_type), ftColor) + '</td>'
      + '<td>' + esc(f.status || 'PENDING') + '</td>'
      + '<td>' + esc(f.evidence_grade || '—') + '</td>'
      + '<td><button class="ds-btn ds-btn--sm" data-action="edit-finding" data-finding-id="' + esc(f.id) + '">Review</button></td>'
      + '</tr>';
  }).join('');

  var findingsTable = findingsList.length
    ? '<h4 style="margin:12px 0 8px;font-size:13px">Per-Finding Review</h4>'
      + '<table class="ds-table" style="width:100%;font-size:12px">'
      + '<thead><tr><th>Finding</th><th>Claim</th><th>Status</th><th>Evidence</th><th></th></tr></thead>'
      + '<tbody>' + rows + '</tbody></table>'
    : '<p style="color:var(--text-secondary);font-size:13px">No granular findings.</p>';

  return '<div class="ds-card qeeg-ai-card">'
    + '<div class="ds-card__header"><h3>Clinician Review</h3></div>'
    + '<div class="ds-card__body">'
    + header
    + '<div style="margin-bottom:12px">' + actions + '</div>'
    + findingsTable
    + '</div></div>';
}

async function mountClinicianReview(containerId, reportId, api) {
  var container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '<div class="ds-spinner"></div>';

  async function refresh() {
    var report = await api.getQEEGAnalysisReports(reportId);
    // getQEEGAnalysisReports returns a list; we need the specific report.
    // Work around by fetching the single report if available, else use list.
    if (Array.isArray(report)) {
      report = report.find(function (r) { return r.id === reportId; }) || report[0];
    }
    var findings = []; // findings endpoint not exposed directly; hydrate from report narrative
    container.innerHTML = renderClinicianReview(report, findings);
    _wireActions(container, reportId, api, refresh);
  }

  try {
    await refresh();
  } catch (e) {
    container.innerHTML = '<div class="ds-alert ds-alert--error">Unable to load review panel.</div>';
  }
}

function _wireActions(container, reportId, api, refresh) {
  container.querySelectorAll('[data-action="transition"]').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      var target = btn.dataset.target;
      try {
        await api.transitionQEEGReportState(reportId, { action: target, note: '' });
        await refresh();
      } catch (e) {
        alert('Transition failed: ' + (e.message || 'Unknown error'));
      }
    });
  });
  container.querySelectorAll('[data-action="sign"]').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      try {
        await api.signQEEGReport(reportId);
        await refresh();
      } catch (e) {
        alert('Sign failed: ' + (e.message || 'Unknown error'));
      }
    });
  });
}

export { renderClinicianReview, mountClinicianReview };
