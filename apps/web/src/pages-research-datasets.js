// ─────────────────────────────────────────────────────────────────────────────
// pages-research-datasets.js — Research dataset spec stub (Slice C)
//
// Admin-only page. The backend is hard-gated behind RESEARCH_EXPORT_ENABLED
// (default OFF), so for every operator who lands here in this PR, the list
// is empty and the disclaimer is the load-bearing content. Non-admin roles
// are bounced back to /home.
// ─────────────────────────────────────────────────────────────────────────────

import { api } from './api.js';
import { currentUser } from './auth.js';

function esc(v) {
  if (v == null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

export async function pgResearchDatasets(setTopbar, navigate) {
  // Hard guard: only admins. Non-admin URLs get bounced to /home; the
  // sidebar is already hidden for them via ROLE_NAV_HIDE, but a direct
  // ?page=research-datasets navigation needs to be caught here too.
  if (currentUser?.role !== 'admin') {
    if (typeof navigate === 'function') navigate('home');
    return;
  }

  setTopbar('Research Datasets', '');
  const el = document.getElementById('content');
  if (!el) return;

  // Initial render: spinner card while we (no-op) fetch the list.
  el.innerHTML = `
    <div style="padding:20px;max-width:1200px;margin:0 auto">
      <div class="ch-card" role="region" aria-label="Research export disabled notice"
           style="border-left:3px solid var(--amber);background:rgba(245,158,11,0.08);padding:16px 20px;margin-bottom:24px">
        <div style="font-size:14px;font-weight:600;color:var(--amber);margin-bottom:6px">
          Research export is disabled pending legal + IRB sign-off.
        </div>
        <div style="font-size:13px;line-height:1.55;color:var(--text-secondary)">
          Set <code>RESEARCH_EXPORT_ENABLED=true</code> on the API to enable.
          Anonymization, k-anonymity checks, and dataset specs are scaffolded
          but every endpoint returns 403 until the flag is flipped. The
          downstream Celery build job is intentionally not implemented in
          this PR — it ships in a follow-up once compliance clears.
        </div>
      </div>

      <h3 style="font-size:15px;font-weight:600;color:var(--text-primary);margin-bottom:12px">
        Dataset specifications
      </h3>
      <div id="rd-list-container" class="ch-card" style="overflow:auto;padding:0">
        <table style="width:100%;border-collapse:collapse">
          <thead style="background:var(--surface-2);border-bottom:2px solid var(--border)">
            <tr>
              <th style="text-align:left;padding:12px;font-size:12px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px">Name</th>
              <th style="text-align:left;padding:12px;font-size:12px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px">Status</th>
              <th style="text-align:left;padding:12px;font-size:12px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px">Created</th>
              <th style="text-align:right;padding:12px;font-size:12px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px">Row count</th>
            </tr>
          </thead>
          <tbody id="rd-list-body">
            <tr><td colspan="4" style="padding:24px;text-align:center;color:var(--text-tertiary);font-size:13px">Loading…</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Fetch (synthetic empty list when the flag is off — see api.js).
  let items = [];
  try {
    items = await api.listResearchDatasets();
  } catch (_err) {
    items = [];
  }

  const body = document.getElementById('rd-list-body');
  if (!body) return;

  if (!items.length) {
    body.innerHTML = `
      <tr>
        <td colspan="4" style="padding:32px 24px;text-align:center;color:var(--text-tertiary);font-size:13px">
          No dataset specifications. Once <code>RESEARCH_EXPORT_ENABLED=true</code>
          is set and a draft is created via the API, it will appear here.
        </td>
      </tr>`;
    return;
  }

  body.innerHTML = items.map((d) => {
    const created = d.created_at ? new Date(d.created_at).toLocaleString() : '—';
    const rowCount = d.row_count != null ? String(d.row_count) : '—';
    return `
      <tr style="border-bottom:1px solid var(--border)">
        <td style="padding:12px;font-size:13px;color:var(--text-primary);font-weight:500">${esc(d.name)}</td>
        <td style="padding:12px;font-size:12px;color:var(--text-secondary)">${esc(d.status)}</td>
        <td style="padding:12px;font-size:12px;color:var(--text-secondary)">${esc(created)}</td>
        <td style="padding:12px;font-size:12px;color:var(--text-secondary);text-align:right">${esc(rowCount)}</td>
      </tr>`;
  }).join('');
}
