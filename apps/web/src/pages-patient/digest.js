// pgPatientDigest — patient-side mirror of the Clinician Digest. Extracted
// from `pages-patient.js` on 2026-05-02 as part of the file-split refactor
// (see `pages-patient/_shared.js`). NO behavioural change: code below is
// the verbatim digest block from the original file, with imports rewired.
import { api } from '../api.js';
import { setTopbar } from './_shared.js';

// ── Patient Digest launch-audit (2026-05-01) ─────────────────────────────
//
// Patient-side mirror of the Clinician Digest (#366). Daily/weekly
// self-summary the patient sees on demand. Honest empty state when
// there's nothing to summarise yet. NO PHI of OTHER patients renders
// here — the response is per-actor; the helper functions below only
// read fields keyed off the actor's own patient_id.

function _pdEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _pdRangeIso(days) {
  const now = new Date();
  const since = new Date(now.getTime() - days * 86400000);
  return { since: since.toISOString(), until: now.toISOString() };
}

// Caregiver Delivery Acknowledgement launch-audit (2026-05-01).
// Compact relative-time formatter for the Patient Digest "Last
// confirmed: <relative_time>" stamp under the Caregiver delivery
// confirmations subsection. Falls back to the raw ISO string on
// parse failure so the regulator transcript stays honest.
function _pdRelativeTime(iso) {
  if (!iso) return '—';
  let dt;
  try { dt = new Date(iso); } catch (_e) { return String(iso); }
  if (isNaN(dt.getTime())) return String(iso);
  const seconds = Math.max(0, Math.round((Date.now() - dt.getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return dt.toISOString().slice(0, 10);
}

function _pdDeltaIcon(d) {
  if (d == null) return '<span style="color:var(--text-muted,#94a3b8)">—</span>';
  if (d > 0) return `<span style="color:#34d399">▲ ${d.toFixed(1)}</span>`;
  if (d < 0) return `<span style="color:#fb7185">▼ ${Math.abs(d).toFixed(1)}</span>`;
  return '<span style="color:var(--text-muted,#94a3b8)">→ 0</span>';
}

function _pdAxisCard(axis, t) {
  const cur = t && t.current != null ? t.current.toFixed(1) : '—';
  const delta = t ? t.delta : null;
  const label = axis.charAt(0).toUpperCase() + axis.slice(1);
  return `<div style="border:1px solid var(--border);border-radius:10px;padding:10px;background:rgba(255,255,255,0.03)">
    <div style="font-size:11px;color:var(--text-muted,#94a3b8);margin-bottom:4px">${_pdEsc(label)}</div>
    <div style="display:flex;align-items:baseline;justify-content:space-between;gap:6px">
      <div style="font-size:18px;font-weight:700;color:var(--text-primary,#f1f5f9)">${_pdEsc(cur)}</div>
      <div style="font-size:12px">${_pdDeltaIcon(delta)}</div>
    </div>
  </div>`;
}

window._pdRangeChange = async function(days) {
  await api.postPatientDigestAuditEvent({ event: 'date_range_changed', note: `days=${days}` });
  window._pdCurrentRange = days;
  await pgPatientDigest(setTopbar);
};

window._pdDrillOut = function(section, page) {
  api.postPatientDigestAuditEvent({ event: 'section_drill_out', note: `section=${section}` });
  if (page) window._navPatient(page);
};

window._pdSendEmail = async function() {
  await api.postPatientDigestAuditEvent({ event: 'email_initiated' });
  const recipient = window.prompt('Email this digest to (leave blank to use your account email):', '') || '';
  try {
    const days = window._pdCurrentRange || 7;
    const r = _pdRangeIso(days);
    const res = await api.patientDigestSendEmail({
      recipient_email: recipient || null,
      since: r.since, until: r.until, reason: 'patient self-send',
    });
    window.alert(`Digest queued for ${res.recipient_email}. Delivery status: ${res.delivery_status} (SMTP wire-up pending; audit row recorded).`);
  } catch (e) {
    window.alert('Could not queue digest email: ' + (e && e.message ? e.message : 'unknown error'));
  }
};

window._pdShareCaregiver = async function() {
  await api.postPatientDigestAuditEvent({ event: 'caregiver_share_initiated' });
  const cgId = window.prompt('Caregiver user id to share with (must be opted-in via Caregiver Access):', '') || '';
  if (!cgId) return;
  try {
    const days = window._pdCurrentRange || 7;
    const r = _pdRangeIso(days);
    const res = await api.patientDigestShareCaregiver({
      caregiver_user_id: cgId,
      since: r.since, until: r.until, reason: 'patient share',
    });
    const msg = res.consent_required
      ? 'Share queued. Caregiver opt-in via the Patient Care Team consent flow is required before delivery wires up. Audit row recorded.'
      : `Share queued. Delivery status: ${res.delivery_status}.`;
    window.alert(msg);
  } catch (e) {
    window.alert('Could not share with caregiver: ' + (e && e.message ? e.message : 'unknown error'));
  }
};

export async function pgPatientDigest(setTopbarFn) {
  const _tb = typeof setTopbarFn === 'function' ? setTopbarFn : setTopbar;
  _tb('My Digest', '<div style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-muted,#94a3b8)">Self-summary &middot; No comparison to other patients</div>');
  const el = document.getElementById('patient-content');
  if (!el) return;
  el.innerHTML = `<div style="padding:48px;text-align:center;color:var(--teal)">&#9670; Loading your digest&hellip;</div>`;

  // Mount-time audit ping. Best-effort; never blocks render.
  api.postPatientDigestAuditEvent({ event: 'view', note: 'pgPatientDigest mount' });

  const days = window._pdCurrentRange || 7;
  const range = _pdRangeIso(days);
  const [summary, sections, caregiverDelivery, caregiverFailures] = await Promise.all([
    api.patientDigestSummary(range),
    api.patientDigestSections(range),
    api.patientDigestCaregiverDeliverySummary(range),
    api.patientDigestCaregiverDeliveryFailures(range),
  ]);

  if (!summary) {
    el.innerHTML = `<div style="padding:48px;max-width:640px;margin:0 auto;text-align:center">
      <div style="font-size:32px;margin-bottom:8px">&#9676;</div>
      <h2 style="margin:0 0 8px;font-size:18px;color:var(--text-primary)">Digest unavailable</h2>
      <p style="color:var(--text-muted);font-size:13px;line-height:1.55">We could not load your digest right now. Please check back later. The page does not show data we cannot verify.</p>
    </div>`;
    return;
  }

  if (summary.is_demo) {
    api.postPatientDigestAuditEvent({ event: 'demo_banner_shown', using_demo_data: true });
  }

  const noActivity = (summary.sessions_completed === 0)
    && (summary.adherence_streak_days === 0)
    && (summary.symptom_entries === 0)
    && (summary.pending_messages === 0)
    && (summary.new_reports === 0)
    && Object.values(summary.wellness_axes_trends || {}).every(v => v.current == null);

  const trends = summary.wellness_axes_trends || {};
  const axesHtml = ['mood', 'energy', 'sleep', 'anxiety', 'focus', 'pain']
    .map(a => _pdAxisCard(a, trends[a])).join('');

  const banner = summary.is_demo
    ? `<div style="background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.35);border-radius:10px;padding:10px 14px;margin-bottom:16px;font-size:12.5px;color:#fbbf24">
        DEMO mode &mdash; this account is in demo. Exports are DEMO-prefixed and not regulator-submittable.
      </div>` : '';

  const rangePicker = `<div style="display:flex;gap:8px;margin-bottom:16px">
    <button onclick="window._pdRangeChange(7)" style="flex:1;padding:8px 12px;border-radius:8px;border:1px solid var(--border);background:${days === 7 ? 'rgba(45,212,191,0.15)' : 'transparent'};color:var(--text-primary);font-size:12.5px;cursor:pointer">Last 7 days</button>
    <button onclick="window._pdRangeChange(30)" style="flex:1;padding:8px 12px;border-radius:8px;border:1px solid var(--border);background:${days === 30 ? 'rgba(45,212,191,0.15)' : 'transparent'};color:var(--text-primary);font-size:12.5px;cursor:pointer">Last 30 days</button>
  </div>`;

  const summaryCard = `<div style="background:rgba(45,212,191,0.06);border:1px solid rgba(45,212,191,0.25);border-radius:14px;padding:18px;margin-bottom:18px">
    <div style="font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:var(--teal);margin-bottom:10px">This Week</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:14px">
      <div><div style="font-size:24px;font-weight:700;color:var(--text-primary)">${summary.sessions_completed}</div><div style="font-size:11px;color:var(--text-muted)">Sessions completed</div></div>
      <div><div style="font-size:24px;font-weight:700;color:var(--text-primary)">${summary.adherence_streak_days}</div><div style="font-size:11px;color:var(--text-muted)">Adherence streak (days)</div></div>
      <div><div style="font-size:24px;font-weight:700;color:var(--text-primary)">${summary.pending_messages}</div><div style="font-size:11px;color:var(--text-muted)">Pending messages</div></div>
      <div><div style="font-size:24px;font-weight:700;color:var(--text-primary)">${summary.new_reports}</div><div style="font-size:11px;color:var(--text-muted)">New reports</div></div>
    </div>
  </div>`;

  const sectionCards = (sections && sections.sections ? sections.sections : []).map(sec => {
    const page = (sec.drill_out_url || '').replace(/^\?page=/, '');
    return `<div style="border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:10px;background:rgba(255,255,255,0.02)">
      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:6px">
        <div style="font-size:14px;font-weight:600;color:var(--text-primary);text-transform:capitalize">${_pdEsc(sec.section)}</div>
        <div style="font-size:18px;font-weight:700;color:var(--teal)">${sec.count}</div>
      </div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">${_pdEsc(JSON.stringify(sec.detail))}</div>
      ${page ? `<button onclick="window._pdDrillOut('${_pdEsc(sec.section)}','${_pdEsc(page)}')" style="background:transparent;border:1px solid var(--border);color:var(--teal);border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer">Open ${_pdEsc(sec.section)} &rarr;</button>` : ''}
    </div>`;
  }).join('');

  const wellnessSection = `<div style="margin-top:20px">
    <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:10px">Wellness trend (vs. previous ${days} days)</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px">${axesHtml}</div>
  </div>`;

  const ctas = `<div style="display:flex;gap:8px;margin-top:18px;flex-wrap:wrap">
    <button onclick="window._pdSendEmail()" style="padding:9px 14px;border-radius:8px;border:1px solid rgba(45,212,191,0.45);background:rgba(45,212,191,0.1);color:var(--teal);font-size:12.5px;cursor:pointer">&#9993; Email me this digest</button>
    <button onclick="window._pdShareCaregiver()" style="padding:9px 14px;border-radius:8px;border:1px solid var(--border);background:transparent;color:var(--text-primary);font-size:12.5px;cursor:pointer">&#8599; Share with caregiver</button>
  </div>
  <div style="margin-top:8px;font-size:11px;color:var(--text-muted);line-height:1.5">
    Email and caregiver-share record an audit entry. Actual delivery requires the email service to be wired up; until then delivery_status='queued' means the audit entry is recorded and the recipient is captured.
  </div>`;

  // Caregiver delivery confirmations — patient-side reflection of the
  // caregiver_portal.email_digest_sent audit rows. Renders one row per
  // active grant with the count of confirmed deliveries this period.
  // Anonymised: first name only, never email or full name.
  const caregiverRows = (caregiverDelivery && Array.isArray(caregiverDelivery.rows))
    ? caregiverDelivery.rows : [];
  const caregiverDeliveryHtml = caregiverDelivery
    ? `<div style="margin-top:24px;padding:14px 16px;border:1px solid var(--border);border-radius:12px;background:rgba(255,255,255,0.02)">
        <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:8px">
          <div style="font-size:13px;font-weight:600;color:var(--text-primary)">Caregiver delivery confirmations</div>
          <div style="font-size:11px;color:var(--text-muted)">${caregiverDelivery.total_delivered_count || 0} this period</div>
        </div>
        <div style="font-size:11.5px;color:var(--text-muted);line-height:1.5;margin-bottom:8px">
          Each row reflects a confirmed digest dispatch to a caregiver you have granted active consent. Counts come from the audit transcript (delivery_status=sent only); failed and queued attempts are intentionally excluded.
        </div>
        ${caregiverRows.length === 0
          ? `<div style="font-size:12px;color:var(--text-muted);font-style:italic">No caregivers with active consent grants. Use Share with caregiver above to mint a consent grant first.</div>`
          : caregiverRows.map(r => {
              const name = r.caregiver_first_name ? _pdEsc(r.caregiver_first_name) : 'Caregiver';
              const last = r.last_delivered_at ? _pdEsc(String(r.last_delivered_at).slice(0, 10)) : '—';
              // Caregiver Delivery Acknowledgement launch-audit
              // (2026-05-01). Patient-side "Last confirmed" stamp +
              // "Awaiting confirmation" tag when the caregiver has
              // landed deliveries but has not yet pressed "I received
              // it". A row with zero deliveries shows neither.
              const ackIso = r.last_acknowledged_at;
              const delivered = (r.digests_delivered_count || 0);
              // Multi-Adapter Delivery Parity launch-audit (2026-05-01).
              // Per-row channel chip ("via email" / "via sms" / "via
              // slack" / "via pagerduty") for the most recent landed
              // dispatch. Channel-agnostic; the "Last confirmed" stamp
              // above is also channel-agnostic. ``null`` for legacy
              // rows that pre-date the channel-chip launch.
              const channel = r.last_delivered_channel;
              const channelHtml = channel
                ? `<span data-testid="pd-cg-channel-chip" style="display:inline-block;margin-left:6px;padding:1px 7px;border-radius:999px;background:rgba(45,212,191,0.14);color:#2dd4bf;font-size:9.5px;font-weight:600;text-transform:uppercase;letter-spacing:0.4px">via ${_pdEsc(channel)}</span>`
                : '';
              let confirmHtml = '';
              if (ackIso) {
                const rel = _pdRelativeTime(ackIso);
                confirmHtml = `<div data-testid="pd-cg-last-confirmed" style="font-size:11px;color:#2dd4bf;margin-top:2px">Last confirmed: ${_pdEsc(rel)}</div>`;
              } else if (delivered > 0) {
                confirmHtml = `<div data-testid="pd-cg-awaiting-confirm" style="font-size:11px;color:#fbbf24;margin-top:2px">Awaiting confirmation</div>`;
              }
              // Clinic Caregiver Channel Override launch-audit (2026-05-01).
              // Per-row "Will dispatch via {channel}" tag — loaded
              // asynchronously after render so the patient sees an
              // honest preview of the resolved chain that the next
              // dispatch will use. The placeholder span is empty until
              // the preview lands; on offline / 404 it stays empty.
              const cgIdAttr = _pdEsc(r.caregiver_user_id || '');
              const willDispatchPlaceholder = r.caregiver_user_id
                ? `<span data-testid="pd-cg-will-dispatch-via" data-caregiver-user-id="${cgIdAttr}" style="display:inline-block;margin-left:6px;padding:1px 7px;border-radius:999px;background:rgba(120,120,120,0.10);color:var(--text-muted);font-size:9.5px;font-weight:600;text-transform:uppercase;letter-spacing:0.4px"></span>`
                : '';
              return `<div data-testid="pd-cg-delivery-row" data-caregiver-user-id="${cgIdAttr}" style="display:flex;justify-content:space-between;align-items:baseline;padding:8px 0;border-top:1px solid var(--border)">
                <div>
                  <div style="font-size:12.5px;color:var(--text-primary)">${name}${channelHtml}${willDispatchPlaceholder}</div>
                  <div style="font-size:11px;color:var(--text-muted)">Last delivered: ${last}</div>
                  ${confirmHtml}
                </div>
                <div style="font-size:16px;font-weight:700;color:var(--teal)">${delivered}</div>
              </div>`;
            }).join('')
        }
      </div>` : '';

  const emptyState = `<div style="border:1px dashed var(--border);border-radius:12px;padding:24px;text-align:center;color:var(--text-muted);font-size:13px;line-height:1.55">
    No activity to summarise yet for this period. Log a session, complete a check-in, or message your care team &mdash; and your digest will populate here.
  </div>`;

  // Caregiver delivery problems — patient-side aggregator of the
  // failed dispatches the SendGrid adapter logged in the audit
  // transcript. Each row gets a "Report problem" CTA that opens a
  // modal for a required concern note. The modal POSTs to
  // /caregiver-delivery-concerns which emits both the patient-scope
  // audit row + the clinician-mirror HIGH-priority row.
  const failureRows = (caregiverFailures && Array.isArray(caregiverFailures.rows))
    ? caregiverFailures.rows : [];
  window._pdLastFailures = failureRows.slice();
  const caregiverFailuresHtml = (failureRows.length === 0)
    ? ''
    : `<div data-testid="pd-delivery-failures" style="margin-top:18px;padding:14px 16px;border:1px solid rgba(239,68,68,0.35);border-radius:12px;background:rgba(239,68,68,0.06)">
        <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:8px">
          <div style="font-size:13px;font-weight:600;color:#f87171">Caregiver delivery problems</div>
          <div style="font-size:11px;color:var(--text-muted)">${failureRows.length} failed dispatch${failureRows.length === 1 ? '' : 'es'}</div>
        </div>
        <div style="font-size:11.5px;color:var(--text-muted);line-height:1.5;margin-bottom:8px">
          The audit transcript shows these dispatches did not reach the caregiver. Use &ldquo;Report problem&rdquo; to flag a concern &mdash; the clinician inbox will surface it under HIGH priority for follow-up.
        </div>
        ${failureRows.map(r => {
          const name = r.caregiver_first_name ? _pdEsc(r.caregiver_first_name) : 'Caregiver';
          const ts = r.dispatch_attempt_at ? _pdEsc(String(r.dispatch_attempt_at).slice(0, 19).replace('T', ' ')) : '—';
          const errLabel = r.error_summary ? _pdEsc(String(r.error_summary).slice(0, 120)) : 'unknown error';
          const dispatch = _pdEsc(r.dispatch_id || '');
          return `<div data-testid="pd-failure-row" style="padding:10px 0;border-top:1px solid rgba(239,68,68,0.2)">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">
              <div style="flex:1;min-width:0">
                <div style="font-size:12.5px;color:var(--text-primary)"><strong>${name}</strong></div>
                <div style="font-size:11px;color:var(--text-muted)">Attempted: ${ts}</div>
                <div style="font-size:11px;color:#f87171;margin-top:2px">${errLabel}</div>
              </div>
              <button data-testid="pd-report-problem" onclick="window._pdOpenConcernModal('${dispatch}')" style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.45);color:#f87171;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer">Report problem</button>
            </div>
          </div>`;
        }).join('')}
      </div>`;

  el.innerHTML = `<div style="max-width:760px;margin:0 auto;padding:20px 16px">
    ${banner}
    ${rangePicker}
    ${summaryCard}
    ${noActivity ? emptyState : `
      <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:8px">Sections</div>
      ${sectionCards}
      ${wellnessSection}
    `}
    ${ctas}
    ${caregiverFailuresHtml}
    ${caregiverDeliveryHtml}
    <div id="pd-concern-modal-mount"></div>
  </div>`;

  // Clinic Caregiver Channel Override launch-audit (2026-05-01).
  // Hydrate the per-row "Will dispatch via {channel}" tags after render
  // so each caregiver delivery confirmation row carries an honest
  // preview of the next dispatch's resolved chain. Best-effort: silent
  // when the helper is missing, the backend is unreachable, or the
  // caregiver_user_id doesn't match a row.
  if (typeof api.caregiverEmailDigestPreviewDispatch === 'function') {
    const placeholders = el ? el.querySelectorAll('[data-testid="pd-cg-will-dispatch-via"][data-caregiver-user-id]') : [];
    for (const ph of placeholders) {
      const cid = ph.getAttribute('data-caregiver-user-id');
      if (!cid) continue;
      try {
        const dp = await Promise.race([
          api.caregiverEmailDigestPreviewDispatch(cid),
          new Promise((_, rej) => setTimeout(() => rej('timeout'), 4000)),
        ]).catch(() => null);
        if (dp && dp.will_dispatch_via && dp.will_dispatch_via !== '-') {
          ph.textContent = 'via ' + dp.will_dispatch_via;
          if (dp.honored_caregiver_preference) {
            ph.style.background = 'rgba(45,212,191,0.14)';
            ph.style.color = '#2dd4bf';
          } else if (dp.caregiver_preferred_channel) {
            // Falls-back state — caregiver picked a channel that's not configured.
            ph.style.background = 'rgba(251,191,36,0.16)';
            ph.style.color = '#d97706';
            ph.title = 'Caregiver picked ' + dp.caregiver_preferred_channel + ', falls back to ' + dp.will_dispatch_via;
          }
        }
      } catch (_e) { /* silent */ }
    }
  }
}

// Concern modal — required note textarea, ESC closes, Enter does NOT
// submit (long-form text). The submit handler POSTs the concern and
// re-renders the page so the failure row shows an "(reported)" badge
// next to the existing CTA via a window-level set we keep in memory.
window._pdReportedDispatchIds = window._pdReportedDispatchIds || new Set();

window._pdOpenConcernModal = function(dispatchId) {
  api.postPatientDigestAuditEvent({ event: 'delivery_concern_initiated', note: 'dispatch=' + String(dispatchId) });
  const mount = document.getElementById('pd-concern-modal-mount');
  if (!mount) return;
  const dispEsc = _pdEsc(String(dispatchId || ''));
  mount.innerHTML = `<div data-testid="pd-concern-modal" style="position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:1000">
    <div style="max-width:480px;width:90%;background:var(--surface,#0f172a);border:1px solid var(--border);border-radius:14px;padding:18px">
      <div style="font-size:15px;font-weight:600;color:var(--text-primary);margin-bottom:6px">Report a delivery problem</div>
      <div style="font-size:11.5px;color:var(--text-muted);line-height:1.5;margin-bottom:10px">
        Tell us what went wrong. Your clinician's inbox will pick this concern up under HIGH priority. The dispatch reference is recorded automatically.
      </div>
      <textarea data-testid="pd-concern-textarea" id="pd-concern-text" rows="4" style="width:100%;background:transparent;border:1px solid var(--border);border-radius:8px;padding:8px;font-size:12.5px;color:var(--text-primary);resize:vertical" placeholder="Describe the problem (required)…"></textarea>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px">
        <button data-testid="pd-concern-cancel" onclick="window._pdCloseConcernModal()" style="padding:7px 12px;border-radius:7px;border:1px solid var(--border);background:transparent;color:var(--text-primary);font-size:12.5px;cursor:pointer">Cancel</button>
        <button data-testid="pd-concern-submit" onclick="window._pdSubmitConcern('${dispEsc}')" style="padding:7px 12px;border-radius:7px;border:1px solid rgba(45,212,191,0.45);background:rgba(45,212,191,0.1);color:var(--teal);font-size:12.5px;cursor:pointer">Submit concern</button>
      </div>
    </div>
  </div>`;
};

window._pdCloseConcernModal = function() {
  const mount = document.getElementById('pd-concern-modal-mount');
  if (mount) mount.innerHTML = '';
};

window._pdSubmitConcern = async function(dispatchId) {
  const ta = document.getElementById('pd-concern-text');
  const text = ((ta && ta.value) || '').trim();
  if (!text) {
    window.alert('Please describe the problem before submitting.');
    return;
  }
  try {
    const res = await api.patientDigestCaregiverDeliveryConcern({
      dispatch_id: String(dispatchId || ''),
      concern_text: text,
    });
    if (res && res.accepted) {
      window._pdReportedDispatchIds.add(String(dispatchId || ''));
      window.alert('Concern recorded. Your clinician will pick this up under HIGH priority.');
    } else {
      window.alert('Could not record concern. Please try again.');
    }
  } catch (e) {
    window.alert('Could not record concern: ' + (e && e.message ? e.message : 'unknown error'));
  }
  window._pdCloseConcernModal();
  await pgPatientDigest(setTopbar);
};
