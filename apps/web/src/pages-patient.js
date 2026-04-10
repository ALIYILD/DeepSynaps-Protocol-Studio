// Patient portal pages — simpler, calmer UI than the professional app
// All pages render into #patient-content

// ── Nav definition ────────────────────────────────────────────────────────────
const PATIENT_NAV = [
  { id: 'patient-portal',       label: 'My Dashboard',      icon: '◈' },
  { id: 'patient-sessions',     label: 'Sessions',           icon: '◧' },
  { id: 'patient-course',       label: 'My Treatment',       icon: '◎' },
  { id: 'patient-assessments',  label: 'Assessments',        icon: '◉' },
  { id: 'patient-reports',      label: 'Reports',            icon: '◱' },
  { id: 'patient-messages',     label: 'Messages',           icon: '◫', badge: '2' },
  { id: 'patient-profile',      label: 'Profile & Settings', icon: '◇' },
];

export function renderPatientNav(currentPage) {
  document.getElementById('patient-nav-list').innerHTML = PATIENT_NAV.map(n => {
    const badge = n.badge ? `<span class="nav-badge">${n.badge}</span>` : '';
    return `<div class="nav-item ${currentPage === n.id ? 'active' : ''}" onclick="window._navPatient('${n.id}')">
      <span class="nav-icon">${n.icon}</span>
      <span style="flex:1">${n.label}</span>${badge}
    </div>`;
  }).join('');
}

