// Patient portal pages — simpler, calmer UI than the professional app
// All pages render into #patient-content
import { api } from './api.js';

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

// ── Sparkline helper ──────────────────────────────────────────────────────────
function sparklineSVG(data, color, width = 120, height = 32) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pad = 3;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * w;
    const y = pad + h - ((v - min) / range) * h;
    return `${x},${y}`;
  });
  const polyline = pts.join(' ');
  // Area fill path
  const first = pts[0].split(',');
  const last  = pts[pts.length - 1].split(',');
  const area  = `M${first[0]},${height} L${pts.join(' L')} L${last[0]},${height} Z`;
  const id    = `sg-${Math.random().toString(36).slice(2)}`;
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" class="pt-sparkline">
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.25"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="${area}" fill="url(#${id})"/>
    <polyline points="${polyline}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="pt-sparkline-line"/>
    <circle cx="${last[0]}" cy="${last[1]}" r="2.5" fill="${color}"/>
  </svg>`;
}

// ── Session countdown ring ────────────────────────────────────────────────────
function countdownRingSVG(daysLeft, hoursLeft) {
  const total     = 7;
  const fraction  = Math.max(0, Math.min(1, daysLeft / total));
  const r         = 38;
  const circ      = 2 * Math.PI * r;
  const dash      = fraction * circ;
  const gap       = circ - dash;
  return `
    <div class="pt-countdown-ring-wrap">
      <svg width="100" height="100" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="${r}" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="6"/>
        <circle cx="50" cy="50" r="${r}" fill="none"
          stroke="var(--teal)" stroke-width="6"
          stroke-dasharray="${dash} ${gap}"
          stroke-dashoffset="${circ / 4}"
          stroke-linecap="round"
          style="transition:stroke-dasharray 1s ease;filter:drop-shadow(0 0 4px var(--teal-glow))"/>
      </svg>
      <div class="pt-countdown-inner">
        <div class="pt-countdown-days">${daysLeft}</div>
        <div class="pt-countdown-label">days</div>
      </div>
    </div>
    <div style="margin-top:8px;text-align:center">
      <div style="font-size:12px;font-weight:600;color:var(--text-primary)">Next Session</div>
      <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">Tomorrow · 10:00 AM</div>
      ${hoursLeft < 24 ? `<div style="font-size:11px;color:var(--teal);margin-top:3px">${hoursLeft}h ${Math.floor(Math.random()*59)}m remaining</div>` : ''}
    </div>`;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export async function pgPatientDashboard(user) {
  setTopbar('My Dashboard');
  const firstName = (user?.display_name || 'there').split(' ')[0];

  // Fetch live data (fire early, non-blocking)
  const [portalCourses, portalSessions] = await Promise.all([
    api.patientPortalCourses().catch(() => null),
    api.patientPortalSessions().catch(() => null),
  ]);

  const activeCourse  = portalCourses?.find(c => c.status === 'active') || portalCourses?.[0] || null;
  const sessionsDone  = (portalSessions || []).length;
  const totalPlanned  = activeCourse?.total_sessions_planned || null;
  const progressPct   = (totalPlanned && sessionsDone) ? Math.round((sessionsDone / totalPlanned) * 100) : null;

  // Wellbeing sparkline data (last 8 weeks, higher = more improvement)
  const sparkData = {
    depression:  [28, 35, 42, 50, 55, 61, 65, 68],
    anxiety:     [20, 27, 33, 40, 44, 50, 52, 55],
    sleep:       [40, 45, 52, 58, 62, 67, 70, 72],
    wellbeing:   [30, 37, 44, 50, 54, 59, 62, 65],
  };

  document.getElementById('patient-content').innerHTML = `
    <div style="margin-bottom:24px">
      <div style="font-family:var(--font-display);font-size:19px;font-weight:600;color:var(--text-primary);margin-bottom:4px">
        Welcome back, ${firstName} 👋
      </div>
      <div style="font-size:12.5px;color:var(--text-secondary)">Here's your treatment journey at a glance.</div>
    </div>

    <div class="g3" style="margin-bottom:24px">
      <div class="metric-card" style="border-color:var(--border-blue)">
        <div class="metric-label">Sessions Completed</div>
        <div class="metric-value" style="color:var(--teal)">${sessionsDone > 0 ? sessionsDone : '—'}</div>
        <div class="metric-delta">${totalPlanned ? `of ${totalPlanned} planned` : 'No active course'}</div>
      </div>
      <div class="metric-card" style="border-color:var(--border-teal)">
        <div class="metric-label">Course Progress</div>
        <div class="metric-value">${progressPct !== null ? progressPct + '%' : '—'}</div>
        <div class="metric-delta">${activeCourse ? `${activeCourse.status === 'active' ? 'Active' : activeCourse.status}` : 'No active course'}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Current Course</div>
        <div class="metric-value" style="font-size:16px;color:var(--teal);letter-spacing:-0.3px">${activeCourse ? (activeCourse.modality_slug?.toUpperCase() || activeCourse.protocol_id) : '—'}</div>
        <div class="metric-delta">${activeCourse?.condition_slug || 'Contact your clinic'}</div>
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
        <div class="card" style="margin-bottom:20px">
          <div class="card-header"><h3>Next Session Countdown</h3></div>
          <div class="card-body" style="display:flex;flex-direction:column;align-items:center;padding:20px 18px">
            ${countdownRingSVG(1, 18)}
          </div>
        </div>

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
            <div style="font-size:10.5px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:14px">Weekly Wellbeing Tracking</div>
            ${[
              { label: 'Depression (PHQ-9)',  data: sparkData.depression, color: 'var(--teal)',   val: 68 },
              { label: 'Anxiety (GAD-7)',     data: sparkData.anxiety,    color: 'var(--blue)',   val: 55 },
              { label: 'Sleep Quality',       data: sparkData.sleep,      color: 'var(--green)',  val: 72 },
              { label: 'Overall Wellbeing',   data: sparkData.wellbeing,  color: 'var(--violet)', val: 65 },
            ].map(r => `
              <div class="pt-sparkline-row">
                <span class="ev-label" style="min-width:140px">${r.label}</span>
                ${sparklineSVG(r.data, r.color)}
                <span style="font-size:11px;color:var(--text-secondary);width:34px;text-align:right;flex-shrink:0">${r.val}%</span>
              </div>
            `).join('')}
            <div style="font-size:11px;color:var(--text-tertiary);margin-top:10px">Higher = more improvement vs. baseline</div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h3>Actions Needed</h3></div>
          <div class="card-body" style="padding:0 18px">
            <div class="pt-action-row" onclick="window._navPatient('patient-assessments')" style="cursor:pointer">
              <div style="width:32px;height:32px;border-radius:var(--radius-md);background:rgba(255,255,255,0.03);display:flex;align-items:center;justify-content:center;color:var(--amber);flex-shrink:0">◉</div>
              <div style="flex:1">
                <div style="font-size:12px;font-weight:500;color:var(--text-primary)">Weekly Mood Assessment</div>
                <div style="font-size:11px;color:var(--text-tertiary)">Due Thursday</div>
              </div>
              <div style="font-size:11px;color:var(--text-tertiary)">→</div>
            </div>
            <div class="pt-action-row" onclick="window._navPatient('patient-reports')" style="cursor:pointer">
              <div style="width:32px;height:32px;border-radius:var(--radius-md);background:rgba(255,255,255,0.03);display:flex;align-items:center;justify-content:center;color:var(--blue);flex-shrink:0">◱</div>
              <div style="flex:1">
                <div style="font-size:12px;font-weight:500;color:var(--text-primary)">Review Session #12 Report</div>
                <div style="font-size:11px;color:var(--text-tertiary)">Ready to view</div>
              </div>
              <div style="font-size:11px;color:var(--text-tertiary)">→</div>
            </div>
            <div class="pt-action-row" style="cursor:default">
              <div style="width:32px;height:32px;border-radius:var(--radius-md);background:rgba(255,255,255,0.03);display:flex;align-items:center;justify-content:center;color:var(--text-tertiary);flex-shrink:0">◇</div>
              <div style="flex:1">
                <div style="font-size:12px;font-weight:500;color:var(--text-primary)">Update Emergency Contact</div>
                <div style="font-size:11px;color:var(--text-tertiary)">Requested by clinic</div>
              </div>
              <div style="font-size:11px;color:var(--text-tertiary)">→</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Animate sparklines in after paint
  requestAnimationFrame(() => {
    document.querySelectorAll('.pt-sparkline-line').forEach(el => {
      el.classList.add('pt-sparkline-animate');
    });
  });
}

