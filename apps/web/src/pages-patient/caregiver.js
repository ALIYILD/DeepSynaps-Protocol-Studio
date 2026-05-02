// pgPatientCaregiver — caregiver-side viewer for grants pointed at the
// current actor. Extracted from `pages-patient.js` on 2026-05-02 as part
// of the file-split refactor (see `pages-patient/_shared.js`). NO
// behavioural change: code below is the verbatim caregiver block from
// the original file, with imports rewired.
import { api } from '../api.js';
import { spinner } from './_shared.js';

// ── Caregiver Access ─────────────────────────────────────────────────────────

// ── Caregiver Portal launch-audit (2026-05-01) ───────────────────────────────
// pgPatientCaregiver is the CAREGIVER-side viewer (not patient-side). It is
// reachable by anyone who has a grant pointed at their `actor.actor_id` —
// caregivers, family members, clinicians acting in a caregiver capacity.
//
// The page surfaces grants from `/api/v1/caregiver-consent/grants/by-
// caregiver` with anonymized patient context (first name + clinic only —
// never last name, never full email). For each grant card we render scope
// chips, granted/revoked dates, and CTAs for:
//
//   * Acknowledge revocation → POST /grants/{id}/acknowledge-revocation
//     (idempotent; emits `caregiver_portal.revocation_acknowledged`).
//   * View digest / messages → POST /grants/{id}/access-log with the
//     scope_key being clicked. Backend gates on `scope[scope_key]=True`
//     and records an audit row visible to the patient.
//
// Mount-time `caregiver_portal.view` audit ping fires on every page load.
// DEMO banner is gated on the actor's demo state (currently inferred from
// the demo token) so reviewers see honest "this is demo data" framing.
const CAREGIVER_PORTAL_SCOPE_KEYS = ['digest', 'messages', 'reports', 'wearables'];

function _ptCgScopeChipLabels(scope) {
  return CAREGIVER_PORTAL_SCOPE_KEYS.filter((k) => scope && scope[k]);
}

function _ptCgEsc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _ptCgFormatDate(s) {
  if (!s) return '—';
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return _ptCgEsc(s);
    return d.toLocaleString();
  } catch (_e) {
    return _ptCgEsc(s);
  }
}