function setTopbar(title, html = '') {
  document.getElementById('patient-page-title').textContent = title;
  document.getElementById('patient-topbar-actions').innerHTML = html;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export function pgPatientDashboard(user) {
  setTopbar('My Dashboard');
  const firstName = (user?.display_name || 'there').split(' ')[0];
  document.getElementById('patient-content').innerHTML = `
    <div style="margin-bottom:24px">
      <div style="font-family:var(--font-display);font-size:19px;font-weight:600;color:var(--text-primary);margin-bottom:4px">
        Welcome back, ${firstName} 👋
      </div>
      <div style="font-size:12.5px;color:var(--text-secondary)">Here's your treatment journey at a glance.</div>
    </div>

    <div class="g3" style="margin-bottom:24px">
      <div class="metric-card" style="border-color:var(--border-blue)">
        <div class="metric-label">Upcoming Sessions</div>
        <div class="metric-value" style="color:var(--blue)">3</div>
        <div class="metric-delta" style="color:var(--blue)">Next: Tomorrow at 10:00 AM</div>
      </div>
      <div class="metric-card" style="border-color:var(--border-teal)">
        <div class="metric-label">Sessions Completed</div>
        <div class="metric-value">12</div>
        <div class="metric-delta">of 20 planned · 60% complete</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Current Course</div>
        <div class="metric-value" style="font-size:16px;color:var(--teal);letter-spacing:-0.3px">tDCS — MDD</div>
        <div class="metric-delta">Active · Week 6 of 10</div>
      </div>
    </div>

    <div class="g2">
      <div>
        <div class="card">
          <div class="card-header"><h3>Upcoming Sessions</h3></div>
          <div class="card-body" style="padding:0">
            ${[
              { date: 'Tomorrow',    time: '10:00 AM', label: 'tDCS Session #13', loc: 'NeuroBalance Clinic' },
              { date: 'Thu Apr 14', time: '2:30 PM',  label: 'tDCS Session #14', loc: 'NeuroBalance Clinic' },
              { date: 'Mon Apr 18', time: '10:00 AM', label: 'tDCS Session #15', loc: 'NeuroBalance Clinic' },
            ].map(s => `
              <div class="pt-session-card" style="border-radius:0;border:none;border-bottom:1px solid var(--border);margin:0">
                <div class="pt-session-icon upcoming">◧</div>
                <div style="flex:1">
                  <div style="font-size:12.5px;font-weight:500;color:var(--text-primary)">${s.label}</div>
                  <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">${s.loc}</div>
                </div>
                <div style="text-align:right">
                  <div style="font-size:12px;color:var(--blue);font-weight:500">${s.date}</div>
                  <div style="font-size:11px;color:var(--text-tertiary)">${s.time}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>Recent Messages</h3>
            <span class="pill pill-review" style="font-size:10px;padding:2px 8px">2 unread</span>
          </div>
          <div class="card-body" style="padding:0">
            ${[
              { from: 'Dr. Smith',   msg: 'Your session report from Monday is ready for review.', time: '2h ago',  unread: true },
              { from: 'Clinic Team', msg: 'Reminder: Please complete your weekly mood assessment before Thursday.', time: '1d ago', unread: true },
              { from: 'Dr. Smith',   msg: 'Great progress this week. Session parameters will stay the same for #13.', time: '3d ago', unread: false },
            ].map(m => `
              <div style="padding:12px 18px;border-bottom:1px solid var(--border);${m.unread ? 'background:rgba(74,158,255,0.03)' : ''}">
                <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                  <div style="font-size:12px;font-weight:${m.unread ? 600 : 400};color:var(--text-primary)">${m.from}</div>
                  <div style="font-size:10.5px;color:var(--text-tertiary)">${m.time}</div>
                </div>
                <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.5">${m.msg}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <div>
        <div class="card">
          <div class="card-header"><h3>Treatment Progress</h3></div>
          <div class="card-body">
            <div style="margin-bottom:18px">
              <div style="display:flex;justify-content:space-between;margin-bottom:6px">
                <span style="font-size:12px;color:var(--text-secondary)">Course Completion</span>
                <span style="font-size:12px;font-weight:600;color:var(--teal)">60%</span>
              </div>
              <div class="progress-bar" style="height:7px">
                <div class="progress-fill" style="width:60%"></div>
              </div>
              <div style="font-size:11px;color:var(--text-tertiary);margin-top:6px">12 of 20 sessions complete</div>
            </div>
            <div class="glow-line"></div>
            <div style="font-size:10.5px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:12px">Weekly Wellbeing Tracking</div>
            ${[
              { label: 'Depression (PHQ-9)',  val: 68, color: 'var(--teal)' },
              { label: 'Anxiety (GAD-7)',     val: 55, color: 'var(--blue)' },
              { label: 'Sleep Quality',       val: 72, color: 'var(--green)' },
              { label: 'Overall Wellbeing',   val: 65, color: 'var(--violet)' },
            ].map(r => `
              <div class="ev-row">
                <span class="ev-label">${r.label}</span>
                <div class="ev-track"><div class="ev-fill" style="width:${r.val}%;background:${r.color}"></div></div>
                <span style="font-size:11px;color:var(--text-secondary);width:30px;text-align:right">${r.val}%</span>
              </div>
            `).join('')}
            <div style="font-size:11px;color:var(--text-tertiary);margin-top:10px">Higher = more improvement vs. baseline</div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h3>Actions Needed</h3></div>
          <div class="card-body" style="padding:0 18px">
            ${[
              { label: 'Weekly Mood Assessment',     due: 'Due Thursday',        color: 'var(--amber)', icon: '◉' },
              { label: 'Review Session #12 Report',  due: 'Ready to view',       color: 'var(--blue)',  icon: '◱' },
              { label: 'Update Emergency Contact',   due: 'Requested by clinic', color: 'var(--text-tertiary)', icon: '◇' },
            ].map(a => `
              <div style="display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid var(--border)">
                <div style="width:32px;height:32px;border-radius:var(--radius-md);background:rgba(255,255,255,0.03);display:flex;align-items:center;justify-content:center;color:${a.color};flex-shrink:0">${a.icon}</div>
                <div style="flex:1">
                  <div style="font-size:12px;font-weight:500;color:var(--text-primary)">${a.label}</div>
                  <div style="font-size:11px;color:var(--text-tertiary)">${a.due}</div>
                </div>
                <div style="font-size:11px;color:var(--text-tertiary)">→</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}

// ── Sessions ──────────────────────────────────────────────────────────────────
export function pgPatientSessions() {
  setTopbar('My Sessions');
  document.getElementById('patient-content').innerHTML = `
    <div class="tab-bar">
      <button class="tab-btn active" id="s-tab-up" onclick="window._ptSessTab('upcoming')">Upcoming</button>
      <button class="tab-btn" id="s-tab-done" onclick="window._ptSessTab('completed')">Completed</button>
    </div>
    <div id="pt-sess-upcoming">
      ${[
        { n: 13, date: 'Tomorrow · 10:00 AM',    mod: 'tDCS', loc: 'NeuroBalance Clinic · Room 2', status: 'confirmed' },
        { n: 14, date: 'Thu Apr 14 · 2:30 PM',   mod: 'tDCS', loc: 'NeuroBalance Clinic · Room 2', status: 'confirmed' },
        { n: 15, date: 'Mon Apr 18 · 10:00 AM',  mod: 'tDCS', loc: 'NeuroBalance Clinic · Room 2', status: 'pending' },
      ].map(s => `
        <div class="pt-session-card">
          <div class="pt-session-icon upcoming">◧</div>
          <div style="flex:1">
            <div style="font-size:13px;font-weight:600;color:var(--text-primary)">Session #${s.n} — ${s.mod}</div>
            <div style="font-size:11.5px;color:var(--text-tertiary);margin-top:3px">${s.loc}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:12px;color:var(--blue);font-weight:500">${s.date}</div>
            <span class="pill ${s.status === 'confirmed' ? 'pill-active' : 'pill-pending'}" style="font-size:10px;margin-top:4px;display:inline-flex">${s.status}</span>
          </div>
        </div>
      `).join('')}
    </div>
    <div id="pt-sess-completed" style="display:none">
      ${Array.from({ length: 12 }, (_, i) => {
        const dayOffset = 10 - i * 3;
        const dateStr   = dayOffset > 0 ? `Apr ${dayOffset}, 2026` : `Mar ${31 + dayOffset}, 2026`;
        const note      = i % 4 === 0 ? 'Minor scalp tingling, resolved during session' : 'No adverse events';
        return `
          <div class="pt-session-card">
            <div class="pt-session-icon done">✓</div>
            <div style="flex:1">
              <div style="font-size:13px;font-weight:600;color:var(--text-primary)">Session #${12 - i} — tDCS</div>
              <div style="font-size:11.5px;color:var(--text-tertiary);margin-top:3px">${note}</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:12px;color:var(--text-secondary)">${dateStr}</div>
              <div style="font-size:11px;color:var(--text-tertiary)">25 min</div>
            </div>
          </div>`;
      }).join('')}
    </div>
  `;
  window._ptSessTab = function(tab) {
    document.getElementById('pt-sess-upcoming').style.display   = tab === 'upcoming'   ? '' : 'none';
    document.getElementById('pt-sess-completed').style.display  = tab === 'completed'  ? '' : 'none';
    document.getElementById('s-tab-up').classList.toggle('active',   tab === 'upcoming');
    document.getElementById('s-tab-done').classList.toggle('active', tab === 'completed');
  };
}

// ── My Treatment ──────────────────────────────────────────────────────────────
export function pgPatientCourse() {
  setTopbar('My Treatment');
  document.getElementById('patient-content').innerHTML = `
    <div class="card" style="margin-bottom:20px;border-color:var(--border-teal)">
      <div class="card-header">
        <h3>Current Treatment Course</h3>
        <span class="pill pill-active">Active</span>
      </div>
      <div class="card-body">
        <div class="g2">
          <div>
            ${[
              ['Condition',       'Major Depressive Disorder (MDD)'],
              ['Modality',        'Transcranial Direct Current Stimulation (tDCS)'],
              ['Protocol',        'F3 Anode / Fp2 Cathode — 2 mA — 25 min'],
              ['Evidence Grade',  'A — Strong clinical evidence'],
              ['Started',         'Feb 26, 2026'],
              ['Expected End',    'May 7, 2026'],
            ].map(([k, v]) => `
              <div class="field-row"><span>${k}</span><span>${v}</span></div>
            `).join('')}
          </div>
          <div>
            <div style="margin-bottom:16px">
              <div style="display:flex;justify-content:space-between;margin-bottom:6px">
                <span style="font-size:12px;color:var(--text-secondary)">Overall Progress</span>
                <span style="font-size:12px;font-weight:600;color:var(--teal)">60%</span>
              </div>
              <div class="progress-bar" style="height:8px">
                <div class="progress-fill" style="width:60%"></div>
              </div>
              <div style="font-size:11px;color:var(--text-tertiary);margin-top:6px">12 of 20 sessions complete</div>
            </div>
            <div class="notice notice-info" style="font-size:12px">
              Your care team will review outcomes at session 15 and may adjust parameters.
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><h3>About This Treatment</h3></div>
      <div class="card-body">
        <p style="font-size:12.5px;color:var(--text-secondary);line-height:1.8;margin-bottom:12px">
          <strong style="color:var(--text-primary)">Transcranial Direct Current Stimulation (tDCS)</strong> is a non-invasive brain stimulation technique
          that delivers a low, constant electrical current to targeted brain regions through electrodes placed on the scalp.
        </p>
        <p style="font-size:12.5px;color:var(--text-secondary);line-height:1.8;margin-bottom:12px">
          For depression, the anode is placed over the left dorsolateral prefrontal cortex (DLPFC), a region associated with mood regulation and
          executive function. The gentle current encourages increased activity in this area.
        </p>
        <p style="font-size:12.5px;color:var(--text-secondary);line-height:1.8">
          Sessions are painless and typically last 20–30 minutes. You may feel mild tingling or warmth under the electrodes. This is normal.
        </p>
      </div>
    </div>
  `;
}

// ── Assessments ───────────────────────────────────────────────────────────────
export function pgPatientAssessments() {
  setTopbar('Assessments');
  document.getElementById('patient-content').innerHTML = `
    <div class="notice notice-info" style="margin-bottom:20px">
      ◉ &nbsp;Your next assessment is due <strong>Thursday, April 13</strong>. Please complete it before your session.
    </div>
    ${[
      { name: 'Weekly Mood Check-in',           type: 'PHQ-9 + GAD-7',          due: 'Due Thu Apr 13', status: 'pending', score: null },
      { name: 'Session #12 Wellbeing Survey',   type: 'Custom · 5 items',        due: 'Completed Apr 7',  status: 'done',    score: '18/25' },
      { name: 'Session #10 Wellbeing Survey',   type: 'Custom · 5 items',        due: 'Completed Apr 1',  status: 'done',    score: '16/25' },
      { name: 'Baseline Assessment',            type: 'PHQ-9 + GAD-7 + ISI',     due: 'Completed Feb 25', status: 'done',    score: '31/39' },
    ].map(a => `
      <div class="card">
        <div class="card-header">
          <h3>${a.name}</h3>
          <span class="pill ${a.status === 'pending' ? 'pill-pending' : 'pill-active'}">${a.status === 'pending' ? 'Due' : 'Completed'}</span>
        </div>
        <div class="card-body" style="display:flex;align-items:center;gap:16px">
          <div style="flex:1">
            <div style="font-size:12px;color:var(--text-tertiary)">${a.type}</div>
            <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">${a.due}</div>
          </div>
          ${a.score ? `<div style="font-size:13px;font-weight:600;color:var(--teal)">${a.score}</div>` : ''}
          ${a.status === 'pending'
            ? `<button class="btn btn-primary btn-sm" onclick="alert('Assessment form opens here.')">Start &rarr;</button>`
            : `<button class="btn btn-ghost btn-sm">View &rarr;</button>`}
        </div>
      </div>
    `).join('')}
  `;
}

// ── Reports ───────────────────────────────────────────────────────────────────
export function pgPatientReports() {
  setTopbar('Reports & Documents');
  document.getElementById('patient-content').innerHTML = `
    ${[
      { name: 'Session #12 — Clinical Report',            date: 'Apr 7, 2026',  type: 'Session Report', size: '124 KB' },
      { name: 'Treatment Progress Summary — Week 6',      date: 'Apr 4, 2026',  type: 'Progress Report', size: '88 KB' },
      { name: 'Session #10 — Clinical Report',            date: 'Apr 1, 2026',  type: 'Session Report', size: '119 KB' },
      { name: 'Baseline Assessment Results',              date: 'Feb 25, 2026', type: 'Assessment',      size: '96 KB' },
      { name: 'Consent & Treatment Agreement',            date: 'Feb 20, 2026', type: 'Document',        size: '214 KB' },
    ].map(r => `
      <div class="card">
        <div class="card-body" style="display:flex;align-items:center;gap:14px">
          <div style="width:40px;height:40px;border-radius:var(--radius-md);background:rgba(74,158,255,0.1);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;color:var(--blue)">◱</div>
          <div style="flex:1">
            <div style="font-size:12.5px;font-weight:500;color:var(--text-primary)">${r.name}</div>
            <div style="font-size:11px;color:var(--text-tertiary);margin-top:3px">${r.type} · ${r.date} · ${r.size}</div>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="alert('Download starts here.')">Download</button>
        </div>
      </div>
    `).join('')}
  `;
}

// ── Messages ──────────────────────────────────────────────────────────────────
export function pgPatientMessages() {
  setTopbar('Messages');
  document.getElementById('patient-content').innerHTML = `
    <div style="border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden">
      ${[
        { from: 'Dr. Smith',   msg: 'Your session report from Monday is ready for review. Overall progress looks very positive — keep it up.', time: '2h ago',  unread: true,  initials: 'DS' },
        { from: 'Clinic Team', msg: "Reminder: Please complete your weekly mood assessment before Thursday's session.", time: '1d ago',  unread: true,  initials: 'CT' },
        { from: 'Dr. Smith',   msg: 'Great progress this week. Session parameters will stay the same for session #13.', time: '3d ago',  unread: false, initials: 'DS' },
        { from: 'Clinic Team', msg: 'Your next appointment has been confirmed: Tomorrow at 10:00 AM, Room 2.', time: '4d ago',  unread: false, initials: 'CT' },
        { from: 'Dr. Smith',   msg: 'Please remember to avoid caffeine 2 hours before your session for best results.', time: '6d ago',  unread: false, initials: 'DS' },
      ].map(m => `
        <div style="display:flex;gap:12px;padding:16px 18px;border-bottom:1px solid var(--border);background:${m.unread ? 'rgba(74,158,255,0.03)' : 'var(--bg-card)'}">
          <div class="avatar" style="background:${m.initials === 'DS' ? 'linear-gradient(135deg,var(--teal-dim),var(--blue-dim))' : 'linear-gradient(135deg,var(--violet),var(--blue-dim))'};flex-shrink:0">${m.initials}</div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
              <div style="font-size:12.5px;font-weight:${m.unread ? 600 : 400};color:var(--text-primary)">${m.from}</div>
              <div style="font-size:10.5px;color:var(--text-tertiary);flex-shrink:0">${m.time}</div>
            </div>
            <div style="font-size:12px;color:var(--text-secondary);line-height:1.55">${m.msg}</div>
          </div>
          ${m.unread ? `<div style="width:7px;height:7px;border-radius:50%;background:var(--blue);flex-shrink:0;margin-top:5px;box-shadow:0 0 6px rgba(74,158,255,0.5)"></div>` : ''}
        </div>
      `).join('')}
    </div>
  `;
}

// ── Profile & Settings ────────────────────────────────────────────────────────
export function pgPatientProfile(user) {
  setTopbar('Profile & Settings');
  const initials = (user?.display_name || '?').slice(0, 2).toUpperCase();
  document.getElementById('patient-content').innerHTML = `
    <div class="g2">
      <div>
        <div class="card">
          <div class="card-header"><h3>My Profile</h3></div>
          <div class="card-body">
            <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px">
              <div class="avatar" style="width:52px;height:52px;font-size:18px;background:linear-gradient(135deg,var(--blue-dim),var(--violet))">${initials}</div>
              <div>
                <div style="font-size:14px;font-weight:600;color:var(--text-primary)">${user?.display_name || 'Patient'}</div>
                <div style="font-size:12px;color:var(--text-tertiary)">${user?.email || ''}</div>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Full Name</label>
              <input class="form-control" value="${user?.display_name || ''}" readonly style="opacity:0.7">
            </div>
            <div class="form-group">
              <label class="form-label">Email</label>
              <input class="form-control" value="${user?.email || ''}" readonly style="opacity:0.7">
            </div>
            <div class="notice notice-info" style="font-size:11.5px;margin-top:4px">
              To update your name or email, contact your clinic directly.
            </div>
          </div>
        </div>
      </div>
      <div>
        <div class="card">
          <div class="card-header"><h3>Notification Preferences</h3></div>
          <div class="card-body">
            ${[
              ['Session Reminders',     'Email + SMS'],
              ['Assessment Reminders',  'Email'],
              ['Report Notifications',  'Email'],
              ['Language',              'English'],
            ].map(([k, v]) => `
              <div class="field-row">
                <span>${k}</span>
                <span style="color:var(--blue)">${v}</span>
              </div>
            `).join('')}
            <button class="btn btn-ghost btn-sm" style="margin-top:12px" onclick="alert('Preference settings coming soon.')">
              Update Preferences
            </button>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h3>Account</h3></div>
          <div class="card-body" style="display:flex;flex-direction:column;gap:8px">
            <button class="btn btn-ghost btn-sm" onclick="alert('Password change coming soon.')">Change Password</button>
            <button class="btn btn-danger btn-sm" onclick="window.doLogout()">Sign Out ↪</button>
          </div>
        </div>
      </div>
    </div>
  `;
}