// ── Sessions ──────────────────────────────────────────────────────────────────
export async function pgPatientSessions() {
  setTopbar('My Sessions');

  // Show skeleton while loading
  document.getElementById('patient-content').innerHTML = `<div style="text-align:center;padding:48px;color:var(--text-tertiary)">Loading sessions…</div>`;

  const sessions = await api.patientPortalSessions().catch(() => []);

  // Sort by delivered_at desc — most recent first
  sessions.sort((a, b) => new Date(b.delivered_at) - new Date(a.delivered_at));

  const sessionHistoryHtml = sessions.length === 0
    ? `<div style="text-align:center;padding:36px;color:var(--text-tertiary)">
        <div style="font-size:18px;margin-bottom:8px;opacity:.4">◧</div>
        No session history yet. Sessions will appear here once your treatment begins.
      </div>`
    : sessions.map(s => {
        const date = s.delivered_at ? new Date(s.delivered_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
        const mod  = s.modality_slug?.toUpperCase() || 'Session';
        const note = s.session_notes || (s.tolerance === 'poor' ? 'Tolerance: poor' : 'No adverse events');
        return `
          <div class="pt-session-card">
            <div class="pt-session-icon done">✓</div>
            <div style="flex:1">
              <div style="font-size:13px;font-weight:600;color:var(--text-primary)">Session #${s.session_number} — ${mod}</div>
              <div style="font-size:11.5px;color:var(--text-tertiary);margin-top:3px">${note}</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:12px;color:var(--text-secondary)">${date}</div>
              ${s.outcome ? `<div style="font-size:11px;color:var(--${s.outcome === 'positive' ? 'green' : s.outcome === 'negative' ? 'red' : 'text-tertiary'})">${s.outcome}</div>` : ''}
            </div>
          </div>`;
      }).join('');

  document.getElementById('patient-content').innerHTML = `
    <div class="tab-bar">
      <button class="tab-btn active" id="s-tab-up" onclick="window._ptSessTab('upcoming')">Upcoming</button>
      <button class="tab-btn" id="s-tab-done" onclick="window._ptSessTab('completed')">Completed (${sessions.length})</button>
    </div>
    <div id="pt-sess-upcoming">
      <div class="card">
        <div class="card-body">
          <div style="text-align:center;padding:24px;color:var(--text-tertiary)">
            <div style="font-size:18px;margin-bottom:8px;opacity:.4">◧</div>
            Upcoming session scheduling will be shown here. Contact your clinic to confirm your next appointment.
          </div>
        </div>
      </div>
    </div>
    <div id="pt-sess-completed" style="display:none">
      ${sessionHistoryHtml}
    </div>
  `;

  window._ptSessTab = function(tab) {
    document.getElementById('pt-sess-upcoming').style.display   = tab === 'upcoming'   ? '' : 'none';
    document.getElementById('pt-sess-completed').style.display  = tab === 'completed'  ? '' : 'none';
    document.getElementById('s-tab-up').classList.toggle('active',   tab === 'upcoming');
    document.getElementById('s-tab-done').classList.toggle('active', tab === 'completed');
  };

  window._ptToggleSession = function(n) {
    const detail = document.getElementById(`pt-sess-detail-${n}`);
    const chev   = document.getElementById(`pt-chev-${n}`);
    const isOpen = detail.classList.contains('open');
    // Close all
    document.querySelectorAll('.pt-sess-detail').forEach(d => d.classList.remove('open'));
    document.querySelectorAll('.pt-sess-chevron').forEach(c => c.style.transform = '');
    // Open clicked if was closed
    if (!isOpen) {
      detail.classList.add('open');
      chev.style.transform = 'rotate(180deg)';
    }
  };
}

// ── My Treatment ──────────────────────────────────────────────────────────────
export function pgPatientCourse() {
  setTopbar('My Treatment');

  // Session timeline: 1-12 complete, 13 active, 14-20 upcoming
  // Approximate dates: started Feb 26, 2026, 3 sessions/week
  const sessionDates = [
    'Feb 26', 'Feb 28', 'Mar 3', 'Mar 5', 'Mar 7', 'Mar 10',
    'Mar 12', 'Mar 14', 'Mar 17', 'Mar 19', 'Mar 21', 'Apr 7',
    'Apr 11', 'Apr 14', 'Apr 18', 'Apr 21', 'Apr 25', 'Apr 28', 'May 2', 'May 7',
  ];

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

    <div class="card" style="margin-bottom:20px">
      <div class="card-header"><h3>Session Timeline</h3></div>
      <div class="card-body">
        <div class="pt-timeline">
          ${Array.from({ length: 20 }, (_, i) => {
            const n      = i + 1;
            const date   = sessionDates[i];
            const state  = n < 13 ? 'done' : n === 13 ? 'active' : 'upcoming';
            const dotCls = `pt-tl-dot pt-tl-dot-${state}`;
            const label  = state === 'done'
              ? `<span style="color:var(--green);font-size:11px;font-weight:500">Session ${n}</span><span style="color:var(--text-tertiary);font-size:10.5px">${date}, 2026</span>`
              : state === 'active'
              ? `<span style="color:var(--teal);font-size:11px;font-weight:600">Session ${n} — Current</span><span style="color:var(--teal);font-size:10.5px">${date}, 2026</span>`
              : `<span style="color:var(--text-tertiary);font-size:11px">Session ${n}</span><span style="color:var(--text-tertiary);font-size:10.5px">${date}, 2026</span>`;
            return `
              <div class="pt-tl-row ${n === 20 ? 'pt-tl-last' : ''}">
                <div class="pt-tl-spine">
                  <div class="${dotCls}">${state === 'done' ? '✓' : state === 'active' ? '' : ''}</div>
                  ${n < 20 ? '<div class="pt-tl-line"></div>' : ''}
                </div>
                <div class="pt-tl-content">${label}</div>
              </div>`;
          }).join('')}
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

// ── PHQ-9 Assessment ──────────────────────────────────────────────────────────
const PHQ9_QUESTIONS = [
  'Little interest or pleasure in doing things',
  'Feeling down, depressed, or hopeless',
  'Trouble falling or staying asleep, or sleeping too much',
  'Feeling tired or having little energy',
  'Poor appetite or overeating',
  'Feeling bad about yourself — or that you are a failure or have let yourself or your family down',
  'Trouble concentrating on things, such as reading the newspaper or watching television',
  'Moving or speaking so slowly that other people could have noticed? Or being so fidgety or restless that you have been moving more than usual',
  'Thoughts that you would be better off dead, or thoughts of hurting yourself in some way',
];
const PHQ9_OPTIONS = ['Not at all', 'Several days', 'More than half the days', 'Nearly every day'];

function phq9Severity(score) {
  if (score <= 4)  return { label: 'Minimal',           color: 'var(--green)' };
  if (score <= 9)  return { label: 'Mild',               color: 'var(--teal)' };
  if (score <= 14) return { label: 'Moderate',           color: 'var(--blue)' };
  if (score <= 19) return { label: 'Moderately Severe',  color: 'var(--amber)' };
  return               { label: 'Severe',               color: '#ff6b6b' };
}

function renderPHQ9Form(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `
    <div class="pt-assessment-form" id="phq9-form-wrap">
      <div style="font-size:10.5px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:14px">
        PHQ-9 — Over the last 2 weeks, how often have you been bothered by any of the following problems?
      </div>
      ${PHQ9_QUESTIONS.map((q, i) => `
        <div class="pt-phq9-question" id="phq9-q${i}">
          <div style="font-size:12.5px;color:var(--text-primary);margin-bottom:8px;line-height:1.5">
            <span style="color:var(--text-tertiary);margin-right:6px">${i + 1}.</span>${q}
          </div>
          <div class="pt-phq9-options">
            ${PHQ9_OPTIONS.map((opt, v) => `
              <label class="pt-phq9-option" onclick="window._ptPHQ9Pick(${i}, ${v})">
                <input type="radio" name="phq9_q${i}" value="${v}" style="display:none">
                <span class="pt-phq9-radio" id="phq9-r${i}-${v}"></span>
                <span style="font-size:11.5px;color:var(--text-secondary)">${opt}</span>
              </label>
            `).join('')}
          </div>
        </div>
      `).join('')}
      <div style="display:flex;align-items:center;gap:16px;margin-top:20px;padding-top:16px;border-top:1px solid var(--border)">
        <div style="flex:1">
          <div style="font-size:11px;color:var(--text-tertiary)">Real-time score</div>
          <div style="font-size:20px;font-weight:700;font-family:var(--font-display);color:var(--teal)" id="phq9-live-score">0 / 27</div>
        </div>
        <button class="btn btn-primary" onclick="window._ptPHQ9Submit()">Submit Assessment →</button>
      </div>
      <div id="phq9-result" style="display:none"></div>
    </div>
  `;

  // State
  window._phq9Answers = new Array(9).fill(null);

  window._ptPHQ9Pick = function(q, v) {
    window._phq9Answers[q] = v;
    // Update radio visuals
    for (let opt = 0; opt < 4; opt++) {
      const r = document.getElementById(`phq9-r${q}-${opt}`);
      if (r) r.classList.toggle('selected', opt === v);
    }
    // Highlight answered question
    const qEl = document.getElementById(`phq9-q${q}`);
    if (qEl) qEl.classList.add('answered');
    // Live score
    const score = window._phq9Answers.reduce((sum, a) => sum + (a ?? 0), 0);
    const liveEl = document.getElementById('phq9-live-score');
    if (liveEl) liveEl.textContent = `${score} / 27`;
  };

  window._ptPHQ9Submit = function() {
    const unanswered = window._phq9Answers.findIndex(a => a === null);
    if (unanswered !== -1) {
      const qEl = document.getElementById(`phq9-q${unanswered}`);
      if (qEl) { qEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); qEl.classList.add('pt-phq9-highlight'); }
      return;
    }
    const score    = window._phq9Answers.reduce((sum, a) => sum + a, 0);
    const severity = phq9Severity(score);
    const pct      = Math.round((score / 27) * 100);
    const resultEl = document.getElementById('phq9-result');
    if (!resultEl) return;
    resultEl.style.display = '';
    resultEl.innerHTML = `
      <div style="margin-top:20px;padding:20px;border-radius:var(--radius-lg);border:1px solid var(--border-teal);background:rgba(0,212,188,0.04)">
        <div style="font-size:10.5px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:10px">Assessment Result</div>
        <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:12px">
          <div style="font-size:32px;font-weight:700;font-family:var(--font-display);color:${severity.color}">${score}</div>
          <div style="font-size:13px;color:var(--text-secondary)">out of 27</div>
          <div style="margin-left:auto;font-size:14px;font-weight:600;color:${severity.color}">${severity.label}</div>
        </div>
        <div class="progress-bar" style="height:8px;margin-bottom:8px">
          <div style="height:100%;width:${pct}%;background:${severity.color};border-radius:4px;transition:width 0.8s ease"></div>
        </div>
        <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.6;margin-top:12px">
          Your score has been recorded. Your care team will review these results before your next session.
          If you are experiencing thoughts of self-harm, please contact your clinician immediately or call a crisis line.
        </div>
      </div>
    `;
    // Scroll to result
    setTimeout(() => resultEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
  };
}

// ── Assessments ───────────────────────────────────────────────────────────────
export function pgPatientAssessments() {
  setTopbar('Assessments');

  const completedScores = [
    { name: 'Session #12 Wellbeing Survey', score: 18, max: 25 },
    { name: 'Session #10 Wellbeing Survey', score: 16, max: 25 },
    { name: 'Baseline Assessment',          score: 31, max: 39 },
  ];

  document.getElementById('patient-content').innerHTML = `
    <div class="notice notice-info" style="margin-bottom:20px">
      ◉ &nbsp;Your next assessment is due <strong>Thursday, April 13</strong>. Please complete it before your session.
    </div>

    <div class="card" id="pt-assess-pending-card">
      <div class="card-header">
        <h3>Weekly Mood Check-in</h3>
        <span class="pill pill-pending">Due</span>
      </div>
      <div class="card-body" style="display:flex;align-items:center;gap:16px">
        <div style="flex:1">
          <div style="font-size:12px;color:var(--text-tertiary)">PHQ-9 + GAD-7</div>
          <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">Due Thu Apr 13</div>
        </div>
        <button class="btn btn-primary btn-sm" id="pt-assess-start-btn" onclick="window._ptToggleAssessment()">Start &rarr;</button>
      </div>
      <div id="pt-assess-form-container" style="display:none;padding:0 18px 18px"></div>
    </div>

    ${completedScores.map((a, idx) => {
      const pct   = Math.round((a.score / a.max) * 100);
      const color = pct >= 70 ? 'var(--green)' : pct >= 50 ? 'var(--teal)' : 'var(--amber)';
      return `
        <div class="card">
          <div class="card-header">
            <h3>${a.name}</h3>
            <span class="pill pill-active">Completed</span>
          </div>
          <div class="card-body">
            <div style="display:flex;align-items:center;gap:16px;margin-bottom:12px">
              <div style="flex:1">
                <div style="font-size:12px;color:var(--text-tertiary)">Custom · ${a.max} items</div>
                <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">
                  ${idx === 0 ? 'Completed Apr 7' : idx === 1 ? 'Completed Apr 1' : 'Completed Feb 25'}
                </div>
              </div>
              <div style="font-size:18px;font-weight:700;font-family:var(--font-display);color:${color}">${a.score}<span style="font-size:12px;font-weight:400;color:var(--text-tertiary)">/${a.max}</span></div>
              <button class="btn btn-ghost btn-sm">View &rarr;</button>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:10.5px;color:var(--text-tertiary);margin-bottom:5px">
              <span>Score</span><span>${pct}%</span>
            </div>
            <div class="progress-bar" style="height:6px">
              <div style="height:100%;width:${pct}%;background:${color};border-radius:4px;transition:width 0.6s ease"></div>
            </div>
          </div>
        </div>`;
    }).join('')}
  `;

  window._ptToggleAssessment = function() {
    const container = document.getElementById('pt-assess-form-container');
    const btn       = document.getElementById('pt-assess-start-btn');
    if (!container) return;
    const isOpen = container.style.display !== 'none';
    if (isOpen) {
      container.style.display = 'none';
      btn.textContent = 'Start →';
    } else {
      container.style.display = '';
      btn.textContent = 'Close ✕';
      renderPHQ9Form('pt-assess-form-container');
      setTimeout(() => container.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
    }
  };
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
          <button class="btn btn-ghost btn-sm" disabled style="opacity:0.5">Download</button>
        </div>
      </div>
    `).join('')}
  `;
}

// ── Messages ──────────────────────────────────────────────────────────────────
export function pgPatientMessages() {
  setTopbar('Messages');

  const initialMessages = [
    { from: 'Dr. Smith',   msg: 'Your session report from Monday is ready for review. Overall progress looks very positive — keep it up.', time: '2h ago',  unread: true,  initials: 'DS', outgoing: false },
    { from: 'Clinic Team', msg: "Reminder: Please complete your weekly mood assessment before Thursday's session.", time: '1d ago',  unread: true,  initials: 'CT', outgoing: false },
    { from: 'Dr. Smith',   msg: 'Great progress this week. Session parameters will stay the same for session #13.', time: '3d ago',  unread: false, initials: 'DS', outgoing: false },
    { from: 'Clinic Team', msg: 'Your next appointment has been confirmed: Tomorrow at 10:00 AM, Room 2.', time: '4d ago',  unread: false, initials: 'CT', outgoing: false },
    { from: 'Dr. Smith',   msg: 'Please remember to avoid caffeine 2 hours before your session for best results.', time: '6d ago',  unread: false, initials: 'DS', outgoing: false },
  ];

  function msgRowHTML(m) {
    if (m.outgoing) {
      return `<div class="pt-msg-outgoing">
        <div class="pt-msg-bubble-out">
          <div style="font-size:12px;color:var(--text-secondary);line-height:1.55">${m.msg}</div>
          <div style="font-size:10px;color:rgba(0,212,188,0.6);margin-top:5px;text-align:right">${m.time}</div>
        </div>
        <div class="avatar" style="background:linear-gradient(135deg,var(--teal-dim),var(--blue-dim));flex-shrink:0;font-size:10px">You</div>
      </div>`;
    }
    return `<div style="display:flex;gap:12px;padding:16px 18px;border-bottom:1px solid var(--border);background:${m.unread ? 'rgba(74,158,255,0.03)' : 'var(--bg-card)'}">
      <div class="avatar" style="background:${m.initials === 'DS' ? 'linear-gradient(135deg,var(--teal-dim),var(--blue-dim))' : 'linear-gradient(135deg,var(--violet),var(--blue-dim))'};flex-shrink:0">${m.initials}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
          <div style="font-size:12.5px;font-weight:${m.unread ? 600 : 400};color:var(--text-primary)">${m.from}</div>
          <div style="font-size:10.5px;color:var(--text-tertiary);flex-shrink:0">${m.time}</div>
        </div>
        <div style="font-size:12px;color:var(--text-secondary);line-height:1.55">${m.msg}</div>
      </div>
      ${m.unread ? `<div style="width:7px;height:7px;border-radius:50%;background:var(--blue);flex-shrink:0;margin-top:5px;box-shadow:0 0 6px rgba(74,158,255,0.5)"></div>` : ''}
    </div>`;
  }

  document.getElementById('patient-content').innerHTML = `
    <div style="border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden;margin-bottom:16px" id="pt-msg-list">
      ${initialMessages.map(m => msgRowHTML(m)).join('')}
    </div>
    <div class="card" style="border-color:var(--border)">
      <div class="card-body" style="padding:14px 16px">
        <div style="font-size:10.5px;color:var(--text-tertiary);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.7px">Reply to your care team</div>
        <textarea
          id="pt-msg-input"
          class="form-control"
          rows="3"
          placeholder="Type your message here…"
          style="resize:vertical;min-height:72px;margin-bottom:10px"
        ></textarea>
        <div style="display:flex;justify-content:flex-end">
          <button class="btn btn-primary btn-sm" onclick="window._ptSendMessage()">Send Message →</button>
        </div>
      </div>
    </div>
  `;

  window._ptSendMessage = function() {
    const input = document.getElementById('pt-msg-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    const list = document.getElementById('pt-msg-list');
    if (!list) return;
    const newMsg = { from: 'You', msg: text, time: 'Just now', unread: false, initials: 'You', outgoing: true };
    const div = document.createElement('div');
    div.innerHTML = msgRowHTML(newMsg);
    const firstChild = list.firstElementChild;
    if (firstChild) {
      list.insertBefore(div.firstElementChild, firstChild);
    } else {
      list.appendChild(div.firstElementChild);
    }
    input.value = '';
    input.focus();
  };
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
            <span style="font-size:11px;color:var(--text-tertiary);display:inline-block;margin-top:12px;padding:4px 10px;border:1px solid var(--border);border-radius:var(--radius-md)">Preference editing — coming soon</span>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h3>Account</h3></div>
          <div class="card-body" style="display:flex;flex-direction:column;gap:8px">
            <button class="btn btn-ghost btn-sm" disabled style="opacity:0.5">Change Password (coming soon)</button>
            <button class="btn btn-danger btn-sm" onclick="window.doLogout()">Sign Out ↪</button>
          </div>
        </div>
      </div>
    </div>
  `;
}