export async function pgPatientCaregiver() {
  const el = document.getElementById('patient-content');
  if (!el) return;
  el.innerHTML = spinner();

  // Mount-time audit ping. Best-effort — never blocks render.
  try {
    if (typeof api.postCaregiverPortalAuditEvent === 'function') {
      api.postCaregiverPortalAuditEvent({
        event: 'view',
        note: 'caregiver_portal.view page mount',
      });
      // Notification Hub launch-audit (2026-05-01) — distinct mount
      // event so the regulator transcript shows when the caregiver
      // ACTUALLY rendered the notifications panel (vs. just hit the
      // page).
      api.postCaregiverPortalAuditEvent({
        event: 'notifications_view',
        note: 'caregiver_portal.notifications_view panel mount',
      });
      // Caregiver Email Digest launch-audit (2026-05-01) — distinct
      // mount event so the regulator transcript records when the
      // caregiver actually rendered the daily-digest delivery
      // subsection (vs. just hit the page).
      api.postCaregiverPortalAuditEvent({
        event: 'email_digest_view',
        note: 'caregiver_portal.email_digest_view subsection mount',
      });
    }
  } catch (_e) {}

  // ── Notification Hub fetch (best-effort) ─────────────────────────────────
  // Server-side feed joining audit_event_records + caregiver_consent_revisions
  // filtered to the actor's grants. Read-receipt state is a
  // `caregiver_portal.notification_dismissed` audit row.
  let notifications = [];
  let notificationSummary = { unread: 0, last_7d: 0, read: 0, total: 0 };
  if (typeof api.caregiverNotificationsList === 'function') {
    try {
      const [list, summary] = await Promise.all([
        Promise.race([
          api.caregiverNotificationsList({ limit: 50 }),
          new Promise((_, rej) => setTimeout(() => rej('timeout'), 4000)),
        ]).catch(() => null),
        Promise.race([
          api.caregiverNotificationsSummary(),
          new Promise((_, rej) => setTimeout(() => rej('timeout'), 4000)),
        ]).catch(() => null),
      ]);
      if (list && Array.isArray(list.items)) notifications = list.items;
      if (summary && typeof summary.unread === 'number') notificationSummary = summary;
    } catch (_e) {}
  }

  // ── Daily Digest delivery fetch (best-effort) ────────────────────────────
  // Caregiver Email Digest launch-audit (2026-05-01). Closes the
  // bidirectional notification loop with the Notification Hub above —
  // unread notifications can be rolled up into a daily email/Slack/SMS
  // dispatch via the on-call delivery adapters. Caregiver opts in via
  // a preference row; sending requires an active grant with
  // scope.digest=true.
  let digestPreview = { unread_count: 0, items: [], consent_active: false };
  // ``preferred_channel`` (Per-Caregiver Channel Preference launch-audit
  // 2026-05-01) is null by default — null means "use the clinic chain
  // as-is". The dropdown surface below renders "Use clinic default"
  // when the field is null, and one of the canonical chip values
  // (email/sms/slack) when the caregiver opted in.
  let digestPrefs = { enabled: false, frequency: 'daily', time_of_day: '08:00', last_sent_at: null, preferred_channel: null };
  // Clinic Caregiver Channel Override launch-audit (2026-05-01). The
  // dispatch preview reflects the FIRST adapter in the resolved chain
  // that is actually enabled (real env vars set OR mock-mode flipped on).
  // Default-empty so the banner renders nothing when the backend is
  // offline / unreachable, instead of pretending to dispatch.
  let dispatchPreview = {
    resolved_chain: [],
    will_dispatch_via: '-',
    will_dispatch_adapter: null,
    honored_caregiver_preference: false,
    clinic_chain: [],
    caregiver_preferred_channel: null,
  };
  if (typeof api.caregiverEmailDigestPreview === 'function') {
    try {
      const [pv, pr, dp] = await Promise.all([
        Promise.race([
          api.caregiverEmailDigestPreview(),
          new Promise((_, rej) => setTimeout(() => rej('timeout'), 4000)),
        ]).catch(() => null),
        Promise.race([
          api.caregiverEmailDigestPreferencesGet(),
          new Promise((_, rej) => setTimeout(() => rej('timeout'), 4000)),
        ]).catch(() => null),
        // Best-effort dispatch preview — null on offline / 404 (helper
        // is missing in older deploys).
        (typeof api.caregiverEmailDigestPreviewDispatch === 'function')
          ? Promise.race([
              api.caregiverEmailDigestPreviewDispatch(),
              new Promise((_, rej) => setTimeout(() => rej('timeout'), 4000)),
            ]).catch(() => null)
          : Promise.resolve(null),
      ]);
      if (pv && typeof pv.unread_count === 'number') digestPreview = pv;
      if (pr && typeof pr.enabled === 'boolean') digestPrefs = pr;
      if (dp && typeof dp.will_dispatch_via === 'string') dispatchPreview = dp;
    } catch (_e) {}
  }

  // Fetch grants pointed at the actor as caregiver.
  let grants = [];
  let caregiverUserId = '';
  let backendReady = typeof api.caregiverConsentListByCaregiver === 'function';
  let _isDemo = false;
  if (backendReady) {
    try {
      const res = await Promise.race([
        api.caregiverConsentListByCaregiver(),
        new Promise((_, rej) => setTimeout(() => rej('timeout'), 4000)),
      ]);
      if (res && Array.isArray(res.items)) {
        grants = res.items;
        caregiverUserId = res.caregiver_user_id || '';
      } else if (res === null) {
        // apiFetch returned null → backend offline. Fall through to empty.
        backendReady = false;
      }
    } catch (_e) {
      backendReady = false;
    }
  }

  // ── Caregiver Delivery Acknowledgement launch-audit (2026-05-01) ─────────
  // Per-grant last-acknowledgement fetch. Best-effort — when the helper
  // returns null we render the "Recent landed digests" subsection in
  // the "no acknowledgement yet" state. The backend's
  // `acknowledge-delivery` endpoint resolves the most recent landed
  // dispatch on its own, so the page does not need to enumerate
  // dispatches client-side.
  const grantAckMap = {};
  if (
    backendReady
    && typeof api.caregiverPortalLastAcknowledgement === 'function'
    && grants.length > 0
  ) {
    try {
      const acks = await Promise.all(grants.map((g) => Promise.race([
        api.caregiverPortalLastAcknowledgement(g.id),
        new Promise((_, rej) => setTimeout(() => rej('timeout'), 2000)),
      ]).catch(() => null)));
      grants.forEach((g, i) => {
        const a = acks[i];
        if (a && a.grant_id === g.id) grantAckMap[g.id] = a;
      });
    } catch (_e) {}
  }

  // Demo state — when the actor is the patient-demo or clinician-demo
  // token. We infer it from the actor identity exposed via the auth
  // probe at first paint (best-effort; UI honest-fallback if not).
  try {
    if (typeof api.whoami === 'function') {
      const who = await Promise.race([
        api.whoami(),
        new Promise((_, rej) => setTimeout(() => rej('timeout'), 1500)),
      ]).catch(() => null);
      if (who && (who.actor_id === 'actor-clinician-demo' || who.actor_id === 'actor-patient-demo' || who.is_demo)) {
        _isDemo = true;
        try {
          api.postCaregiverPortalAuditEvent({
            event: 'demo_banner_shown',
            note: `actor=${who.actor_id || 'unknown'}`,
            using_demo_data: true,
          });
        } catch (_e) {}
      }
    }
  } catch (_e) {}

  function _renderEmpty() {
    return `
      <div class="pt-portal-empty" style="padding:24px 28px;text-align:center;background:rgba(0,212,188,0.04);border:1px solid rgba(0,212,188,0.15);border-radius:12px;margin-bottom:20px">
        <div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:6px">No patients have granted you access yet.</div>
        <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.55">When a patient grants you caregiver access, the grant will appear here with the digest / messages / reports they have authorised you to view.</div>
      </div>`;
  }

  function _renderScopeChips(scope) {
    const active = _ptCgScopeChipLabels(scope || {});
    if (active.length === 0) {
      return `<span style="font-size:11px;color:var(--text-tertiary);font-style:italic">no scopes active</span>`;
    }
    return active.map((k) => `
      <span style="display:inline-block;padding:2px 8px;border-radius:999px;background:rgba(45,212,191,0.12);color:#2dd4bf;font-size:10.5px;font-weight:600;margin-right:4px;text-transform:capitalize">${_ptCgEsc(k)}</span>
    `).join('');
  }

  function _renderGrantCard(g) {
    const isActive = !g.revoked_at;
    const scope = g.scope || {};
    const ackedAt = g.revocation_acknowledged_at;
    const patientLabel = g.patient_first_name
      ? `${_ptCgEsc(g.patient_first_name)} (${_ptCgEsc(g.patient_clinic_id || 'unknown clinic')})`
      : `Patient (${_ptCgEsc(g.patient_clinic_id || 'unknown clinic')})`;
    // Caregiver Delivery Acknowledgement launch-audit (2026-05-01).
    // Recent-landed-digests subsection — one row per grant when scope
    // includes digest. The backend's acknowledge-delivery endpoint
    // resolves the most recent landed dispatch on its own, so this
    // section only needs to surface the CTA + the "last confirmed at"
    // stamp from the cached last-ack lookup.
    const ackInfo = grantAckMap[g.id] || null;
    const lastDeliveryAck = ackInfo && ackInfo.last_acknowledged_at;
    // Multi-Adapter Delivery Parity launch-audit (2026-05-01).
    // Channel chip from the most recent landed dispatch (email / sms /
    // slack / pagerduty). Renders next to the "Recent landed digests"
    // header so the caregiver can see WHICH channel the dispatch
    // arrived on. ``null`` when no landed dispatch exists yet.
    const landedChannel = ackInfo && ackInfo.latest_landed_channel;
    const channelChipHtml = landedChannel
      ? `<span data-testid="pt-cg-channel-chip" style="display:inline-block;margin-left:6px;padding:1px 7px;border-radius:999px;background:rgba(45,212,191,0.14);color:#2dd4bf;font-size:9.5px;font-weight:600;text-transform:uppercase;letter-spacing:0.4px">via ${_ptCgEsc(landedChannel)}</span>`
      : '';
    const recentDigestsHtml = (isActive && scope.digest)
      ? `<div data-testid="pt-cg-recent-digests" style="margin-top:10px;padding:10px 12px;border:1px solid rgba(45,212,191,0.2);border-radius:10px;background:rgba(45,212,191,0.04)">
          <div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:6px">
            <div style="font-size:12px;font-weight:600;color:var(--text-primary)">Recent landed digests${channelChipHtml}</div>
            ${lastDeliveryAck
              ? `<span style="font-size:10.5px;color:var(--text-tertiary)">Last confirmed: ${_ptCgFormatDate(lastDeliveryAck)}</span>`
              : `<span style="font-size:10.5px;color:#fbbf24">Awaiting confirmation</span>`}
          </div>
          <div style="font-size:11px;color:var(--text-tertiary);line-height:1.5;margin-bottom:8px">
            When the digest lands in your inbox, your phone, or your Slack DM, click "I received it" so the patient's audit trail can prove the message round-tripped on whichever channel they configured.
          </div>
          <button class="btn btn-sm" data-cg-ack-delivery="${_ptCgEsc(g.id)}" style="background:rgba(45,212,191,0.14);border:1px solid rgba(45,212,191,0.3);color:#2dd4bf;font-size:11.5px;padding:5px 12px;border-radius:8px;cursor:pointer">I received it</button>
        </div>` : '';
    return `
      <div class="pt-cg-grant-card" data-grant-id="${_ptCgEsc(g.id)}" style="border:1px solid var(--border);border-radius:12px;padding:16px 18px;margin-bottom:12px;background:${isActive ? 'rgba(45,212,191,0.03)' : 'rgba(251,113,133,0.04)'}">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:8px">
          <div style="font-size:14px;font-weight:600;color:var(--text-primary)">${patientLabel}</div>
          <span style="font-size:10.5px;font-weight:600;padding:3px 10px;border-radius:999px;background:${isActive ? 'rgba(45,212,191,0.14)' : 'rgba(251,113,133,0.14)'};color:${isActive ? '#2dd4bf' : '#fb7185'}">${isActive ? 'Active' : 'Revoked'}</span>
        </div>
        <div style="font-size:11.5px;color:var(--text-tertiary);margin-bottom:10px">
          Granted: ${_ptCgFormatDate(g.granted_at)}
          ${g.revoked_at ? ` &middot; Revoked: ${_ptCgFormatDate(g.revoked_at)}` : ''}
        </div>
        <div style="margin-bottom:10px">${_renderScopeChips(scope)}</div>
        ${g.revocation_reason ? `
          <div style="font-size:12px;color:var(--text-secondary);background:rgba(251,113,133,0.08);border:1px solid rgba(251,113,133,0.18);border-radius:8px;padding:8px 10px;margin-bottom:10px">
            <strong style="color:#fb7185">Revocation reason:</strong> ${_ptCgEsc(g.revocation_reason)}
          </div>` : ''}
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          ${!isActive && !ackedAt ? `
            <button class="btn btn-sm" data-cg-ack="${_ptCgEsc(g.id)}" style="background:rgba(251,113,133,0.18);border:1px solid rgba(251,113,133,0.3);color:#fb7185;font-size:11.5px;padding:5px 12px;border-radius:8px">Acknowledge revocation</button>
          ` : ''}
          ${!isActive && ackedAt ? `
            <span style="font-size:11px;color:var(--text-tertiary)">Acknowledged ${_ptCgFormatDate(ackedAt)}</span>
          ` : ''}
          ${isActive && scope.digest ? `
            <button class="btn btn-sm" data-cg-view="digest" data-cg-grant="${_ptCgEsc(g.id)}" style="background:rgba(45,212,191,0.14);border:1px solid rgba(45,212,191,0.3);color:#2dd4bf;font-size:11.5px;padding:5px 12px;border-radius:8px">View digest</button>
          ` : ''}
          ${isActive && scope.messages ? `
            <button class="btn btn-sm" data-cg-view="messages" data-cg-grant="${_ptCgEsc(g.id)}" style="background:rgba(45,212,191,0.14);border:1px solid rgba(45,212,191,0.3);color:#2dd4bf;font-size:11.5px;padding:5px 12px;border-radius:8px">View shared messages</button>
          ` : ''}
          ${isActive && scope.reports ? `
            <button class="btn btn-sm" data-cg-view="reports" data-cg-grant="${_ptCgEsc(g.id)}" style="background:rgba(45,212,191,0.14);border:1px solid rgba(45,212,191,0.3);color:#2dd4bf;font-size:11.5px;padding:5px 12px;border-radius:8px">View reports</button>
          ` : ''}
        </div>
        ${recentDigestsHtml}
      </div>`;
  }

  el.innerHTML = `
    <div style="max-width:760px;margin:0 auto;padding:24px 16px">
      <h2 style="font-size:18px;font-weight:700;color:var(--text-primary);margin:0 0 6px">Caregiver Portal</h2>
      <p style="font-size:13px;color:var(--text-secondary);margin:0 0 16px;line-height:1.55">
        Patients you support can grant you read-only access to their digest, messages, and reports. Each grant has an explicit scope and a revocation transcript — you'll see exactly what you've been authorised to view, and the patient sees an audit row every time you access something.
      </p>
      ${_isDemo ? `
        <div style="background:rgba(255,181,71,0.08);border:1px solid rgba(255,181,71,0.24);border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:var(--text-secondary);line-height:1.45">
          <strong style="color:#fbb547">DEMO data.</strong> This view is showing demo grants. Audit rows are tagged DEMO and are NOT regulator-submittable.
        </div>` : ''}
      ${!backendReady ? `
        <div style="background:rgba(251,113,133,0.08);border:1px solid rgba(251,113,133,0.2);border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:var(--text-secondary);line-height:1.45">
          The caregiver portal API is not reachable right now. Grants cannot be loaded — please retry later.
        </div>` : ''}
      <div id="pt-cg-notifications-panel" style="border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:18px;background:rgba(0,212,188,0.03)">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:10px">
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:14px;font-weight:700;color:var(--text-primary)">Notifications</span>
            <span id="pt-cg-notif-badge" style="display:inline-block;padding:2px 9px;border-radius:999px;background:${notificationSummary.unread > 0 ? 'rgba(251,113,133,0.16)' : 'rgba(120,120,120,0.16)'};color:${notificationSummary.unread > 0 ? '#fb7185' : 'var(--text-tertiary)'};font-size:11px;font-weight:700">${notificationSummary.unread || 0} unread</span>
          </div>
          <button id="pt-cg-notif-mark-all" class="btn btn-sm" ${notificationSummary.unread > 0 ? '' : 'disabled'} style="background:rgba(45,212,191,0.14);border:1px solid rgba(45,212,191,0.3);color:#2dd4bf;font-size:11.5px;padding:5px 12px;border-radius:8px;cursor:${notificationSummary.unread > 0 ? 'pointer' : 'not-allowed'};opacity:${notificationSummary.unread > 0 ? 1 : 0.5}">Mark all read</button>
        </div>
        <div id="pt-cg-notif-list">
          ${notifications.length === 0 ? `
            <div style="padding:14px 0;text-align:center;font-size:12.5px;color:var(--text-tertiary)">No notifications.</div>
          ` : notifications.map((n) => `
            <div class="pt-cg-notif-row" data-notif-id="${_ptCgEsc(n.id)}" data-notif-grant="${_ptCgEsc(n.grant_id || '')}" data-notif-surface="${_ptCgEsc(n.surface || 'caregiver_portal')}" style="display:flex;align-items:flex-start;gap:10px;padding:8px 4px;border-bottom:1px solid var(--border-subtle, rgba(255,255,255,0.06))">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;margin-top:7px;background:${n.is_read ? 'transparent' : '#fb7185'};border:1px solid ${n.is_read ? 'var(--border)' : '#fb7185'}"></span>
              <div style="flex:1;min-width:0">
                <div style="font-size:12.5px;color:var(--text-primary);font-weight:${n.is_read ? '500' : '600'}">${_ptCgEsc(n.summary || n.type || 'notification')}</div>
                <div style="font-size:10.5px;color:var(--text-tertiary);margin-top:2px">${_ptCgFormatDate(n.created_at)} &middot; ${_ptCgEsc(n.type || '-')}${n.scope_chip ? ` &middot; <span style="text-transform:capitalize">${_ptCgEsc(n.scope_chip)}</span>` : ''}</div>
              </div>
              ${n.is_read ? '' : `<button class="btn btn-sm" data-cg-notif-mark="${_ptCgEsc(n.id)}" style="background:rgba(45,212,191,0.14);border:1px solid rgba(45,212,191,0.3);color:#2dd4bf;font-size:10.5px;padding:3px 9px;border-radius:6px">Mark read</button>`}
            </div>
          `).join('')}
        </div>
      </div>
      <div id="pt-cg-email-digest-panel" style="border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:18px;background:rgba(45,212,191,0.03)">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:10px">
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:14px;font-weight:700;color:var(--text-primary)">Daily digest delivery</span>
            <span id="pt-cg-digest-consent-chip" style="display:inline-block;padding:2px 9px;border-radius:999px;background:${digestPreview.consent_active ? 'rgba(45,212,191,0.16)' : 'rgba(251,113,133,0.16)'};color:${digestPreview.consent_active ? '#2dd4bf' : '#fb7185'};font-size:11px;font-weight:700">${digestPreview.consent_active ? 'Consent active' : 'Consent missing'}</span>
          </div>
          <button id="pt-cg-digest-send-now" class="btn btn-sm" style="background:rgba(45,212,191,0.14);border:1px solid rgba(45,212,191,0.3);color:#2dd4bf;font-size:11.5px;padding:5px 12px;border-radius:8px;cursor:pointer">Send now</button>
        </div>
        <div id="pt-cg-digest-preview" style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;line-height:1.5">
          ${digestPreview.unread_count === 0
            ? 'No unread notifications would be included in today\'s digest.'
            : `Today\'s digest would include <strong>${digestPreview.unread_count}</strong> unread notification${digestPreview.unread_count === 1 ? '' : 's'}.`}
        </div>
        ${(() => {
          // Clinic Caregiver Channel Override launch-audit (2026-05-01).
          // "Will dispatch via {channel}" preview banner. Honored=green
          // when the caregiver's preferred channel is enabled; amber
          // "falls back" when the preferred channel's adapter is not
          // configured in this deploy. No banner when the dispatch
          // preview endpoint is unreachable (will_dispatch_via stays
          // '-') so the page doesn't fake a status.
          if (!dispatchPreview.will_dispatch_via || dispatchPreview.will_dispatch_via === '-') return '';
          const willChip = _ptCgEsc(dispatchPreview.will_dispatch_via);
          const isHonored = !!dispatchPreview.honored_caregiver_preference;
          const hasOverride = !!dispatchPreview.caregiver_preferred_channel;
          const banner = isHonored
            ? `Will dispatch via <strong style="text-transform:capitalize">${willChip}</strong> — your preferred channel is configured.`
            : (hasOverride
                ? `Will dispatch via <strong style="text-transform:capitalize">${willChip}</strong>. Your preferred <strong>${_ptCgEsc(dispatchPreview.caregiver_preferred_channel)}</strong> is not configured for this clinic; the clinic chain is used as the fallback.`
                : `Will dispatch via <strong style="text-transform:capitalize">${willChip}</strong> (clinic default chain).`);
          const bg = isHonored
            ? 'rgba(45,212,191,0.10)'
            : (hasOverride ? 'rgba(251,191,36,0.12)' : 'rgba(120,120,120,0.10)');
          const border = isHonored
            ? 'rgba(45,212,191,0.32)'
            : (hasOverride ? 'rgba(251,191,36,0.32)' : 'rgba(120,120,120,0.24)');
          const fg = isHonored
            ? '#2dd4bf'
            : (hasOverride ? '#d97706' : 'var(--text-secondary)');
          const resolvedText = (Array.isArray(dispatchPreview.resolved_chain) && dispatchPreview.resolved_chain.length > 0)
            ? dispatchPreview.resolved_chain.map((n) => _ptCgEsc(n)).join(' → ')
            : '—';
          const clinicText = (Array.isArray(dispatchPreview.clinic_chain) && dispatchPreview.clinic_chain.length > 0)
            ? dispatchPreview.clinic_chain.map((n) => _ptCgEsc(n)).join(' → ')
            : '—';
          return `
        <div id="pt-cg-digest-dispatch-banner" data-testid="pt-cg-digest-dispatch-banner" style="border:1px solid ${border};background:${bg};color:${fg};border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:12px;line-height:1.5">
          <div data-testid="pt-cg-digest-will-dispatch-via">${banner}</div>
          <div style="font-size:10.5px;color:var(--text-tertiary);margin-top:4px">
            Resolved chain: <code>${resolvedText}</code> &middot; clinic chain: <code>${clinicText}</code>
          </div>
        </div>`;
        })()}
        <div style="display:grid;grid-template-columns:auto 1fr;gap:8px 12px;align-items:center;font-size:12px;color:var(--text-secondary)">
          <label for="pt-cg-digest-enabled" style="font-weight:600">Enabled</label>
          <div>
            <input id="pt-cg-digest-enabled" type="checkbox" ${digestPrefs.enabled ? 'checked' : ''} aria-label="enable daily digest" />
          </div>
          <label for="pt-cg-digest-frequency" style="font-weight:600">Frequency</label>
          <select id="pt-cg-digest-frequency" style="padding:4px 8px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--text-primary);font-size:12px;max-width:160px">
            <option value="daily" ${digestPrefs.frequency === 'daily' ? 'selected' : ''}>Daily</option>
            <option value="weekly" ${digestPrefs.frequency === 'weekly' ? 'selected' : ''}>Weekly</option>
          </select>
          <label for="pt-cg-digest-time-of-day" style="font-weight:600">Time of day</label>
          <input id="pt-cg-digest-time-of-day" type="time" value="${_ptCgEsc(digestPrefs.time_of_day || '08:00')}" style="padding:4px 8px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--text-primary);font-size:12px;max-width:160px" />
          <label for="pt-cg-digest-channel" style="font-weight:600">Channel preference</label>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <select id="pt-cg-digest-channel" style="padding:4px 8px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--text-primary);font-size:12px;max-width:200px" aria-label="caregiver preferred dispatch channel">
              <option value="" ${!digestPrefs.preferred_channel ? 'selected' : ''}>Use clinic default</option>
              <option value="email" ${digestPrefs.preferred_channel === 'email' ? 'selected' : ''}>Email</option>
              <option value="sms" ${digestPrefs.preferred_channel === 'sms' ? 'selected' : ''}>SMS</option>
              <option value="slack" ${digestPrefs.preferred_channel === 'slack' ? 'selected' : ''}>Slack</option>
            </select>
            <span id="pt-cg-digest-channel-chip" style="display:inline-block;padding:2px 9px;border-radius:999px;background:rgba(45,212,191,0.12);color:#2dd4bf;font-size:11px;font-weight:600">${digestPrefs.preferred_channel ? _ptCgEsc(digestPrefs.preferred_channel) : 'clinic default'}</span>
          </div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:10px">
          <button id="pt-cg-digest-save-prefs" class="btn btn-sm" style="background:rgba(45,212,191,0.14);border:1px solid rgba(45,212,191,0.3);color:#2dd4bf;font-size:11.5px;padding:5px 12px;border-radius:8px;cursor:pointer">Save preferences</button>
          <span id="pt-cg-digest-last-sent" style="font-size:10.5px;color:var(--text-tertiary)">Last sent: ${digestPrefs.last_sent_at ? _ptCgFormatDate(digestPrefs.last_sent_at) : 'never'}</span>
        </div>
      </div>
      <div id="pt-cg-grant-list">
        ${grants.length === 0 ? _renderEmpty() : grants.map(_renderGrantCard).join('')}
      </div>
      <div style="margin-top:24px;padding:14px 16px;border:1px solid var(--border);border-radius:10px;font-size:11.5px;color:var(--text-tertiary);line-height:1.55">
        <strong style="color:var(--text-secondary)">How this page works.</strong>
        Each card represents a durable grant the patient has issued — it cannot be transferred or extended by you. Acknowledging a revocation never deletes the grant; the regulator transcript stays intact. Access logs are best-effort: clicking "View digest" emits a <code>caregiver_portal.grant_accessed</code> audit row even if the underlying surface is offline.
      </div>
    </div>`;

  // ── CTA wiring ───────────────────────────────────────────────────────────
  function _findGrant(id) {
    return grants.find((g) => g.id === id);
  }

  el.querySelectorAll('[data-cg-ack]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const gid = btn.getAttribute('data-cg-ack');
      if (!gid) return;
      btn.disabled = true;
      btn.textContent = 'Acknowledging…';
      try {
        const res = await api.caregiverPortalAcknowledgeRevocation(gid);
        if (res && res.revocation_acknowledged_at) {
          const g = _findGrant(gid);
          if (g) g.revocation_acknowledged_at = res.revocation_acknowledged_at;
          window._showNotifToast && window._showNotifToast({
            title: 'Revocation acknowledged',
            body: 'The patient sees that you have seen the revoke.',
            severity: 'success',
          });
          try {
            api.postCaregiverPortalAuditEvent({
              event: 'revocation_acknowledged_ui',
              target_id: gid,
              note: 'caregiver clicked Acknowledge revocation',
            });
          } catch (_e) {}
          // Re-render this card.
          const card = el.querySelector(`[data-grant-id="${gid}"]`);
          if (card && g) card.outerHTML = _renderGrantCard(g);
        } else {
          throw new Error('no_ack');
        }
      } catch (_e) {
        btn.disabled = false;
        btn.textContent = 'Acknowledge revocation';
        window._showNotifToast && window._showNotifToast({
          title: 'Could not acknowledge',
          body: 'The acknowledgement could not be recorded. Try again later.',
          severity: 'warning',
        });
      }
    });
  });

  // ── Notifications: per-row mark-read + drill-out ─────────────────────────
  function _drillOutForNotif(row) {
    if (!row) return;
    const surface = row.getAttribute('data-notif-surface') || 'caregiver_portal';
    const grantId = row.getAttribute('data-notif-grant') || '';
    if (surface === 'caregiver_consent' && grantId) {
      const card = el.querySelector(`[data-grant-id="${grantId}"]`);
      if (card && typeof card.scrollIntoView === 'function') {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.style.outline = '2px solid #2dd4bf';
        setTimeout(() => { card.style.outline = ''; }, 1400);
      }
    }
    // ``audit`` / ``access_log`` notifications: link to the audit-trail
    // surface — we leave the user on this page, the audit-trail page is
    // not always accessible to caregivers.
  }

  async function _markNotifRead(notifId) {
    if (!notifId) return false;
    try {
      const res = await api.caregiverNotificationsMarkRead(notifId);
      if (res && res.accepted) {
        const target = notifications.find((n) => n.id === notifId);
        if (target) target.is_read = true;
        if (!res.already_read && notificationSummary.unread > 0) {
          notificationSummary.unread = Math.max(0, notificationSummary.unread - 1);
        }
        return true;
      }
    } catch (_e) {}
    return false;
  }

  function _refreshNotifBadge() {
    const badge = el.querySelector('#pt-cg-notif-badge');
    if (badge) {
      badge.textContent = `${notificationSummary.unread || 0} unread`;
      badge.style.background = notificationSummary.unread > 0 ? 'rgba(251,113,133,0.16)' : 'rgba(120,120,120,0.16)';
      badge.style.color = notificationSummary.unread > 0 ? '#fb7185' : 'var(--text-tertiary)';
    }
    const allBtn = el.querySelector('#pt-cg-notif-mark-all');
    if (allBtn) {
      if (notificationSummary.unread > 0) {
        allBtn.removeAttribute('disabled');
        allBtn.style.opacity = 1;
        allBtn.style.cursor = 'pointer';
      } else {
        allBtn.setAttribute('disabled', 'disabled');
        allBtn.style.opacity = 0.5;
        allBtn.style.cursor = 'not-allowed';
      }
    }
  }

  el.querySelectorAll('[data-cg-notif-mark]').forEach((btn) => {
    btn.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const id = btn.getAttribute('data-cg-notif-mark');
      btn.disabled = true;
      btn.textContent = '…';
      const ok = await _markNotifRead(id);
      if (ok) {
        const row = btn.closest('.pt-cg-notif-row');
        if (row) {
          const dot = row.querySelector('span');
          if (dot) {
            dot.style.background = 'transparent';
            dot.style.borderColor = 'var(--border)';
          }
          btn.remove();
        }
        _refreshNotifBadge();
      } else {
        btn.disabled = false;
        btn.textContent = 'Mark read';
      }
    });
  });

  el.querySelectorAll('.pt-cg-notif-row').forEach((row) => {
    row.addEventListener('click', async () => {
      const id = row.getAttribute('data-notif-id');
      if (!id) return;
      // Mark read on click + drill-out to the source surface.
      const target = notifications.find((n) => n.id === id);
      if (target && !target.is_read) {
        await _markNotifRead(id);
        const dot = row.querySelector('span');
        if (dot) {
          dot.style.background = 'transparent';
          dot.style.borderColor = 'var(--border)';
        }
        const btn = row.querySelector('[data-cg-notif-mark]');
        if (btn) btn.remove();
        _refreshNotifBadge();
      }
      _drillOutForNotif(row);
    });
  });

  const markAllBtn = el.querySelector('#pt-cg-notif-mark-all');
  if (markAllBtn) {
    markAllBtn.addEventListener('click', async () => {
      const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
      if (unreadIds.length === 0) return;
      markAllBtn.disabled = true;
      markAllBtn.textContent = 'Marking…';
      try {
        const res = await api.caregiverNotificationsBulkMarkRead({
          notification_ids: unreadIds,
          note: 'Caregiver Portal Mark all read CTA',
        });
        if (res && res.accepted) {
          for (const id of unreadIds) {
            const t = notifications.find((n) => n.id === id);
            if (t) t.is_read = true;
          }
          notificationSummary.unread = 0;
          el.querySelectorAll('.pt-cg-notif-row').forEach((row) => {
            const dot = row.querySelector('span');
            if (dot) {
              dot.style.background = 'transparent';
              dot.style.borderColor = 'var(--border)';
            }
            const btn = row.querySelector('[data-cg-notif-mark]');
            if (btn) btn.remove();
          });
          _refreshNotifBadge();
          window._showNotifToast && window._showNotifToast({
            title: 'Notifications cleared',
            body: `${res.processed || 0} marked read.`,
            severity: 'success',
          });
        } else {
          throw new Error('bulk_mark_failed');
        }
      } catch (_e) {
        window._showNotifToast && window._showNotifToast({
          title: 'Could not mark all read',
          body: 'The bulk operation failed; try again later.',
          severity: 'warning',
        });
      } finally {
        markAllBtn.disabled = notificationSummary.unread === 0;
        markAllBtn.textContent = 'Mark all read';
      }
    });
  }

  // Caregiver Delivery Acknowledgement launch-audit (2026-05-01) —
  // wire the per-grant "I received it" CTA. POSTs to
  // /acknowledge-delivery (idempotent within 24h on the server) and
  // refreshes the in-card "Last confirmed" stamp on success.
  el.querySelectorAll('[data-cg-ack-delivery]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const gid = btn.getAttribute('data-cg-ack-delivery');
      if (!gid) return;
      btn.disabled = true;
      btn.textContent = 'Confirming…';
      try {
        const res = await api.caregiverPortalAcknowledgeDelivery(gid);
        if (res && res.last_acknowledged_at) {
          // Multi-Adapter Delivery Parity launch-audit (2026-05-01):
          // preserve the channel chip we already cached on the
          // LastAcknowledgement lookup so the re-render keeps the
          // "via {channel}" tag visible after the click.
          const priorChannel = (grantAckMap[gid] && grantAckMap[gid].latest_landed_channel) || null;
          grantAckMap[gid] = {
            grant_id: gid,
            last_acknowledged_at: res.last_acknowledged_at,
            acknowledged_dispatch_id: res.acknowledged_dispatch_id || null,
            latest_landed_channel: priorChannel,
          };
          window._showNotifToast && window._showNotifToast({
            title: res.cooldown_active
              ? 'Already confirmed'
              : 'Delivery confirmed',
            body: res.cooldown_active
              ? 'You already confirmed receipt within the last 24 hours.'
              : 'The patient will see this confirmation in their audit trail.',
            severity: 'success',
          });
          try {
            api.postCaregiverPortalAuditEvent({
              event: 'delivery_acknowledged_ui',
              target_id: gid,
              note: `caregiver clicked I received it; cooldown=${res.cooldown_active ? 1 : 0}`,
            });
          } catch (_e) {}
          // Re-render this card so the "Last confirmed" stamp updates.
          const card = el.querySelector(`[data-grant-id="${gid}"]`);
          const g = grants.find((x) => x.id === gid);
          if (card && g) card.outerHTML = _renderGrantCard(g);
        } else {
          throw new Error('no_ack');
        }
      } catch (_e) {
        btn.disabled = false;
        btn.textContent = 'I received it';
        window._showNotifToast && window._showNotifToast({
          title: 'Could not confirm',
          body: 'The acknowledgement could not be recorded. Try again later.',
          severity: 'warning',
        });
      }
    });
  });

  el.querySelectorAll('[data-cg-view]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const scopeKey = btn.getAttribute('data-cg-view');
      const gid = btn.getAttribute('data-cg-grant');
      if (!scopeKey || !gid) return;
      try {
        api.postCaregiverPortalAuditEvent({
          event: `${scopeKey}_view_clicked_ui`,
          target_id: gid,
          note: `caregiver clicked View ${scopeKey}`,
        });
      } catch (_e) {}
      try {
        const res = await api.caregiverPortalAccessLog(gid, {
          scope_key: scopeKey,
          surface: 'caregiver_portal',
          note: `View ${scopeKey} clicked`,
        });
        if (res && res.accepted) {
          window._showNotifToast && window._showNotifToast({
            title: `Access logged: ${scopeKey}`,
            body: 'The patient will see this access in their audit trail.',
            severity: 'success',
          });
        }
      } catch (e) {
        const msg = (e && e.message) || '';
        if (/forbidden|403/i.test(msg)) {
          window._showNotifToast && window._showNotifToast({
            title: 'Not authorised',
            body: `You do not have ${scopeKey} scope on this grant.`,
            severity: 'warning',
          });
        } else {
          window._showNotifToast && window._showNotifToast({
            title: 'Access not logged',
            body: 'The access could not be recorded right now.',
            severity: 'warning',
          });
        }
      }
    });
  });

  // ── Daily digest delivery CTA wiring ────────────────────────────────────
  // Send-now → POST /email-digest/send-now. Save preferences →
  // PUT /email-digest/preferences. Both emit audit rows server-side and
  // the page additionally posts a `caregiver_email_digest_worker.*`
  // breadcrumb so the regulator transcript records the click.
  const sendNowBtn = el.querySelector('#pt-cg-digest-send-now');
  if (sendNowBtn && typeof api.caregiverEmailDigestSendNow === 'function') {
    sendNowBtn.addEventListener('click', async () => {
      sendNowBtn.disabled = true;
      sendNowBtn.textContent = 'Sending…';
      try {
        const res = await api.caregiverEmailDigestSendNow();
        if (res && res.delivery_status === 'sent') {
          window._showNotifToast && window._showNotifToast({
            title: 'Digest sent',
            body: `Dispatched via ${res.adapter || 'adapter'} (${res.unread_count || 0} unread).`,
            severity: 'success',
          });
        } else if (res && res.delivery_status === 'queued') {
          const reason = res.consent_required
            ? 'Consent missing — patient has not granted scope.digest yet.'
            : (res.note || 'Queued — no adapter wired or no unread notifications.');
          window._showNotifToast && window._showNotifToast({
            title: 'Digest queued',
            body: reason,
            severity: 'info',
          });
        } else {
          window._showNotifToast && window._showNotifToast({
            title: 'Digest failed',
            body: (res && res.note) || 'Delivery service did not confirm.',
            severity: 'warning',
          });
        }
        try {
          api.postCaregiverEmailDigestAuditEvent({
            event: 'send_now_clicked',
            note: `delivery_status=${(res && res.delivery_status) || 'unknown'}`,
          });
        } catch (_e) {}
      } catch (_e) {
        window._showNotifToast && window._showNotifToast({
          title: 'Digest failed',
          body: 'The dispatch could not be triggered right now.',
          severity: 'warning',
        });
      } finally {
        sendNowBtn.disabled = false;
        sendNowBtn.textContent = 'Send now';
      }
    });
  }

  const saveBtn = el.querySelector('#pt-cg-digest-save-prefs');
  if (saveBtn && typeof api.caregiverEmailDigestPreferencesPut === 'function') {
    saveBtn.addEventListener('click', async () => {
      const enabledEl = el.querySelector('#pt-cg-digest-enabled');
      const freqEl = el.querySelector('#pt-cg-digest-frequency');
      const timeEl = el.querySelector('#pt-cg-digest-time-of-day');
      // Per-Caregiver Channel Preference launch-audit (2026-05-01).
      // The dropdown's empty value maps to ``null`` server-side so the
      // caregiver can revert to the clinic default after opting in.
      const channelEl = el.querySelector('#pt-cg-digest-channel');
      const channelRaw = (channelEl && channelEl.value) || '';
      const preferred_channel = channelRaw ? channelRaw : null;
      const payload = {
        enabled: !!(enabledEl && enabledEl.checked),
        frequency: (freqEl && freqEl.value) || 'daily',
        time_of_day: (timeEl && timeEl.value) || '08:00',
        preferred_channel,
      };
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';
      try {
        const res = await api.caregiverEmailDigestPreferencesPut(payload);
        if (res && typeof res.enabled === 'boolean') {
          window._showNotifToast && window._showNotifToast({
            title: 'Preferences saved',
            body: `Daily digest is ${res.enabled ? 'enabled' : 'disabled'} (${res.frequency} at ${res.time_of_day}); channel=${res.preferred_channel || 'clinic default'}.`,
            severity: 'success',
          });
          // Refresh the chip to reflect the saved preference.
          const chip = el.querySelector('#pt-cg-digest-channel-chip');
          if (chip) chip.textContent = res.preferred_channel || 'clinic default';
        }
        try {
          api.postCaregiverEmailDigestAuditEvent({
            event: 'preferences_saved_ui',
            note: `enabled=${payload.enabled}; frequency=${payload.frequency}; time_of_day=${payload.time_of_day}; preferred_channel=${preferred_channel || 'null'}`,
          });
        } catch (_e) {}
      } catch (_e) {
        window._showNotifToast && window._showNotifToast({
          title: 'Save failed',
          body: 'Preferences could not be saved right now.',
          severity: 'warning',
        });
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save preferences';
      }
    });
  }
}
