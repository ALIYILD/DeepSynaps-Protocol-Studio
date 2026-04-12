import sys

monitoring_code = r'''
// ─────────────────────────────────────────────────────────────────────────────
// pgMonitoring — Clinic-wide Patient Monitoring & Remote Follow-Up
// ─────────────────────────────────────────────────────────────────────────────
export async function pgMonitoring(setTopbar, navigate) {
  setTopbar({ title: 'Patient Monitoring & Remote Follow-Up', subtitle: 'Remote follow-up · risk detection · adherence oversight' });

  const el = document.getElementById('main-content');
  if (!el) return;
  el.innerHTML = '<div class="pm-loading">Loading monitoring data…</div>';

  // ── Data fetch ────────────────────────────────────────────────────────────
  const api = window._api || {};
  const [patients, courses, alertSummary, homeAdherence, homeFlags, mediaQueue, adverseEvents] = await Promise.all([
    api.listPatients?.().catch(() => []) ?? [],
    api.listCourses?.().catch(() => []) ?? [],
    api.getClinicAlertSummary?.().catch(() => ({})) ?? {},
    api.listHomeAdherenceEvents?.().catch(() => []) ?? [],
    api.listHomeReviewFlags?.().catch(() => []) ?? [],
    api.listMediaQueue?.().catch(() => []) ?? [],
    api.listAdverseEvents?.().catch(() => []) ?? [],
  ]);

  const patientMap = {};
  (patients || []).forEach(p => { patientMap[p.id] = p; });

  const coursesByPatient = {};
  (courses || []).forEach(c => {
    if (!coursesByPatient[c.patient_id]) coursesByPatient[c.patient_id] = [];
    coursesByPatient[c.patient_id].push(c);
  });

  const activeCourses = (courses || []).filter(c => ['active','in_progress'].includes(c.status));
  const openAEs = (adverseEvents || []).filter(a => a.status === 'open' || a.status === 'active');
  const seriousAEs = openAEs.filter(a => ['serious','severe'].includes(a.severity));

  // ── Signal scoring per patient ───────────────────────────────────────────
  const _signalScore = patId => {
    let score = 0;
    const ptAEs = openAEs.filter(a => a.patient_id === patId);
    const ptCourses = (coursesByPatient[patId] || []);
    const ptAdherence = (homeAdherence || []).filter(e => e.patient_id === patId);
    const ptFlags = (homeFlags || []).filter(f => f.patient_id === patId);
    if (ptAEs.some(a => ['serious','severe'].includes(a.severity))) score += 100;
    if (ptAEs.length) score += 40;
    if (ptCourses.some(c => c.status === 'paused')) score += 60;
    if (ptFlags.some(f => f.severity === 'high')) score += 50;
    if (ptAdherence.some(e => e.missed_sessions >= 3)) score += 30;
    if (ptCourses.some(c => (c.last_checkin_days_ago || 0) > 7)) score += 25;
    return score;
  };

  const _statusBadge = score => {
    if (score >= 80) return { label: 'Needs Review', cls: 'pm-badge-red' };
    if (score >= 30) return { label: 'Watch', cls: 'pm-badge-amber' };
    return { label: 'Stable', cls: 'pm-badge-green' };
  };

  const _monitoringReason = patId => {
    const ptAEs = openAEs.filter(a => a.patient_id === patId);
    const ptFlags = (homeFlags || []).filter(f => f.patient_id === patId);
    const ptAdherence = (homeAdherence || []).filter(e => e.patient_id === patId);
    const ptCourses = (coursesByPatient[patId] || []);
    if (ptAEs.some(a => ['serious','severe'].includes(a.severity))) return 'Serious adverse event';
    if (ptAEs.length) return 'Open adverse event';
    if (ptCourses.some(c => c.status === 'paused')) return 'Course paused';
    if (ptFlags.some(f => f.severity === 'high')) return 'High severity flag';
    if (ptAdherence.some(e => e.missed_sessions >= 3)) return 'Low adherence';
    if (ptCourses.some(c => (c.last_checkin_days_ago || 0) > 7)) return 'No recent check-in';
    return 'Routine monitoring';
  };

  const _latestSignal = patId => {
    const ptFlags = (homeFlags || []).filter(f => f.patient_id === patId).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    if (ptFlags.length) return ptFlags[0].description || 'Flag raised';
    const ptAEs = openAEs.filter(a => a.patient_id === patId);
    if (ptAEs.length) return `AE: ${ptAEs[0].description || ptAEs[0].type || 'Adverse event'}`;
    return 'No new signals';
  };

  // ── Build monitored patient list ─────────────────────────────────────────
  const monitoredPatientIds = [...new Set([
    ...activeCourses.map(c => c.patient_id),
    ...openAEs.map(a => a.patient_id),
    ...(homeAdherence || []).map(e => e.patient_id),
    ...(homeFlags || []).map(f => f.patient_id),
  ].filter(Boolean))];

  const monitoredPatients = monitoredPatientIds
    .map(id => {
      const pt = patientMap[id];
      if (!pt) return null;
      const score = _signalScore(id);
      const status = _statusBadge(score);
      const ptCourses = coursesByPatient[id] || [];
      const activeCourse = ptCourses.find(c => ['active','in_progress'].includes(c.status));
      return {
        id, pt, score, status,
        reason: _monitoringReason(id),
        signal: _latestSignal(id),
        modality: activeCourse?.modality || activeCourse?.protocol_name || '—',
        condition: activeCourse?.condition || pt.primary_condition || '—',
        ptAEs: openAEs.filter(a => a.patient_id === id),
        ptFlags: (homeFlags || []).filter(f => f.patient_id === id),
        ptAdherence: (homeAdherence || []).filter(e => e.patient_id === id),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  // ── Summary counts ───────────────────────────────────────────────────────
  const totalMonitored = monitoredPatients.length;
  const totalStable = monitoredPatients.filter(x => x.status.label === 'Stable').length;
  const totalNeedsReview = monitoredPatients.filter(x => x.status.label === 'Needs Review').length;
  const missingCheckins = monitoredPatients.filter(x => (coursesByPatient[x.id] || []).some(c => (c.last_checkin_days_ago || 0) > 7)).length;
  const deviceIssues = monitoredPatients.filter(x => x.ptFlags.some(f => f.type === 'device_sync' || f.type === 'wearable_disconnect')).length;
  const sideEffectFlags = monitoredPatients.filter(x => x.ptFlags.some(f => f.type === 'side_effect') || x.ptAEs.length > 0).length;

  // ── Action buttons ───────────────────────────────────────────────────────
  const _actionBtns = (pid, cid) => {
    const _cid = (cid || '').replace(/['"]/g, '');
    return `
      <button class="pm-act-btn pm-act-primary" onclick="window.openPatient('${pid}');window._nav('patient-profile')" title="Open Patient">Open</button>
      <button class="pm-act-btn" onclick="window.openPatient('${pid}');window._nav('messaging')" title="Message Patient">Message</button>
      <button class="pm-act-btn" onclick="window.openPatient('${pid}');window._nav('patient-profile')" title="Review Update">Review</button>
      <div class="pm-act-more" onclick="event.stopPropagation();this.nextElementSibling.classList.toggle('pm-act-open')">⋯</div>
      <div class="pm-act-dropdown">
        <div onclick="window.openPatient('${pid}');window._nav('outcomes')">Log Outcome</div>
        <div onclick="window.openPatient('${pid}');window._nav('assessments-hub')">Request Assessment</div>
        <div onclick="window.openPatient('${pid}');window._nav('home-task-manager')">Assign Task</div>
        <div onclick="window.openPatient('${pid}');window._nav('telehealth-recorder')">Schedule Call</div>
        <div onclick="window.openPatient('${pid}');window._nav('adverse-events')">Flag Review</div>
        ${_cid ? `<div onclick="window._nav('wearables')">Open Device Detail</div>` : ''}
      </div>`;
  };

  // ── Patient row ──────────────────────────────────────────────────────────
  const _patRow = (entry) => {
    const { id, pt, status, reason, signal, modality, condition } = entry;
    const ptCourses = coursesByPatient[id] || [];
    const activeCourse = ptCourses.find(c => ['active','in_progress'].includes(c.status));
    const cid = activeCourse?.id || '';
    const name = [pt.first_name, pt.last_name].filter(Boolean).join(' ') || pt.name || 'Unknown';
    return `
      <div class="pm-pat-row" onclick="window.openPatient('${id}');window._nav('patient-profile')">
        <div class="pm-pat-name">${name}</div>
        <div class="pm-pat-condition">${condition}</div>
        <div class="pm-pat-modality">${modality}</div>
        <div class="pm-pat-reason">${reason}</div>
        <div class="pm-pat-signal pm-signal-text">${signal}</div>
        <div class="pm-pat-status"><span class="pm-badge ${status.cls}">${status.label}</span></div>
        <div class="pm-pat-actions" onclick="event.stopPropagation()">${_actionBtns(id, cid)}</div>
      </div>`;
  };

  // ── Domain section helpers ───────────────────────────────────────────────
  const _domainSection = (title, icon, rows, emptyMsg) => `
    <div class="pm-domain">
      <div class="pm-domain-header"><span class="pm-domain-icon">${icon}</span> ${title}</div>
      ${rows.length ? rows.join('') : `<div class="pm-domain-empty">${emptyMsg}</div>`}
    </div>`;

  const symptomsPatients = monitoredPatients.filter(x => x.ptFlags.some(f => f.type === 'symptom' || f.type === 'side_effect') || x.ptAEs.length > 0);
  const assessmentPatients = monitoredPatients.filter(x => (coursesByPatient[x.id] || []).some(c => c.pending_assessment || c.outcome_due));
  const homeProgramPatients = monitoredPatients.filter(x => x.ptAdherence.some(e => e.missed_sessions >= 1));
  const wearablePatients = monitoredPatients.filter(x => x.ptFlags.some(f => f.type === 'wearable_disconnect' || f.type === 'device_sync'));
  const homeNeuroPatients = monitoredPatients.filter(x => x.ptFlags.some(f => f.type === 'home_device_non_use' || f.type === 'home_neuro'));

  const _domainRow = (entry, signal) => {
    const { id, pt, status } = entry;
    const name = [pt.first_name, pt.last_name].filter(Boolean).join(' ') || pt.name || 'Unknown';
    return `<div class="pm-domain-row" onclick="window.openPatient('${id}');window._nav('patient-profile')">
      <span class="pm-domain-name">${name}</span>
      <span class="pm-domain-signal">${signal}</span>
      <span class="pm-badge ${status.cls}">${status.label}</span>
    </div>`;
  };

  // ── Needs Review panel ───────────────────────────────────────────────────
  const needsReviewPatients = monitoredPatients.filter(x => x.status.label === 'Needs Review');
  const _reviewRow = (entry) => {
    const { id, pt, reason, ptAEs, ptFlags, ptAdherence } = entry;
    const name = [pt.first_name, pt.last_name].filter(Boolean).join(' ') || pt.name || 'Unknown';
    const tags = [];
    if (ptAEs.some(a => ['serious','severe'].includes(a.severity))) tags.push('<span class="pm-tag pm-tag-red">Serious AE</span>');
    else if (ptAEs.length) tags.push('<span class="pm-tag pm-tag-amber">Open AE</span>');
    if (ptFlags.some(f => f.type === 'side_effect')) tags.push('<span class="pm-tag pm-tag-amber">Side Effects</span>');
    if (ptFlags.some(f => f.type === 'wearable_disconnect')) tags.push('<span class="pm-tag pm-tag-grey">Wearable Offline</span>');
    if (ptFlags.some(f => f.type === 'home_device_non_use')) tags.push('<span class="pm-tag pm-tag-grey">Device Non-Use</span>');
    if (ptAdherence.some(e => e.missed_sessions >= 3)) tags.push('<span class="pm-tag pm-tag-amber">Low Adherence</span>');
    if (ptFlags.some(f => f.severity === 'high')) tags.push('<span class="pm-tag pm-tag-red">High Flag</span>');
    return `<div class="pm-review-row">
      <div class="pm-review-name">${name}</div>
      <div class="pm-review-reason">${reason}</div>
      <div class="pm-review-tags">${tags.join('')}</div>
      <div class="pm-review-actions" onclick="event.stopPropagation()">
        <button class="pm-act-btn pm-act-primary" onclick="window.openPatient('${id}');window._nav('patient-profile')">Open</button>
        <button class="pm-act-btn" onclick="window.openPatient('${id}');window._nav('messaging')">Message</button>
      </div>
    </div>`;
  };

  // ── Filter state ─────────────────────────────────────────────────────────
  let _pmFilter = { search: '', status: 'all', type: 'all' };

  const _filteredPatients = () => {
    let list = monitoredPatients;
    if (_pmFilter.status !== 'all') list = list.filter(x => x.status.label.toLowerCase().replace(' ', '-') === _pmFilter.status);
    if (_pmFilter.type === 'no-checkin') list = list.filter(x => (coursesByPatient[x.id] || []).some(c => (c.last_checkin_days_ago || 0) > 7));
    if (_pmFilter.type === 'low-adherence') list = list.filter(x => x.ptAdherence.some(e => e.missed_sessions >= 2));
    if (_pmFilter.type === 'wearable-issue') list = list.filter(x => x.ptFlags.some(f => f.type === 'wearable_disconnect'));
    if (_pmFilter.type === 'side-effects') list = list.filter(x => x.ptFlags.some(f => f.type === 'side_effect') || x.ptAEs.length > 0);
    if (_pmFilter.type === 'home-device') list = list.filter(x => x.ptFlags.some(f => f.type === 'home_device_non_use'));
    if (_pmFilter.search) {
      const q = _pmFilter.search.toLowerCase();
      list = list.filter(x => {
        const name = [x.pt.first_name, x.pt.last_name, x.pt.name].filter(Boolean).join(' ').toLowerCase();
        return name.includes(q) || (x.condition || '').toLowerCase().includes(q) || (x.modality || '').toLowerCase().includes(q);
      });
    }
    return list;
  };

  // ── Render ───────────────────────────────────────────────────────────────
  const renderPage = () => {
    const filtered = _filteredPatients();

    const summaryStrip = `
      <div class="pm-summary-strip">
        <div class="pm-chip"><span class="pm-chip-val">${totalMonitored}</span><span class="pm-chip-lbl">Monitored</span></div>
        <div class="pm-chip pm-chip-green"><span class="pm-chip-val">${totalStable}</span><span class="pm-chip-lbl">Stable</span></div>
        <div class="pm-chip pm-chip-red"><span class="pm-chip-val">${totalNeedsReview}</span><span class="pm-chip-lbl">Needs Review</span></div>
        <div class="pm-chip pm-chip-amber"><span class="pm-chip-val">${missingCheckins}</span><span class="pm-chip-lbl">Missing Check-ins</span></div>
        <div class="pm-chip pm-chip-grey"><span class="pm-chip-val">${deviceIssues}</span><span class="pm-chip-lbl">Device Issues</span></div>
        <div class="pm-chip pm-chip-amber"><span class="pm-chip-val">${sideEffectFlags}</span><span class="pm-chip-lbl">Side Effect Flags</span></div>
      </div>`;

    const filterBar = `
      <div class="pm-filter-bar">
        <input class="pm-search" type="text" placeholder="Search patient, condition, modality…" value="${_pmFilter.search}" oninput="window._pmSearch(this.value)">
        <select class="pm-filter-sel" onchange="window._pmFilterStatus(this.value)">
          <option value="all" ${_pmFilter.status==='all'?'selected':''}>All Status</option>
          <option value="needs-review" ${_pmFilter.status==='needs-review'?'selected':''}>Needs Review</option>
          <option value="watch" ${_pmFilter.status==='watch'?'selected':''}>Watch</option>
          <option value="stable" ${_pmFilter.status==='stable'?'selected':''}>Stable</option>
        </select>
        <select class="pm-filter-sel" onchange="window._pmFilterType(this.value)">
          <option value="all" ${_pmFilter.type==='all'?'selected':''}>All Types</option>
          <option value="no-checkin" ${_pmFilter.type==='no-checkin'?'selected':''}>No Recent Check-in</option>
          <option value="low-adherence" ${_pmFilter.type==='low-adherence'?'selected':''}>Low Adherence</option>
          <option value="wearable-issue" ${_pmFilter.type==='wearable-issue'?'selected':''}>Wearable Issue</option>
          <option value="side-effects" ${_pmFilter.type==='side-effects'?'selected':''}>Side Effects / AE</option>
          <option value="home-device" ${_pmFilter.type==='home-device'?'selected':''}>Home Device Non-Use</option>
        </select>
      </div>`;

    const queueHeader = `
      <div class="pm-queue-header">
        <span>Patient</span><span>Condition</span><span>Modality</span><span>Reason</span><span>Latest Signal</span><span>Status</span><span>Actions</span>
      </div>`;

    const queueRows = filtered.length
      ? filtered.map(_patRow).join('')
      : '<div class="pm-empty-queue">No patients match current filters.</div>';

    const queueCard = `
      <div class="pm-card pm-queue-card">
        <div class="pm-card-title">Monitoring Queue <span class="pm-queue-count">${filtered.length}</span></div>
        ${filterBar}
        ${queueHeader}
        <div class="pm-queue-rows">${queueRows}</div>
      </div>`;

    const domainsCard = `
      <div class="pm-card pm-domains-card">
        <div class="pm-card-title">Signal Domains</div>
        ${_domainSection('Symptoms & Check-ins', '⚡',
          symptomsPatients.map(x => _domainRow(x, x.ptFlags.find(f=>f.type==='symptom'||f.type==='side_effect')?.description || (x.ptAEs[0]?.type || 'Symptom flag'))),
          'No symptom flags')}
        ${_domainSection('Assessments & Outcomes', '📋',
          assessmentPatients.map(x => _domainRow(x, 'Assessment pending or outcome due')),
          'All assessments current')}
        ${_domainSection('Home Programs', '🏠',
          homeProgramPatients.map(x => _domainRow(x, `${x.ptAdherence.find(e=>e.missed_sessions>=1)?.missed_sessions || 1} session(s) missed`)),
          'Full adherence')}
        ${_domainSection('Wearables & Devices', '⌚',
          wearablePatients.map(x => _domainRow(x, x.ptFlags.find(f=>f.type==='wearable_disconnect'||f.type==='device_sync')?.description || 'Device offline')),
          'All wearables synced')}
        ${_domainSection('Home Neuromodulation Devices', '🧠',
          homeNeuroPatients.map(x => _domainRow(x, x.ptFlags.find(f=>f.type==='home_device_non_use'||f.type==='home_neuro')?.description || 'Non-use detected')),
          'All devices in use')}
      </div>`;

    const reviewCard = needsReviewPatients.length ? `
      <div class="pm-card pm-review-card">
        <div class="pm-card-title pm-review-title">Needs Review <span class="pm-badge pm-badge-red">${needsReviewPatients.length}</span></div>
        <div class="pm-review-rows">${needsReviewPatients.map(_reviewRow).join('')}</div>
      </div>` : '';

    el.innerHTML = `
      <div class="pm-page">
        ${summaryStrip}
        ${queueCard}
        <div class="pm-lower-grid">
          ${domainsCard}
          ${reviewCard}
        </div>
      </div>`;
  };

  // ── Global handlers ───────────────────────────────────────────────────────
  window._pmSearch = (val) => { _pmFilter.search = val; renderPage(); };
  window._pmFilterStatus = (val) => { _pmFilter.status = val; renderPage(); };
  window._pmFilterType = (val) => { _pmFilter.type = val; renderPage(); };

  renderPage();
}
'''

target = r'C:\Users\yildi\DeepSynaps-Protocol-Studio\apps\web\src\pages-clinical.js'
with open(target, 'a', encoding='utf-8') as f:
    f.write(monitoring_code)

print('Done appending pgMonitoring')
