import sys, os
sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

path = 'apps/web/src/pages-courses.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

old_start_marker = 'window._rqSetTopbar = setTopbar;\n  window._rqNavigate  = navigate;\n\n  const el'
old_end_marker   = '\n\n}\n\n// \u2500\u2500 pgOutcomes'
idx_old_start = content.find(old_start_marker)
idx_old_end   = content.find(old_end_marker, idx_old_start)

if idx_old_start < 0 or idx_old_end < 0:
    print(f'ERROR: markers not found! start={idx_old_start} end={idx_old_end}')
    sys.exit(1)

print(f'Found old body: chars {idx_old_start}..{idx_old_end} ({idx_old_end-idx_old_start} chars)')

NEW_BODY = r"""window._rqSetTopbar = setTopbar;
  window._rqNavigate  = navigate;

  const el = document.getElementById('content');
  el.innerHTML = spinner();

  // ── SLA / urgency helpers ──────────────────────────────────────────────────
  function isOverdue(item) {
    if (item.status !== 'pending' && item.status !== 'assigned' && item.status !== 'in-review') return false;
    const ts = item.submitted_at || item.created_at;
    if (!ts) return false;
    return (now - new Date(ts).getTime()) > 48 * 3600 * 1000;
  }

  function isUrgent(item) {
    if (isOverdue(item)) return true;
    if (item.type === 'adverse-event' && (item.severity === 'Severe' || item.severity === 'Serious')) return true;
    return false;
  }

  function priorityScore(item) {
    let s = 0;
    if (item.status === 'pending')   s += 10;
    if (item.status === 'assigned')  s += 8;
    if (item.status === 'in-review') s += 6;
    if (isOverdue(item)) s += 20;
    if (item.type === 'adverse-event') s += 15;
    if (item.type === 'off-label') s += 8;
    return s;
  }

  function slaBadge(item) {
    if (!isOverdue(item)) return '';
    return `<span class="badge badge-red" style="font-size:9.5px;margin-left:6px;">OVERDUE</span>`;
  }

  function aeSeverityBadge(sev) {
    const colors = { Mild:'#22c55e', Moderate:'#f59e0b', Severe:'#ef4444', Serious:'#dc2626' };
    const c = colors[sev] || '#888';
    return `<span style="font-size:10px;font-weight:700;color:${c};background:${c}22;padding:2px 7px;border-radius:4px;">${esc(sev||'')}</span>`;
  }

  function statCard(val, label, color) {
    return `<div class="stat-card" style="flex:1;min-width:120px;border-left:3px solid ${color};">
      <div class="stat-value" style="color:${color};">${val}</div>
      <div class="stat-label">${label}</div>
    </div>`;
  }

  function typeBadge(type) {
    const t = REVIEW_TYPES[type] || { label: type, icon: '', cssClass: 'rq-type-protocol' };
    return `<span class="rq-type-badge ${t.cssClass}">${t.icon} ${t.label}</span>`;
  }

  function stateBadge(status) {
    const color = STATE_COLORS[status] || '#888';
    return `<span style="font-size:10px;font-weight:700;color:${color};background:${color}22;padding:2px 7px;border-radius:4px;text-transform:uppercase;">${esc(status||'')}</span>`;
  }

  function stateTimeline(currentState) {
    const steps = ['pending','assigned','in-review','resolved'];
    const terminalMap = { approved:'resolved','signed-off':'resolved', rejected:'resolved', escalated:'resolved','changes-requested':'resolved' };
    const resolved = ['approved','signed-off','rejected','escalated','changes-requested'];
    const effectiveState = terminalMap[currentState] || currentState;
    const isRejected = currentState === 'rejected';
    const isApproved = currentState === 'approved' || currentState === 'signed-off';

    function dotClass(step, i) {
      const stepIdx = steps.indexOf(step);
      const curIdx  = steps.indexOf(effectiveState);
      if (stepIdx < curIdx) return isRejected && step === 'resolved' ? 'rejected' : 'done';
      if (stepIdx === curIdx) return isApproved && step === 'resolved' ? 'approved' : isRejected && step === 'resolved' ? 'rejected' : 'active';
      return '';
    }
    function lineClass(i) {
      const curIdx = steps.indexOf(effectiveState);
      return i < curIdx ? 'done' : '';
    }

    let html = '<div class="rq-state-pipeline">';
    steps.forEach((step, i) => {
      const dc = dotClass(step, i);
      html += `<div style="display:flex;flex-direction:column;align-items:center;">
        <div class="rq-state-dot${dc ? ' ' + dc : ''}"></div>
        <div class="rq-state-label">${step === 'in-review' ? 'in review' : step}</div>
      </div>`;
      if (i < steps.length - 1) {
        html += `<div class="rq-state-line${lineClass(i) ? ' ' + lineClass(i) : ''}"></div>`;
      }
    });
    html += '</div>';
    return html;
  }

  function typeDetailHtml(item) {
    function fr(label, val) {
      if (!val) return '';
      return `<div style="margin:4px 0;font-size:12.5px;"><span style="color:var(--text-tertiary);min-width:120px;display:inline-block;">${label}</span> <span style="color:var(--text-primary);">${esc(String(val))}</span></div>`;
    }
    function govFlag(key, label) {
      if (!item.governance || !item.governance[key]) return '';
      return `<span class="badge badge-amber" style="font-size:10px;margin-right:4px;">${label}</span>`;
    }

    if (item.type === 'off-label') {
      return `<div style="background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.15);border-radius:8px;padding:10px 14px;margin:8px 0;">
        ${fr('Condition', item.condition)}
        ${fr('Modality', item.modality)}
        ${fr('Protocol', item.protocol_name)}
        ${fr('Evidence Grade', item.evidence_grade)}
        ${fr('Requested by', item.requested_by)}
        <div style="margin-top:6px;">
          ${govFlag('off_label_acknowledgement_required','Off-label ack. required')}
          ${govFlag('dual_review_required','Dual review')}
          ${govFlag('requires_clinician_sign_off','Clinician sign-off')}
        </div>
        ${item.rationale ? `<div style="margin-top:8px;font-size:12px;color:var(--text-secondary);font-style:italic;">"${esc(item.rationale)}"</div>` : ''}
      </div>`;
    }

    if (item.type === 'ai-note') {
      return `<div style="background:rgba(139,92,246,.06);border:1px solid rgba(139,92,246,.15);border-radius:8px;padding:10px 14px;margin:8px 0;">
        ${fr('Patient', item.patient_name || item.patient_id)}
        ${fr('Session', item.session_label)}
        ${fr('Note type', item.note_type)}
        ${fr('Generated', item.generated_at ? new Date(item.generated_at).toLocaleDateString() : '')}
        ${item.ai_draft ? `<div style="margin-top:8px;"><div style="font-size:11px;color:var(--text-tertiary);margin-bottom:4px;">AI DRAFT</div><pre style="background:rgba(0,0,0,.2);border-radius:6px;padding:10px;font-size:11.5px;white-space:pre-wrap;color:var(--text-secondary);max-height:120px;overflow-y:auto;">${esc(item.ai_draft)}</pre></div>` : ''}
      </div>`;
    }

    if (item.type === 'protocol') {
      return `<div style="background:rgba(59,130,246,.06);border:1px solid rgba(59,130,246,.15);border-radius:8px;padding:10px 14px;margin:8px 0;">
        ${fr('Protocol', item.protocol_name)}
        ${fr('Condition', item.condition)}
        ${fr('Modality', item.modality)}
        ${fr('Evidence Grade', item.evidence_grade)}
        ${fr('On/Off label', item.on_label_vs_off_label)}
        ${fr('Submitted by', item.requested_by)}
        ${item.change_summary ? `<div style="margin-top:6px;font-size:12px;color:var(--text-secondary);">${esc(item.change_summary)}</div>` : ''}
      </div>`;
    }

    if (item.type === 'consent') {
      const signed = item.patient_signed && item.clinician_signed;
      const sigStatus = signed
        ? `<span style="color:#22c55e;font-weight:600;">&#10003; Both parties signed</span>`
        : !item.patient_signed && !item.clinician_signed
          ? `<span style="color:#ef4444;">&#x26A0; Awaiting both signatures</span>`
          : item.patient_signed
            ? `<span style="color:#f59e0b;">Patient signed — awaiting clinician</span>`
            : `<span style="color:#f59e0b;">Clinician signed — awaiting patient</span>`;
      return `<div class="rq-consent-sig">
        <span style="font-size:16px;">&#x270D;</span>
        <div>
          ${fr('Document', item.document_type)}
          ${fr('Patient', item.patient_name || item.patient_id)}
          <div style="margin-top:6px;">${sigStatus}</div>
        </div>
      </div>`;
    }

    if (item.type === 'adverse-event') {
      return `<div style="background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.15);border-radius:8px;padding:10px 14px;margin:8px 0;">
        ${fr('Patient', item.patient_name || item.patient_id)}
        ${fr('Event', item.event_description)}
        <div style="margin:4px 0;font-size:12.5px;"><span style="color:var(--text-tertiary);min-width:120px;display:inline-block;">Severity</span> ${aeSeverityBadge(item.severity)}</div>
        ${fr('Occurred', item.occurred_at ? new Date(item.occurred_at).toLocaleDateString() : '')}
        ${fr('Reported by', item.reported_by)}
        ${item.action_taken ? `<div style="margin-top:6px;font-size:12px;color:var(--text-secondary);">Action taken: ${esc(item.action_taken)}</div>` : ''}
      </div>`;
    }

    return '';
  }

  function decisionOptions(type, item) {
    if (type === 'consent') {
      return [
        { value: 'signed-off', label: '&#x270D; Sign &amp; Approve', cls: 'btn-primary' },
        { value: 'changes-requested', label: 'Request Changes', cls: 'btn-outline' },
        { value: 'rejected', label: 'Reject', cls: 'btn-danger' },
      ];
    }
    if (type === 'ai-note') {
      return [
        { value: 'approved', label: '&#10003; Accept Note', cls: 'btn-primary' },
        { value: 'changes-requested', label: '&#9998; Edit &amp; Re-draft', cls: 'btn-outline' },
        { value: 'rejected', label: '&#128465; Discard Draft', cls: 'btn-danger' },
      ];
    }
    if (type === 'adverse-event') {
      return [
        { value: 'escalated', label: '&#9650; Escalate', cls: 'btn-danger' },
        { value: 'approved', label: '&#10003; Acknowledge &amp; Monitor', cls: 'btn-primary' },
        { value: 'rejected', label: 'Dismiss', cls: 'btn-outline' },
      ];
    }
    // off-label, protocol
    return [
      { value: 'approved', label: '&#10003; Approve', cls: 'btn-primary' },
      { value: 'changes-requested', label: 'Request Changes', cls: 'btn-outline' },
      { value: 'rejected', label: '&#10005; Reject', cls: 'btn-danger' },
      { value: 'escalated', label: '&#9650; Escalate', cls: 'btn-outline' },
    ];
  }

  function rqCard(item) {
    const tid  = REVIEW_TYPES[item.type] || { label: item.type, icon: '', cssClass: 'rq-type-protocol' };
    const urgentBorder = isUrgent(item) ? 'border-color:rgba(239,68,68,.35);' : '';
    const isTerminal   = ['approved','signed-off','rejected','escalated'].includes(item.status);
    const curDecision  = window._rqDecision[item.id] || '';

    // Reviewer options
    const reviewerOpts = REVIEWERS.map(r =>
      `<option value="${esc(r)}" ${item.assigned_to === r ? 'selected' : ''}>${esc(r)}</option>`
    ).join('');

    // Decision radio buttons
    const decisions = decisionOptions(item.type, item);
    const decisionBtns = decisions.map(d => `
      <label style="cursor:pointer;display:inline-flex;align-items:center;gap:5px;margin-right:8px;font-size:12.5px;">
        <input type="radio" name="rq-dec-${esc(item.id)}" value="${d.value}"
          onchange="window._rqSetDecision('${esc(item.id)}','${d.value}')"
          ${curDecision === d.value ? 'checked' : ''} style="accent-color:var(--teal);">
        ${d.label}
      </label>`).join('');

    // History entries
    const historyHtml = (item.history || []).slice(-4).reverse().map(h => `
      <div style="font-size:11px;color:var(--text-tertiary);padding:3px 0;border-bottom:1px solid rgba(255,255,255,.04);">
        <span style="font-weight:500;color:var(--text-secondary);">${esc(h.action||h.status||'')}</span>
        ${h.by ? ` · ${esc(h.by)}` : ''}
        ${h.at ? ` · ${new Date(h.at).toLocaleDateString()}` : ''}
        ${h.note ? `<br><span style="font-style:italic;">${esc(h.note)}</span>` : ''}
      </div>`).join('');

    return `<div class="protocol-card" style="margin-bottom:12px;${urgentBorder}" id="rq-card-${esc(item.id)}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;">
        <div>
          ${typeBadge(item.type)}
          ${slaBadge(item)}
          <span style="font-size:12.5px;font-weight:600;color:var(--text-primary);margin-left:8px;">${esc(item.title||item.id)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          ${stateBadge(item.status)}
          <button class="btn-icon" onclick="window._rqToggle('${esc(item.id)}')" title="Expand/collapse">&#9660;</button>
        </div>
      </div>

      <div style="font-size:11.5px;color:var(--text-tertiary);margin-top:4px;">
        Submitted ${item.submitted_at ? new Date(item.submitted_at).toLocaleDateString() : 'unknown'}
        ${item.assigned_to ? ` &middot; Assigned to <strong style="color:var(--text-secondary);">${esc(item.assigned_to)}</strong>` : ''}
      </div>

      ${stateTimeline(item.status)}

      <div id="rq-body-${esc(item.id)}" style="${window._rqDecision[item.id] !== undefined ? '' : 'display:none;'}">
        ${typeDetailHtml(item)}

        ${!isTerminal ? `
        <div style="margin-top:10px;">
          <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;">Assign reviewer</div>
          <select class="filter-select" style="font-size:12px;padding:5px 10px;margin-right:8px;"
            onchange="window._rqAssign('${esc(item.id)}', this.value)">
            <option value="">— select reviewer —</option>
            ${reviewerOpts}
          </select>
        </div>
        <div style="margin-top:12px;">
          <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;">Decision</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px;">${decisionBtns}</div>
          <textarea id="rq-note-${esc(item.id)}" placeholder="Add a note (optional)…"
            style="width:100%;background:rgba(0,0,0,.2);border:1px solid rgba(255,255,255,.1);border-radius:6px;padding:8px;color:var(--text-primary);font-size:12.5px;resize:vertical;min-height:60px;box-sizing:border-box;"></textarea>
          <button class="btn-primary" style="margin-top:8px;font-size:12.5px;"
            onclick="window._rqSubmit('${esc(item.id)}')">Submit Decision</button>
        </div>` : `
        <div class="notice-ok" style="margin-top:10px;font-size:12.5px;">
          &#10003; This item is <strong>${esc(item.status)}</strong>${item.resolved_by ? ` by ${esc(item.resolved_by)}` : ''}.
          ${item.resolution_note ? `<br><em>${esc(item.resolution_note)}</em>` : ''}
        </div>`}

        ${historyHtml ? `<div style="margin-top:12px;border-top:1px solid rgba(255,255,255,.06);padding-top:8px;"><div style="font-size:10px;color:var(--text-tertiary);margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px;">History</div>${historyHtml}</div>` : ''}
      </div>
    </div>`;
  }

  function auditTrailHtml(filter) {
    const trail = readAudit();
    const filterOpts = ['all','assign','submit','export','resolve-ae'].map(f =>
      `<option value="${f}" ${filter===f?'selected':''}>${f === 'all' ? 'All events' : f}</option>`
    ).join('');
    const filtered = filter && filter !== 'all'
      ? trail.filter(e => (e.action||'').toLowerCase().includes(filter))
      : trail;
    const rows = filtered.slice(0, 100).map(e => {
      const dotColor = e.status ? (STATE_COLORS[e.status] || '#888') : '#60a5fa';
      return `<li class="rq-audit-item">
        <div class="rq-audit-dot" style="background:${dotColor};"></div>
        <div class="rq-audit-body">
          <div class="rq-audit-action">${esc(e.action||e.type||'Event')}</div>
          <div class="rq-audit-meta">
            ${e.item_id ? `Item <strong>${esc(e.item_id)}</strong> &middot; ` : ''}
            ${e.reviewer ? `${esc(e.reviewer)} &middot; ` : ''}
            ${e.created_at ? new Date(e.created_at).toLocaleString() : ''}
          </div>
          ${e.note ? `<div class="rq-audit-note">"${esc(e.note)}"</div>` : ''}
        </div>
      </li>`;
    }).join('');
    return `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
      <select class="filter-select" style="font-size:12px;" onchange="window._rqRenderAudit(this.value)">${filterOpts}</select>
      <span style="font-size:11px;color:var(--text-tertiary);">${filtered.length} events</span>
    </div>
    ${rows ? `<ul class="rq-audit-timeline">${rows}</ul>` : '<p style="color:var(--text-tertiary);font-size:13px;text-align:center;padding:24px 0;">No audit events yet.</p>'}`;
  }

  // ── Summary stats ──────────────────────────────────────────────────────────
  const pendingItems  = items.filter(i => i.status === 'pending').length;
  const overdueItems  = items.filter(i => isOverdue(i)).length;
  const approvedToday = items.filter(i => {
    if (!['approved','signed-off'].includes(i.status)) return false;
    const d = i.resolved_at || i.updated_at;
    return d && new Date(d).toDateString() === new Date().toDateString();
  }).length;
  const seriousAECount = openAEs.filter(ae =>
    ae.severity === 'Serious' || ae.severity === 'Severe'
  ).length;

  // ── Tabs ───────────────────────────────────────────────────────────────────
  const TABS = [
    { id: 'all',           label: 'All',            count: items.length },
    { id: 'off-label',     label: 'Off-Label',      count: items.filter(i=>i.type==='off-label').length },
    { id: 'ai-note',       label: 'AI Notes',       count: items.filter(i=>i.type==='ai-note').length },
    { id: 'protocol',      label: 'Protocol',       count: items.filter(i=>i.type==='protocol').length },
    { id: 'consent',       label: 'Consent',        count: items.filter(i=>i.type==='consent').length },
    { id: 'adverse-event', label: 'Adverse Events', count: openAEs.length },
    { id: 'audit',         label: 'Audit Trail',    count: readAudit().length },
  ];

  const tabsHtml = `<div class="rq-tabs">` + TABS.map(t => {
    const isUrgentTab = t.id === 'adverse-event' && seriousAECount > 0;
    return `<div class="rq-tab${window._rqActiveTab===t.id?' active':''}"
      onclick="window._rqTab('${t.id}')">
      ${t.label}<span class="rq-tab-count${isUrgentTab?' urgent':''}">${t.count}</span>
    </div>`;
  }).join('') + `</div>`;

  function renderTab(tabId) {
    window._rqActiveTab = tabId;
    const tabContent = document.getElementById('rq-tab-content');
    if (!tabContent) return;

    if (tabId === 'audit') {
      tabContent.innerHTML = auditTrailHtml('all');
      return;
    }

    if (tabId === 'adverse-event') {
      const aeRows = openAEs.map(ae => `
        <tr>
          <td style="padding:8px 12px;">${esc(ae.patient_name||ae.patient_id||'')}</td>
          <td style="padding:8px 12px;">${esc(ae.event_description||'')}</td>
          <td style="padding:8px 12px;">${aeSeverityBadge(ae.severity)}</td>
          <td style="padding:8px 12px;font-size:11.5px;color:var(--text-tertiary);">${ae.occurred_at ? new Date(ae.occurred_at).toLocaleDateString() : ''}</td>
          <td style="padding:8px 12px;">
            <button class="btn-primary" style="font-size:11.5px;padding:4px 10px;"
              onclick="window._rqResolveAE('${esc(ae.id)}',this)">&#10003; Resolve</button>
          </td>
        </tr>`).join('');
      tabContent.innerHTML = aeRows
        ? `<table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead><tr style="color:var(--text-tertiary);font-size:11px;text-transform:uppercase;">
              <th style="padding:6px 12px;text-align:left;font-weight:500;">Patient</th>
              <th style="padding:6px 12px;text-align:left;font-weight:500;">Event</th>
              <th style="padding:6px 12px;text-align:left;font-weight:500;">Severity</th>
              <th style="padding:6px 12px;text-align:left;font-weight:500;">Date</th>
              <th style="padding:6px 12px;text-align:left;font-weight:500;">Action</th>
            </tr></thead>
            <tbody>${aeRows}</tbody>
          </table>`
        : `<p style="color:var(--text-tertiary);font-size:13px;text-align:center;padding:32px 0;">No open adverse events.</p>`;
      return;
    }

    const filtered = tabId === 'all'
      ? [...items].sort((a,b) => priorityScore(b) - priorityScore(a))
      : items.filter(i => i.type === tabId).sort((a,b) => priorityScore(b) - priorityScore(a));

    if (!filtered.length) {
      tabContent.innerHTML = `<p style="color:var(--text-tertiary);font-size:13px;text-align:center;padding:32px 0;">No items in this category.</p>`;
      return;
    }
    tabContent.innerHTML = filtered.map(rqCard).join('');
  }

  // ── Rebuild tabs bar helper ────────────────────────────────────────────────
  function rebuildTabs() {
    const tabsEl = document.getElementById('rq-tabs-bar');
    if (!tabsEl) return;
    const newTabs = [
      { id: 'all',           label: 'All',            count: items.length },
      { id: 'off-label',     label: 'Off-Label',      count: items.filter(i=>i.type==='off-label').length },
      { id: 'ai-note',       label: 'AI Notes',       count: items.filter(i=>i.type==='ai-note').length },
      { id: 'protocol',      label: 'Protocol',       count: items.filter(i=>i.type==='protocol').length },
      { id: 'consent',       label: 'Consent',        count: items.filter(i=>i.type==='consent').length },
      { id: 'adverse-event', label: 'Adverse Events', count: openAEs.length },
      { id: 'audit',         label: 'Audit Trail',    count: readAudit().length },
    ];
    tabsEl.innerHTML = newTabs.map(t => {
      const isUrgentTab = t.id === 'adverse-event' && seriousAECount > 0;
      return `<div class="rq-tab${window._rqActiveTab===t.id?' active':''}"
        onclick="window._rqTab('${t.id}')">
        ${t.label}<span class="rq-tab-count${isUrgentTab?' urgent':''}">${t.count}</span>
      </div>`;
    }).join('');
  }

  // ── AE collapsible ─────────────────────────────────────────────────────────
  const aePreview = openAEs.slice(0,2).map(ae =>
    `<span style="font-size:12px;color:var(--text-secondary);">${esc(ae.patient_name||ae.patient_id||'Patient')} — ${aeSeverityBadge(ae.severity)}</span>`
  ).join('<br>');

  const aeCollapsible = openAEs.length ? `
  <div class="section-card" style="border-left:3px solid #ef4444;margin-bottom:16px;">
    <div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;"
      onclick="document.getElementById('rq-ae-detail').style.display=document.getElementById('rq-ae-detail').style.display==='none'?'block':'none'">
      <div>
        <span style="font-weight:600;color:#f87171;">&#9888; Open Adverse Events</span>
        <span class="badge badge-red" style="margin-left:8px;">${openAEs.length} open${seriousAECount ? ` &middot; ${seriousAECount} serious` : ''}</span>
      </div>
      <span style="color:var(--text-tertiary);">&#9660;</span>
    </div>
    <div id="rq-ae-detail" style="display:none;margin-top:10px;">${aePreview}</div>
  </div>` : '';

  // ── Main render ────────────────────────────────────────────────────────────
  el.innerHTML = `
  <div style="max-width:900px;">
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px;">
      ${statCard(pendingItems,  'Pending Review',   '#f59e0b')}
      ${statCard(overdueItems,  'Overdue',          '#ef4444')}
      ${statCard(approvedToday,'Approved Today',    '#22c55e')}
      ${statCard(openAEs.length,'Open AE Reports',  '#f87171')}
    </div>

    ${aeCollapsible}

    <div id="rq-tabs-bar" class="rq-tabs">${TABS.map(t => {
      const isUrgentTab = t.id === 'adverse-event' && seriousAECount > 0;
      return `<div class="rq-tab${window._rqActiveTab===t.id?' active':''}"
        onclick="window._rqTab('${t.id}')">
        ${t.label}<span class="rq-tab-count${isUrgentTab?' urgent':''}">${t.count}</span>
      </div>`;
    }).join('')}</div>

    <div id="rq-tab-content"></div>
  </div>`;

  renderTab(window._rqActiveTab || 'all');

  // ── Local save helper ──────────────────────────────────────────────────────
  function _saveLocalItem(item) {
    const all = readLocalQueue();
    const idx = all.findIndex(x => x.id === item.id);
    if (idx >= 0) all[idx] = item; else all.push(item);
    writeLocalQueue(all);
    const gi = items.findIndex(x => x.id === item.id);
    if (gi >= 0) items[gi] = item; else items.push(item);
    window._rqItems = items;
  }

  // ── Event handlers ─────────────────────────────────────────────────────────
  window._rqToast = function(msg, type) {
    const t = document.createElement('div');
    t.className = type === 'err' ? 'toast toast-error' : 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 400); }, 2800);
  };

  window._rqTab = function(tabId) {
    window._rqActiveTab = tabId;
    document.querySelectorAll('#rq-tabs-bar .rq-tab').forEach(el2 => {
      el2.classList.toggle('active', el2.textContent.trim().toLowerCase().startsWith(tabId === 'adverse-event' ? 'adverse' : tabId === 'ai-note' ? 'ai' : tabId));
    });
    // Re-render active tab classes properly
    document.querySelectorAll('#rq-tabs-bar .rq-tab').forEach((el2, i) => {
      el2.classList.toggle('active', TABS[i] && TABS[i].id === tabId);
    });
    renderTab(tabId);
  };

  window._rqToggle = function(itemId) {
    const body = document.getElementById('rq-body-' + itemId);
    if (!body) return;
    body.style.display = body.style.display === 'none' ? 'block' : 'none';
  };

  window._rqSetDecision = function(itemId, decision) {
    window._rqDecision[itemId] = decision;
    const body = document.getElementById('rq-body-' + itemId);
    if (body) body.style.display = 'block';
  };

  window._rqAssign = function(itemId, reviewer) {
    if (!reviewer) return;
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    item.assigned_to = reviewer;
    item.status = item.status === 'pending' ? 'assigned' : item.status;
    item.history = item.history || [];
    item.history.push({ action: 'assigned', by: 'You', at: new Date().toISOString(), note: `Assigned to ${reviewer}` });
    _saveLocalItem(item);
    writeAudit({ action: 'assign', item_id: itemId, reviewer, status: item.status });
    // Re-render card
    const card = document.getElementById('rq-card-' + itemId);
    if (card) card.outerHTML = rqCard(item);
    window._rqToast(`Assigned to ${reviewer}`, 'ok');
    rebuildTabs();
  };

  window._rqSubmit = function(itemId) {
    const decision = window._rqDecision[itemId];
    if (!decision) { window._rqToast('Select a decision first.', 'err'); return; }
    const noteEl = document.getElementById('rq-note-' + itemId);
    const note = noteEl ? noteEl.value.trim() : '';
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    const prevStatus = item.status;
    item.status = decision;
    item.resolved_by = 'You';
    item.resolved_at = new Date().toISOString();
    item.resolution_note = note;
    item.history = item.history || [];
    item.history.push({ action: decision, by: 'You', at: new Date().toISOString(), note });
    _saveLocalItem(item);
    writeAudit({ action: 'submit', item_id: itemId, reviewer: item.assigned_to || 'You', status: decision, note });
    delete window._rqDecision[itemId];
    const card = document.getElementById('rq-card-' + itemId);
    if (card) card.outerHTML = rqCard(item);
    window._rqToast(`Decision recorded: ${decision}`, 'ok');
    rebuildTabs();
  };

  window._rqFilterStatus = function(status) {
    const filtered = status === 'all' ? items : items.filter(i => i.status === status);
    const tabContent = document.getElementById('rq-tab-content');
    if (tabContent) tabContent.innerHTML = filtered.length ? filtered.map(rqCard).join('') : '<p style="color:var(--text-tertiary);font-size:13px;text-align:center;padding:32px 0;">No items.</p>';
  };

  window._rqSortPriority = function() {
    const sorted = [...items].sort((a,b) => priorityScore(b) - priorityScore(a));
    const tabContent = document.getElementById('rq-tab-content');
    if (tabContent) tabContent.innerHTML = sorted.map(rqCard).join('');
  };

  window._rqRenderAudit = function(filter) {
    const tabContent = document.getElementById('rq-tab-content');
    if (tabContent) tabContent.innerHTML = auditTrailHtml(filter || 'all');
  };

  window._rqExportAudit = function() {
    const trail = readAudit();
    if (!trail.length) { window._rqToast('No audit events to export.', 'err'); return; }
    const header = 'id,action,item_id,reviewer,status,note,created_at\n';
    const rows = trail.map(e =>
      [e.id, e.action, e.item_id, e.reviewer, e.status, e.note, e.created_at]
        .map(v => `"${String(v||'').replace(/"/g,'""')}"`)
        .join(',')
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'audit-trail-' + new Date().toISOString().slice(0,10) + '.csv';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
    writeAudit({ action: 'export', note: `${trail.length} events exported` });
    window._rqToast('Audit trail exported.', 'ok');
  };

  window._rqResolveAE = async function(aeId, btn) {
    if (btn) { btn.disabled = true; btn.textContent = 'Resolving…'; }
    try {
      const remaining = openAEs.filter(ae => ae.id !== aeId);
      window._rqOpenAEs = remaining;
      openAEs.length = 0;
      remaining.forEach(ae => openAEs.push(ae));
      writeAudit({ action: 'resolve-ae', item_id: aeId, reviewer: 'You', status: 'resolved' });
      window._rqToast('Adverse event resolved.', 'ok');
      renderTab('adverse-event');
      rebuildTabs();
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = '\u2713 Resolve'; }
      window._rqToast('Failed to resolve — try again.', 'err');
    }
  };

  // Legacy compatibility
  window._rqConfirmAction = window._rqSubmit;
  window._rqAction = window._rqSubmit;"""

new_content = content[:idx_old_start] + NEW_BODY + content[idx_old_end:]
with open(path, 'w', encoding='utf-8') as f:
    f.write(new_content)

print(f'Done! New file length: {len(new_content)} chars (delta: {len(new_content)-len(content):+d})')
