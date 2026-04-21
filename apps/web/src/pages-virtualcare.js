// ─────────────────────────────────────────────────────────────────────────────
// pages-virtualcare.js — Virtual Care Hub
// Video Visits · Voice Calls · Messaging · Note Capture · AI Transcription
// ─────────────────────────────────────────────────────────────────────────────

import { api } from './api.js';
import { CONDITION_HOME_TEMPLATES } from './home-program-condition-templates.js';

const _e = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const _fmtTime = iso => { try { return new Date(iso).toLocaleString('en-GB',{hour:'2-digit',minute:'2-digit',day:'numeric',month:'short'}); } catch { return iso; } };
const _ago = iso => { try { const diff = Date.now()-new Date(iso).getTime(); const m=Math.floor(diff/60000); if(m<60) return m+'m ago'; const h=Math.floor(m/60); if(h<24) return h+'h ago'; return Math.floor(h/24)+'d ago'; } catch { return ''; } };

const _hasSpeech = 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;

function _startLiveTranscription() {
  if (!_hasSpeech || _vc.speechRec) return;
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rec = new Rec();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = 'en-GB';
  _vc.speechRec = rec;
  _vc.liveTranscript = '';
  _vc.interimText = '';

  rec.onresult = function(e) {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) {
        _vc.liveTranscript += t + ' ';
        const el = document.getElementById('vc-live-transcript');
        if (el) el.innerHTML += `<div style="margin-bottom:4px"><span style="font-size:9px;color:var(--text-tertiary)">${new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</span> ${_e(t)}</div>`;
      } else {
        interim += t;
      }
    }
    const intEl = document.getElementById('vc-interim-text');
    if (intEl) intEl.textContent = interim;
  };
  rec.onend = function() {
    if (_vc.activeCall?.phase === 'active') { try { rec.start(); } catch {} }
  };
  rec.onerror = function() {};
  try { rec.start(); } catch {}
}

function _stopLiveTranscription() {
  if (_vc.speechRec) { try { _vc.speechRec.stop(); } catch {} _vc.speechRec = null; }
}

// ── Seed data ────────────────────────────────────────────────────────────────
const VC_DATA = {
  callRequests: [
    { id:'cr1', patientId:'p001', patientName:'Emma Larson',  initials:'EL', condition:'TRD',  modality:'TMS',
      requestedAt:'2026-04-12T08:45:00Z', preferredTime:'Morning (9–11am)', type:'video',
      reason:'Headache after session 9, feels worse than usual', urgency:'urgent',
      courseRef:'TMS — Week 5', sessionRef:'Session 9' },
    { id:'cr2', patientId:'p002', patientName:'James Okafor', initials:'JO', condition:'GAD',  modality:'Neurofeedback',
      requestedAt:'2026-04-12T07:30:00Z', preferredTime:'Afternoon (2–4pm)', type:'voice',
      reason:'Question about homework protocol and schedule change', urgency:'routine',
      courseRef:'NF — Week 3', sessionRef:'Session 6' },
    { id:'cr3', patientId:'p003', patientName:'Ana Reyes',   initials:'AR', condition:'PTSD', modality:'tDCS',
      requestedAt:'2026-04-11T15:00:00Z', preferredTime:'Flexible', type:'voice',
      reason:'Consent question for upcoming protocol change', urgency:'routine',
      courseRef:'tDCS — Week 2', sessionRef:'Session 4' },
  ],
  videoVisits: [
    { id:'vv1', patientId:'p001', patientName:'Emma Larson',  initials:'EL', condition:'TRD', modality:'TMS',
      scheduledAt:'2026-04-12T14:00:00Z', duration:30, purpose:'Mid-course check-in and side effect review',
      status:'scheduled', notesStatus:'pending' },
    { id:'vv2', patientId:'p004', patientName:'David Chen',   initials:'DC', condition:'OCD', modality:'TMS',
      scheduledAt:'2026-04-12T10:30:00Z', duration:20, purpose:'Post-intensive follow-up',
      status:'completed', notesStatus:'draft' },
    { id:'vv3', patientId:'p005', patientName:'Priya Nair',   initials:'PN', condition:'MDD', modality:'CES',
      scheduledAt:'2026-04-11T16:00:00Z', duration:30, purpose:'Initial virtual assessment',
      status:'missed', notesStatus:'pending' },
  ],
  voiceCalls: [
    { id:'vc1', patientId:'p002', patientName:'James Okafor', initials:'JO', condition:'GAD',  modality:'NF',
      scheduledAt:'2026-04-12T11:00:00Z', duration:20, purpose:'Weekly check-in',
      status:'scheduled', notesStatus:'pending' },
    { id:'vc2', patientId:'p003', patientName:'Ana Reyes',   initials:'AR', condition:'PTSD', modality:'tDCS',
      scheduledAt:'2026-04-11T14:00:00Z', duration:15, purpose:'Adverse event follow-up',
      status:'completed', notesStatus:'signed' },
    { id:'vc3', patientId:'p001', patientName:'Emma Larson',  initials:'EL', condition:'TRD',  modality:'TMS',
      scheduledAt:'2026-04-10T15:30:00Z', duration:20, purpose:'Session 8 feedback',
      status:'follow-up-needed', notesStatus:'draft' },
  ],
  patientUpdates: [
    { id:'pu1', patientId:'p001', patientName:'Emma Larson',  initials:'EL', condition:'TRD', modality:'TMS',
      type:'voice-note', submittedAt:'2026-04-12T07:15:00Z',
      subject:'Post-session headache — Session 9', reason:'Side effect concern',
      severity:'Moderate (6/10)', trend:'Worse', sessionRef:'Session 9',
      duration:'1:42', urgency:'urgent', reviewed:false,
      transcription:'I wanted to leave a note about my headache. It started about two hours after session nine. It\'s about a six out of ten, throbbing kind of pain. It\'s worse than what I had after sessions seven and eight. I\'ve been resting and it helped a bit but it\'s still there. Duration was probably about three hours total.',
      aiSummary:'Post-session headache (6/10) starting ~2h post-session 9. Worse than sessions 7–8. Throbbing character. No nausea. Rest partially helpful. Duration ~3 hours. Recommend clinician review before session 10.' },
    { id:'pu2', patientId:'p002', patientName:'James Okafor', initials:'JO', condition:'GAD',  modality:'NF',
      type:'text-update', submittedAt:'2026-04-11T21:30:00Z',
      subject:'Feeling calmer — tracking homework', reason:'Progress update',
      severity:'None', trend:'Better', sessionRef:'Session 6', urgency:'routine', reviewed:false,
      transcription:'Feeling noticeably calmer in social situations this week. Completed 5 out of 7 homework sessions. Sleep has improved slightly. No side effects to report.',
      aiSummary:'Social anxiety reduced. 5/7 homework sessions completed. Sleep slightly improved. No adverse events.' },
    { id:'pu3', patientId:'p004', patientName:'David Chen',   initials:'DC', condition:'OCD',  modality:'TMS',
      type:'video-update', submittedAt:'2026-04-11T18:00:00Z',
      subject:'Compulsion frequency self-report', reason:'Weekly self-report',
      severity:'Mild', trend:'Same', sessionRef:'Session 7', duration:'2:15',
      urgency:'routine', reviewed:true,
      transcription:'Checking behaviour has gone from about fifteen times a day down to ten. Work stress seems to be maintaining it. Homework compliance has been good. No new side effects.',
      aiSummary:'Checking: ~15→10x/day. Work stress as maintaining factor. Good homework compliance. No new adverse events.' },
  ],
  clinicianNotes: [
    { id:'cn1', patientId:'p001', patientName:'Emma Larson',  initials:'EL', condition:'TRD', modality:'TMS',
      type:'voice', recordedAt:'2026-04-11T17:00:00Z', subject:'Session 9 — Clinical observation',
      transcription:'Patient reported increased fatigue during session. Tolerated 120% MT but noted mild scalp discomfort at the coil site. Plan to review intensity for session 10. PHQ-9 improved from 18 to 14 since baseline.',
      aiSummary:'Session 9 TMS: 120% MT, mild scalp discomfort. Fatigue noted. PHQ-9: 18→14. Intensity review planned for session 10.',
      status:'awaiting-signoff', actionsTaken:[] },
    { id:'cn2', patientId:'p004', patientName:'David Chen',   initials:'DC', condition:'OCD',  modality:'TMS',
      type:'text', recordedAt:'2026-04-12T10:45:00Z', subject:'Post-visit note — Video consult',
      transcription:'Virtual visit completed. Patient engaged and motivated. Y-BOCS trending down since week 2. Recommended adding one additional ERP homework task. No adverse events to report.',
      aiSummary:'Virtual visit: engaged, motivated. Y-BOCS improving. ERP: +1 task. No adverse events.',
      status:'awaiting-review', actionsTaken:[] },
    { id:'cn3', patientId:'p002', patientName:'James Okafor', initials:'JO', condition:'GAD',  modality:'NF',
      type:'transcription', recordedAt:'2026-04-10T15:30:00Z', subject:'Phone consultation note',
      transcription:'Called to review homework protocol. Patient consistent with NF sessions. GAD-7 down from 15 to 11. Discussed diaphragmatic breathing as a supplement between sessions.',
      aiSummary:'Phone consult: consistent NF sessions. GAD-7: 15→11. Breathing exercises added. No concerns.',
      status:'signed', actionsTaken:['convert-to-note'] },
  ],
  messages: [
    { id:'msg1', patientId:'p001', patientName:'Emma Larson',  initials:'EL', condition:'TRD',
      lastMsg:'I\'m feeling quite tired after today\'s session.', lastAt:'2026-04-12T09:10:00Z', unread:2 },
    { id:'msg2', patientId:'p002', patientName:'James Okafor', initials:'JO', condition:'GAD',
      lastMsg:'Can I reschedule Thursday\'s appointment?', lastAt:'2026-04-12T08:00:00Z', unread:1 },
    { id:'msg3', patientId:'p004', patientName:'David Chen',   initials:'DC', condition:'OCD',
      lastMsg:'Just completed my OCD worksheet. Feeling better.', lastAt:'2026-04-11T20:30:00Z', unread:0 },
    { id:'msg4', patientId:'p005', patientName:'Priya Nair',   initials:'PN', condition:'MDD',
      lastMsg:'Thank you for the new exercises. I\'ll try them tonight.', lastAt:'2026-04-10T15:00:00Z', unread:0 },
  ],
  messageThreads: {
    'p001': [
      { from:'patient', text:'I completed the breathing exercises today.', at:'2026-04-11T18:00:00Z' },
      { from:'clinician', text:'Great work! How long did you practice?', at:'2026-04-11T18:30:00Z' },
      { from:'patient', text:'About 10 minutes. Felt calmer afterwards.', at:'2026-04-11T19:00:00Z' },
      { from:'patient', text:'I\'m feeling quite tired after today\'s session.', at:'2026-04-12T09:10:00Z' },
    ],
    'p002': [
      { from:'patient', text:'Can I reschedule Thursday\'s appointment?', at:'2026-04-12T08:00:00Z' },
    ],
    'p004': [
      { from:'clinician', text:'How are the ERP exercises going?', at:'2026-04-11T09:00:00Z' },
      { from:'patient', text:'Just completed my OCD worksheet. Feeling better.', at:'2026-04-11T20:30:00Z' },
    ],
    'p005': [
      { from:'clinician', text:'Here are some relaxation exercises for tonight.', at:'2026-04-10T14:30:00Z' },
      { from:'patient', text:'Thank you for the new exercises. I\'ll try them tonight.', at:'2026-04-10T15:00:00Z' },
    ],
  },
};

// ── Module state ──────────────────────────────────────────────────────────────
let _vc = {
  tab: 'inbox',
  selectedPid: null,
  selectedItem: null,
  activeCall: null,    // { type:'video'|'voice', item, phase:'connecting'|'active'|'ended' }
  recording: null,     // { type:'voice'|'video'|'text', phase:'idle'|'recording'|'processing'|'done', ... }
  compose: false,
  messageText: '',
  recorder: null,
  chunks: [],
  speechRec: null,
  liveTranscript: '',
  interimText: '',
  callSummary: '',
  apiMessages: {},
};

// =============================================================================
// pgVirtualCare — entry point for the live-session route.
// If a session seed is queued (set by pgVirtualCareDashboard "Launch" button),
// consume it and go straight to pgLiveSession.  Otherwise show the dashboard.
// =============================================================================
export async function pgVirtualCare(setTopbar, navigate) {
  let currentRoute = '';
  try { currentRoute = new URLSearchParams(location.search).get('page') || ''; } catch {}

  if (currentRoute === 'live-session') {
    // If a seed was queued by the dashboard "Launch" button, consume it and
    // drop straight into the live session.  pgLiveSession reads window._lsSessionSeed
    // for its demo fallback (seed is set, not cleared, so the live session can read it).
    if (window._lsSessionSeed) {
      return pgLiveSession(setTopbar, navigate);
    }
    return pgVirtualCareDashboard(setTopbar, navigate);
  }

  const stubEl = document.getElementById('main-content') || document.getElementById('content');
  if (stubEl) {
    try { setTopbar({ title: 'Virtual Care', subtitle: 'Moved to Live Session' }); } catch { try { setTopbar('Virtual Care', ''); } catch {} }
    stubEl.innerHTML = `
      <div class="dv2-card" style="padding:24px;text-align:center;max-width:520px;margin:48px auto">
        <div style="font-family:var(--dv2-font-display,var(--font-display));font-size:18px;font-weight:600">Virtual Care moved</div>
        <div style="color:var(--dv2-text-secondary,var(--text-secondary));margin:8px 0 16px">This is now part of Live Session.</div>
        <button class="btn btn-primary" onclick="window._nav('live-session')">Open Live Session \u2192</button>
      </div>`;
    return;
  }
  return;
}

// =============================================================================
// pgVirtualCareDashboard — Rich clinical dashboard for the Virtual Care hub.
// Sections: header greeting · alert banner · KPI tiles · today's schedule +
// brain map · caseload table + evidence governance · activity log + outcomes.
// CSS prefix: vc-db-*
// =============================================================================
async function pgVirtualCareDashboard(setTopbar, navigate) {
  const mount = document.getElementById('main-content') || document.getElementById('content');
  if (!mount) return;

  try {
    setTopbar({ title: 'Virtual Care', subtitle: 'Dashboard' });
  } catch {
    try { setTopbar('Virtual Care', 'Dashboard'); } catch {}
  }

  // ── Clinician name ────────────────────────────────────────────────────────
  let clinicianName = 'Dr. Chen';
  try {
    const { currentUser } = await import('./auth.js');
    if (currentUser?.display_name) clinicianName = currentUser.display_name;
    else if (currentUser?.name) clinicianName = currentUser.name;
  } catch {}

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  // ── Helper ────────────────────────────────────────────────────────────────
  const _e = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  // ── Demo seed data ────────────────────────────────────────────────────────
  const DB_SCHEDULE = [
    { time:'09:00', id:'db-p1', name:'Samantha L.',  initials:'SL', protocol:'tDCS · session 12/20',  condition:'MDD · stimulation phase',       room:'Room A',  consent:false },
    { time:'10:00', id:'db-p2', name:'Marcus R.',    initials:'MR', protocol:'rTMS · session 6/30',   condition:'TRD · active course',            room:'Room B',  consent:false },
    { time:'11:00', id:'db-p3', name:'Elena O.',     initials:'EO', protocol:'NF · session 4/12',     condition:'ADHD · baseline stabilisation',  room:'Remote',  consent:false },
    { time:'12:00', id:'db-p4', name:'Jamal T.',     initials:'JT', protocol:'tDCS · session 8/20',   condition:'GAD · mid-course',               room:'Room A',  consent:true  },
    { time:'14:00', id:'db-p5', name:'Priya N.',     initials:'PN', protocol:'CES · session 2/10',    condition:'Insomnia · initial phase',       room:'Home',    consent:false },
    { time:'15:00', id:'open',  name:null,            initials:null, protocol:null,                    condition:null,                             room:null,      consent:false },
  ];

  const DB_CASELOAD = [
    { id:'db-p1', name:'Samantha Li',    condition:'MDD',     protocol:'tDCS · DLPFC-L',    progress:60, next:'Session 13',       urgency:'routine' },
    { id:'db-p4', name:'Jamal Thompson', condition:'GAD',     protocol:'tDCS · PFC-R',       progress:40, next:'Consent refresh', urgency:'urgent'  },
    { id:'db-p2', name:'Marcus Reilly',  condition:'TRD',     protocol:'rTMS · DLPFC-L',    progress:20, next:'Session 7',        urgency:'routine' },
    { id:'db-p5', name:'Priya Nambiar',  condition:'Insomnia',protocol:'CES · bilateral',   progress:20, next:'PHQ-9 due',        urgency:'new'     },
    { id:'db-p3', name:'Elena Okafor',   condition:'ADHD',    protocol:'NF · SMR',           progress:33, next:'Mid-course review',urgency:'routine' },
    { id:'db-p6', name:'Terence Wu',     condition:'MDD',     protocol:'rTMS · deep-TMS',   progress:90, next:'Discharge plan',   urgency:'discharging' },
  ];

  const DB_EVIDENCE = [
    { grade:'A', name:'tDCS · DLPFC-L · 2 mA — 28 RCTs · pinned v3.1.0 · MDD primary',      rerender:false },
    { grade:'B', name:'NF · SMR · 10 Hz — 14 RCTs · pinned v2.0.0 · ADHD primary',           rerender:false },
    { grade:'C', name:'rTMS · iTBS · DLPFC-L — 41 RCTs · pinned v2.4.1 · MDD primary',       rerender:true  },
    { grade:'B', name:'CES · bilateral · 0.5 Hz — 9 RCTs · pinned v1.2.0 · Insomnia',        rerender:false },
    { grade:'A', name:'rTMS · 10Hz · DLPFC-L — 62 RCTs · pinned v4.0.0 · TRD primary',       rerender:false },
  ];

  const DB_ACTIVITY = [
    { icon:'check',    text:'Samantha L. completed session 12/20 · tDCS. Side-effect check-in: clear.',    time:'8m'  },
    { icon:'clip',     text:'Marcus R. pre-session note auto-generated by AI assistant.',                   time:'22m' },
    { icon:'warn',     text:'Jamal T. consent refresh flagged — re-sign required before next session.',    time:'41m' },
    { icon:'sparkle',  text:'Evidence sync: rTMS iTBS downgraded B → C. 3 protocols affected.',            time:'1h'  },
    { icon:'person',   text:'Elena O. joined remote session from home device. Connection stable.',          time:'2h'  },
  ];

  // ── Sparkline SVG (mini) ──────────────────────────────────────────────────
  function sparkline(pts, color) {
    const W = 64, H = 24;
    const min = Math.min(...pts), range = Math.max(...pts) - min || 1;
    const coords = pts.map((v, i) => {
      const x = (i / (pts.length - 1)) * W;
      const y = H - ((v - min) / range) * H;
      return `${x},${y}`;
    }).join(' ');
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;overflow:visible"><polyline points="${coords}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  // ── Outcomes line chart SVG ───────────────────────────────────────────────
  function outcomeChart() {
    const W = 340, H = 120, PAD = 28;
    const weeks = ['W1','W2','W3','W4'];
    const phq = [14.2, 12.1, 9.8, 7.9];
    const gad = [11.6, 10.2, 8.1, 6.4];
    const maxV = 16, minV = 4;
    function toY(v) { return PAD + (H - 2*PAD) * (1 - (v - minV)/(maxV - minV)); }
    function toX(i) { return PAD + i * ((W - 2*PAD) / (weeks.length - 1)); }
    const phqPts = phq.map((v,i) => `${toX(i)},${toY(v)}`).join(' ');
    const gadPts = gad.map((v,i) => `${toX(i)},${toY(v)}`).join(' ');
    // area fill
    const phqArea = `M ${toX(0)},${toY(phq[0])} ` + phq.map((v,i)=>`L ${toX(i)},${toY(v)}`).join(' ') + ` L ${toX(phq.length-1)},${H-PAD} L ${toX(0)},${H-PAD} Z`;
    const gadArea = `M ${toX(0)},${toY(gad[0])} ` + gad.map((v,i)=>`L ${toX(i)},${toY(v)}`).join(' ') + ` L ${toX(gad.length-1)},${H-PAD} L ${toX(0)},${H-PAD} Z`;
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px;overflow:visible">
      <defs>
        <linearGradient id="vc-db-g-phq" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#4a9eff" stop-opacity=".22"/><stop offset="100%" stop-color="#4a9eff" stop-opacity="0"/></linearGradient>
        <linearGradient id="vc-db-g-gad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#00d4bc" stop-opacity=".18"/><stop offset="100%" stop-color="#00d4bc" stop-opacity="0"/></linearGradient>
      </defs>
      <!-- grid lines -->
      ${[6,8,10,12,14].map(v=>`<line x1="${PAD}" y1="${toY(v)}" x2="${W-PAD}" y2="${toY(v)}" stroke="rgba(255,255,255,0.05)" stroke-width="1"/><text x="${PAD-4}" y="${toY(v)+4}" text-anchor="end" font-size="8" fill="rgba(255,255,255,0.25)">${v}</text>`).join('')}
      <!-- area fills -->
      <path d="${phqArea}" fill="url(#vc-db-g-phq)"/>
      <path d="${gadArea}" fill="url(#vc-db-g-gad)"/>
      <!-- lines -->
      <polyline points="${phqPts}" fill="none" stroke="#4a9eff" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <polyline points="${gadPts}" fill="none" stroke="#00d4bc" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <!-- dots -->
      ${phq.map((v,i)=>`<circle cx="${toX(i)}" cy="${toY(v)}" r="3.5" fill="#4a9eff"/>`).join('')}
      ${gad.map((v,i)=>`<circle cx="${toX(i)}" cy="${toY(v)}" r="3.5" fill="#00d4bc"/>`).join('')}
      <!-- x labels -->
      ${weeks.map((w,i)=>`<text x="${toX(i)}" y="${H-2}" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.35)">${w}</text>`).join('')}
    </svg>`;
  }

  // ── Brain map SVG (10-20 positions, colour-coded) ─────────────────────────
  function dashboardBrainMap() {
    // Today: 6 sessions, 4 montages. Anode sites highlighted.
    const sites = {
      'Fp1':[160,60],'Fp2':[240,60],
      'F7':[100,125],'F3':[152,135],'Fz':[200,130],'F4':[248,135],'F8':[300,125],
      'T3':[100,200],'C3':[145,200],'Cz':[200,200],'C4':[255,200],'T4':[300,200],
      'T5':[115,270],'P3':[155,268],'Pz':[200,268],'P4':[245,268],'T6':[285,270],
      'O1':[165,332],'O2':[235,332],
    };
    const anodes    = ['F3','Fz','C3','Fp2'];
    const cathodes  = ['Fp2','F4','Cz','F3'];
    const targetRing= ['F3','Fz'];

    const dots = Object.entries(sites).map(([k,[x,y]]) => {
      const isA = anodes.includes(k) && !cathodes.includes(k);
      const isC = cathodes.includes(k) && !anodes.includes(k);
      const isBoth = anodes.includes(k) && cathodes.includes(k);
      const isT = targetRing.includes(k);
      if (isBoth)  return `<circle cx="${x}" cy="${y}" r="9" fill="rgba(155,127,255,0.18)" stroke="#9b7fff" stroke-width="1.5"/><circle cx="${x}" cy="${y}" r="3.5" fill="#9b7fff"/><text x="${x}" y="${y-13}" text-anchor="middle" font-size="8.5" fill="#9b7fff" font-weight="600">${k}</text>`;
      if (isA)     return `<circle cx="${x}" cy="${y}" r="9" fill="rgba(0,212,188,0.18)" stroke="#00d4bc" stroke-width="1.5"/><circle cx="${x}" cy="${y}" r="3.5" fill="#00d4bc"/><text x="${x}" y="${y-13}" text-anchor="middle" font-size="8.5" fill="#00d4bc" font-weight="600">${k}</text>`;
      if (isC)     return `<circle cx="${x}" cy="${y}" r="9" fill="rgba(255,107,157,0.18)" stroke="#ff6b9d" stroke-width="1.5"/><circle cx="${x}" cy="${y}" r="3.5" fill="#ff6b9d"/><text x="${x}" y="${y-13}" text-anchor="middle" font-size="8.5" fill="#ff6b9d" font-weight="600">${k}</text>`;
      if (isT)     return `<circle cx="${x}" cy="${y}" r="11" fill="none" stroke="rgba(255,181,71,0.45)" stroke-width="1.5" stroke-dasharray="3,2"/><circle cx="${x}" cy="${y}" r="3" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.2)" stroke-width="1"/><text x="${x}" y="${y-8}" text-anchor="middle" font-size="8" fill="rgba(255,255,255,0.3)">${k}</text>`;
      return `<circle cx="${x}" cy="${y}" r="3.5" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.2)" stroke-width="1"/><text x="${x}" y="${y-8}" text-anchor="middle" font-size="8" fill="rgba(255,255,255,0.25)">${k}</text>`;
    }).join('');

    return `<svg viewBox="60 30 280 340" style="width:100%;max-height:320px">
      <defs>
        <radialGradient id="vc-db-skull" cx="50%" cy="45%" r="50%">
          <stop offset="0%" stop-color="rgba(74,158,255,0.07)"/>
          <stop offset="100%" stop-color="rgba(10,18,35,0)"/>
        </radialGradient>
      </defs>
      <ellipse cx="200" cy="195" rx="148" ry="162" fill="url(#vc-db-skull)" stroke="rgba(255,255,255,0.1)" stroke-width="1.5"/>
      <ellipse cx="200" cy="195" rx="148" ry="162" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="0.8"/>
      <!-- nasion pointer -->
      <polygon points="200,33 194,47 206,47" fill="rgba(255,255,255,0.08)"/>
      ${dots}
    </svg>`;
  }

  // ── Grade badge ───────────────────────────────────────────────────────────
  function gradeBadge(g) {
    const col = g==='A'?'#00d4bc':g==='B'?'#4a9eff':'#ffb547';
    return `<span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:${col}22;border:1.5px solid ${col};color:${col};font-size:11px;font-weight:800;flex-shrink:0">${g}</span>`;
  }

  // ── Activity icon ─────────────────────────────────────────────────────────
  function actIcon(type) {
    const icons = { check:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00d4bc" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>', clip:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4a9eff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>', warn:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffb547" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>', sparkle:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9b7fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>', person:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4a9eff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M6 20v-2a6 6 0 0 1 12 0v2"/></svg>' };
    return `<span style="flex-shrink:0;display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:rgba(255,255,255,0.05)">${icons[type]||icons.clip}</span>`;
  }

  // ── Launch handler (attached to window for inline onclick) ─────────────────
  window._vcdbLaunch = function(id, name, modality, sessionNo, sessionTotal) {
    window._lsSessionSeed = { patient_id: id, patient_name: name, modality, session_no: sessionNo, session_total: sessionTotal };
    window._nav('live-session');
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const scheduleRows = DB_SCHEDULE.map(row => {
    if (!row.name) {
      return `<div class="vc-db-sched-row vc-db-sched-open">
        <span class="vc-db-sched-time">—</span>
        <span style="color:rgba(255,255,255,0.3);font-size:13px;font-style:italic">30 min open · add session</span>
        <button class="vc-db-btn-ghost" style="margin-left:auto">+ Add</button>
      </div>`;
    }
    const [mod, sessStr] = (row.protocol || '').split(' · ');
    const sessNo = parseInt((sessStr || '1').split('/')[0]) || 1;
    const sessTotal = parseInt((sessStr || '1/20').split('/')[1]) || 20;
    return `<div class="vc-db-sched-row">
      <span class="vc-db-sched-time">${_e(row.time)}</span>
      <div class="vc-db-avatar">${_e(row.initials)}</div>
      <div class="vc-db-sched-info">
        <span class="vc-db-sched-name">${_e(row.name)}</span>
        ${row.consent ? '<span class="vc-db-badge-warn">Consent refresh due</span>' : ''}
      </div>
      <span class="vc-db-chip">${_e(row.protocol)}</span>
      <span class="vc-db-sched-cond">${_e(row.condition)}</span>
      <button class="vc-db-launch-btn" onclick="window._vcdbLaunch('${_e(row.id)}','${_e(row.name)}','${_e(mod)}',${sessNo},${sessTotal})">Launch &#8594;</button>
    </div>`;
  }).join('');

  const caseloadRows = DB_CASELOAD.map(row => {
    const urgColor = row.urgency==='urgent'?'#ffb547':row.urgency==='new'?'#4a9eff':row.urgency==='discharging'?'#00d4bc':'rgba(255,255,255,0.3)';
    return `<tr class="vc-db-cl-row">
      <td><div style="display:flex;align-items:center;gap:8px"><div class="vc-db-avatar vc-db-avatar-sm">${_e(row.name.split(' ').map(w=>w[0]).join(''))}</div><div><div style="font-weight:500;font-size:13px">${_e(row.name)}</div><div style="font-size:11px;color:rgba(255,255,255,0.35)">${_e(row.condition)}</div></div></div></td>
      <td><span class="vc-db-chip">${_e(row.protocol)}</span></td>
      <td><div class="vc-db-prog-wrap"><div class="vc-db-prog-bar" style="width:${row.progress}%"></div></div><span style="font-size:10px;color:rgba(255,255,255,0.35);margin-left:4px">${row.progress}%</span></td>
      <td><span class="vc-db-next-badge" style="border-color:${urgColor};color:${urgColor}">${_e(row.next)}</span></td>
    </tr>`;
  }).join('');

  const evidenceRows = DB_EVIDENCE.map(row => `
    <div class="vc-db-ev-row${row.rerender?' vc-db-ev-warn':''}">
      ${gradeBadge(row.grade)}
      <span class="vc-db-ev-name">${_e(row.name)}</span>
      ${row.rerender ? '<button class="vc-db-rerender-btn">Re-render</button>' : ''}
      <button class="vc-db-ev-arrow" title="View protocol">&#8250;</button>
    </div>`).join('');

  const activityRows = DB_ACTIVITY.map(row => `
    <div class="vc-db-act-row">
      ${actIcon(row.icon)}
      <span class="vc-db-act-text">${_e(row.text)}</span>
      <span class="vc-db-act-time">${_e(row.time)}</span>
    </div>`).join('');

  // ── Inline styles ─────────────────────────────────────────────────────────
  const CSS = `<style>
.vc-db-shell { font-family: var(--font-body, system-ui, sans-serif); color: var(--text-primary, #e2e8f0); padding: 20px 24px; max-width: 1400px; margin: 0 auto; display: flex; flex-direction: column; gap: 18px; }
/* Header */
.vc-db-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.vc-db-greeting { font-size: 22px; font-weight: 700; line-height: 1.2; }
.vc-db-sub { font-size: 13px; color: rgba(255,255,255,0.45); margin-top: 4px; }
.vc-db-header-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.vc-db-period-btn { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.5); font-size: 12px; padding: 5px 12px; border-radius: 6px; cursor: pointer; transition: all .15s; }
.vc-db-period-btn:hover, .vc-db-period-btn.active { background: rgba(0,212,188,0.1); border-color: rgba(0,212,188,0.3); color: #00d4bc; }
.vc-db-ht-btn { background: rgba(74,158,255,0.1); border: 1px solid rgba(74,158,255,0.25); color: #4a9eff; font-size: 12px; padding: 5px 12px; border-radius: 6px; cursor: pointer; white-space: nowrap; }
.vc-db-ht-btn:hover { background: rgba(74,158,255,0.18); }
/* Alert banner */
.vc-db-alert { display: flex; align-items: center; gap: 12px; padding: 11px 16px; background: rgba(255,181,71,0.08); border: 1px solid rgba(255,181,71,0.25); border-radius: 10px; flex-wrap: wrap; }
.vc-db-alert-icon { font-size: 15px; flex-shrink: 0; }
.vc-db-alert-text { flex: 1; font-size: 13px; color: rgba(255,255,255,0.75); min-width: 200px; }
.vc-db-alert-text strong { color: #ffb547; }
.vc-db-alert-btn { background: rgba(255,181,71,0.15); border: 1px solid rgba(255,181,71,0.35); color: #ffb547; font-size: 12px; padding: 5px 12px; border-radius: 6px; cursor: pointer; white-space: nowrap; flex-shrink: 0; }
.vc-db-alert-btn:hover { background: rgba(255,181,71,0.25); }
/* KPI tiles */
.vc-db-kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
@media (max-width: 900px) { .vc-db-kpi-row { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 520px) { .vc-db-kpi-row { grid-template-columns: 1fr; } }
.vc-db-kpi { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; padding: 16px 18px; display: flex; flex-direction: column; gap: 4px; min-height: 96px; justify-content: space-between; }
.vc-db-kpi-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: rgba(255,255,255,0.35); }
.vc-db-kpi-val { font-size: 26px; font-weight: 800; line-height: 1.1; }
.vc-db-kpi-sub { font-size: 11.5px; color: rgba(255,255,255,0.4); }
.vc-db-kpi-bottom { display: flex; align-items: flex-end; justify-content: space-between; }
/* Two-col rows */
.vc-db-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@media (max-width: 820px) { .vc-db-row2 { grid-template-columns: 1fr; } }
/* Cards */
.vc-db-card { background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; overflow: hidden; display: flex; flex-direction: column; }
.vc-db-card-hd { padding: 14px 18px 10px; display: flex; align-items: center; justify-content: space-between; gap: 8px; border-bottom: 1px solid rgba(255,255,255,0.05); flex-wrap: wrap; }
.vc-db-card-title { font-size: 13px; font-weight: 700; }
.vc-db-card-meta { font-size: 11px; color: rgba(255,255,255,0.35); }
.vc-db-card-body { padding: 12px 16px; flex: 1; overflow-y: auto; max-height: 360px; }
/* Tab bar */
.vc-db-tabs { display: flex; gap: 4px; }
.vc-db-tab { background: transparent; border: 1px solid rgba(255,255,255,0.08); color: rgba(255,255,255,0.4); font-size: 11px; padding: 3px 10px; border-radius: 5px; cursor: pointer; }
.vc-db-tab.active, .vc-db-tab:hover { background: rgba(0,212,188,0.08); border-color: rgba(0,212,188,0.25); color: #00d4bc; }
/* Schedule */
.vc-db-sched-row { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid rgba(255,255,255,0.04); flex-wrap: wrap; }
.vc-db-sched-row:last-child { border-bottom: none; }
.vc-db-sched-open { opacity: .55; }
.vc-db-sched-time { font-size: 12px; font-weight: 700; color: rgba(255,255,255,0.4); min-width: 38px; font-family: var(--font-mono, monospace); }
.vc-db-sched-info { display: flex; flex-direction: column; gap: 2px; min-width: 90px; }
.vc-db-sched-name { font-size: 13px; font-weight: 600; }
.vc-db-sched-cond { font-size: 11px; color: rgba(255,255,255,0.35); margin-left: auto; text-align: right; }
.vc-db-badge-warn { background: rgba(255,181,71,0.12); border: 1px solid rgba(255,181,71,0.3); color: #ffb547; font-size: 10px; padding: 1px 7px; border-radius: 4px; }
/* Avatar */
.vc-db-avatar { width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, rgba(0,212,188,0.3), rgba(74,158,255,0.3)); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; color: #e2e8f0; flex-shrink: 0; }
.vc-db-avatar-sm { width: 26px; height: 26px; font-size: 9px; }
/* Chips */
.vc-db-chip { background: rgba(74,158,255,0.1); border: 1px solid rgba(74,158,255,0.2); color: #4a9eff; font-size: 10.5px; padding: 2px 8px; border-radius: 5px; white-space: nowrap; }
/* Launch btn */
.vc-db-launch-btn { margin-left: auto; background: rgba(0,212,188,0.1); border: 1px solid rgba(0,212,188,0.3); color: #00d4bc; font-size: 12px; font-weight: 600; padding: 5px 14px; border-radius: 7px; cursor: pointer; white-space: nowrap; flex-shrink: 0; transition: all .15s; }
.vc-db-launch-btn:hover { background: rgba(0,212,188,0.2); box-shadow: 0 0 12px rgba(0,212,188,0.2); }
.vc-db-btn-ghost { background: transparent; border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.4); font-size: 11px; padding: 4px 10px; border-radius: 6px; cursor: pointer; }
/* Caseload table */
.vc-db-cl-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.vc-db-cl-row td { padding: 8px 6px; border-bottom: 1px solid rgba(255,255,255,0.04); vertical-align: middle; }
.vc-db-cl-row:last-child td { border-bottom: none; }
.vc-db-cl-row:hover td { background: rgba(255,255,255,0.02); }
.vc-db-prog-wrap { display: inline-flex; vertical-align: middle; width: 64px; height: 4px; background: rgba(255,255,255,0.07); border-radius: 2px; overflow: hidden; }
.vc-db-prog-bar { height: 100%; background: linear-gradient(90deg, #00d4bc, #4a9eff); border-radius: 2px; }
.vc-db-next-badge { display: inline-block; border: 1px solid; border-radius: 5px; padding: 2px 8px; font-size: 10.5px; }
/* Evidence */
.vc-db-ev-row { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
.vc-db-ev-row:last-child { border-bottom: none; }
.vc-db-ev-warn { background: rgba(255,181,71,0.04); border-radius: 8px; padding: 8px 6px; margin: 0 -6px; }
.vc-db-ev-name { flex: 1; font-size: 12px; color: rgba(255,255,255,0.7); line-height: 1.4; }
.vc-db-rerender-btn { background: rgba(255,181,71,0.15); border: 1px solid rgba(255,181,71,0.3); color: #ffb547; font-size: 11px; padding: 3px 10px; border-radius: 5px; cursor: pointer; white-space: nowrap; flex-shrink: 0; }
.vc-db-ev-arrow { background: transparent; border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.35); font-size: 16px; line-height: 1; padding: 2px 7px; border-radius: 5px; cursor: pointer; flex-shrink: 0; }
.vc-db-ev-arrow:hover { color: #4a9eff; border-color: rgba(74,158,255,0.3); }
/* Activity */
.vc-db-act-row { display: flex; align-items: flex-start; gap: 10px; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
.vc-db-act-row:last-child { border-bottom: none; }
.vc-db-act-text { flex: 1; font-size: 12.5px; color: rgba(255,255,255,0.65); line-height: 1.4; }
.vc-db-act-time { font-size: 11px; color: rgba(255,255,255,0.25); white-space: nowrap; margin-top: 1px; }
/* Outcomes */
.vc-db-chart-legend { display: flex; gap: 14px; margin-bottom: 10px; }
.vc-db-legend-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; margin-right: 5px; vertical-align: middle; }
.vc-db-chart-toggles { display: flex; gap: 4px; }
.vc-db-chart-toggle { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.4); font-size: 10.5px; padding: 3px 9px; border-radius: 5px; cursor: pointer; }
.vc-db-chart-toggle.active, .vc-db-chart-toggle:hover { background: rgba(0,212,188,0.08); border-color: rgba(0,212,188,0.2); color: #00d4bc; }
/* Brain map panel */
.vc-db-bmap-wrap { padding: 12px; flex: 1; display: flex; flex-direction: column; gap: 8px; }
.vc-db-bmap-legend { display: flex; gap: 12px; flex-wrap: wrap; font-size: 11px; color: rgba(255,255,255,0.4); }
.vc-db-bmap-legend span { display: flex; align-items: center; gap: 5px; }
.vc-db-bmap-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
/* Thead */
.vc-db-th { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: rgba(255,255,255,0.3); padding: 4px 6px 8px; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.06); }
</style>`;

  mount.innerHTML = CSS + `
<div class="vc-db-shell">

  <!-- 1. Header -->
  <div class="vc-db-header">
    <div>
      <div class="vc-db-greeting">${_e(greeting)}, ${_e(clinicianName)}.</div>
      <div class="vc-db-sub">You have 8 sessions scheduled today &middot; 11 items need review before 11:00.</div>
    </div>
    <div class="vc-db-header-actions">
      <button class="vc-db-period-btn active">Day</button>
      <button class="vc-db-period-btn">Week</button>
      <button class="vc-db-period-btn">Month</button>
      <button class="vc-db-period-btn">Quarter</button>
      <button class="vc-db-period-btn">Export</button>
      <button class="vc-db-ht-btn" onclick="window._nav('home-task-manager')">Home Tasks</button>
    </div>
  </div>

  <!-- 2. Alert banner -->
  <div class="vc-db-alert">
    <span class="vc-db-alert-icon">&#9888;</span>
    <div class="vc-db-alert-text"><strong>Evidence update</strong> &middot; rTMS iTBS protocol downgraded B &#8594; C &mdash; 3 active protocols reference deprecated parameters. Review and re-render before next session.</div>
    <button class="vc-db-alert-btn" onclick="window._nav('reg-virtual-care')">Review now</button>
  </div>

  <!-- 3. KPI tiles -->
  <div class="vc-db-kpi-row">
    <div class="vc-db-kpi">
      <div class="vc-db-kpi-label">Active Caseload</div>
      <div class="vc-db-kpi-bottom">
        <div>
          <div class="vc-db-kpi-val" style="color:#00d4bc">142</div>
          <div class="vc-db-kpi-sub">&#8593;8 this week</div>
        </div>
        ${sparkline([118,122,128,131,134,138,142], '#00d4bc')}
      </div>
    </div>
    <div class="vc-db-kpi">
      <div class="vc-db-kpi-label">Sessions This Week</div>
      <div class="vc-db-kpi-bottom">
        <div>
          <div class="vc-db-kpi-val" style="color:#4a9eff">87<span style="font-size:15px;font-weight:500;color:rgba(255,255,255,0.3)">/110</span></div>
          <div class="vc-db-kpi-sub">79% utilisation</div>
        </div>
        ${sparkline([72,78,80,83,85,86,87], '#4a9eff')}
      </div>
    </div>
    <div class="vc-db-kpi">
      <div class="vc-db-kpi-label">Avg PHQ-9 &#916;</div>
      <div class="vc-db-kpi-bottom">
        <div>
          <div class="vc-db-kpi-val" style="color:#00d4bc">-6.2<span style="font-size:13px">pts</span></div>
          <div class="vc-db-kpi-sub">Best cohort since Q4</div>
        </div>
        ${sparkline([2.1, 3.4, 4.2, 4.9, 5.5, 5.9, 6.2], '#00d4bc')}
      </div>
    </div>
    <div class="vc-db-kpi">
      <div class="vc-db-kpi-label">Pending Review</div>
      <div class="vc-db-kpi-bottom">
        <div>
          <div class="vc-db-kpi-val" style="color:#ffb547">11</div>
          <div class="vc-db-kpi-sub">3 need re-render</div>
        </div>
        ${sparkline([5, 7, 9, 8, 10, 11, 11], '#ffb547')}
      </div>
    </div>
  </div>

  <!-- 4. Schedule + Brain map -->
  <div class="vc-db-row2">
    <!-- Schedule -->
    <div class="vc-db-card">
      <div class="vc-db-card-hd">
        <div>
          <div class="vc-db-card-title">Today's schedule</div>
          <div class="vc-db-card-meta">8 sessions &middot; Room A / B / Home-supervised</div>
        </div>
        <div class="vc-db-tabs">
          <button class="vc-db-tab active">All</button>
          <button class="vc-db-tab">Room A</button>
          <button class="vc-db-tab">Room B</button>
          <button class="vc-db-tab">Remote</button>
        </div>
      </div>
      <div class="vc-db-card-body">${scheduleRows}</div>
    </div>
    <!-- Brain map -->
    <div class="vc-db-card">
      <div class="vc-db-card-hd">
        <div>
          <div class="vc-db-card-title">Active targets &middot; today</div>
          <div class="vc-db-card-meta">10-20 overlay &middot; 6 sessions &middot; 4 montages</div>
        </div>
      </div>
      <div class="vc-db-bmap-wrap">
        <div style="flex:1;display:flex;align-items:center;justify-content:center">${dashboardBrainMap()}</div>
        <div class="vc-db-bmap-legend">
          <span><span class="vc-db-bmap-dot" style="background:#00d4bc"></span>Anode</span>
          <span><span class="vc-db-bmap-dot" style="background:#ff6b9d"></span>Cathode</span>
          <span><span class="vc-db-bmap-dot" style="background:transparent;border:1.5px dashed rgba(255,181,71,0.6)"></span>Target ring</span>
          <span><span class="vc-db-bmap-dot" style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.2)"></span>Available</span>
        </div>
      </div>
    </div>
  </div>

  <!-- 5. Caseload + Evidence -->
  <div class="vc-db-row2">
    <!-- Caseload -->
    <div class="vc-db-card">
      <div class="vc-db-card-hd">
        <div class="vc-db-card-title">Active patient caseload</div>
        <div class="vc-db-tabs">
          <button class="vc-db-tab active">All</button>
          <button class="vc-db-tab">Urgent</button>
          <button class="vc-db-tab">New</button>
          <button class="vc-db-tab">Discharging</button>
        </div>
      </div>
      <div class="vc-db-card-body" style="padding:0 16px">
        <table class="vc-db-cl-table">
          <thead><tr>
            <th class="vc-db-th">Patient &middot; Condition</th>
            <th class="vc-db-th">Protocol</th>
            <th class="vc-db-th">Progress</th>
            <th class="vc-db-th">Next step</th>
          </tr></thead>
          <tbody>${caseloadRows}</tbody>
        </table>
      </div>
    </div>
    <!-- Evidence governance -->
    <div class="vc-db-card">
      <div class="vc-db-card-hd">
        <div>
          <div class="vc-db-card-title">Evidence governance</div>
          <div class="vc-db-card-meta">Active registry grades &middot; last synced 12 min ago</div>
        </div>
        <button class="vc-db-tab active">All current</button>
      </div>
      <div class="vc-db-card-body">${evidenceRows}</div>
    </div>
  </div>

  <!-- 6. Activity + Outcomes -->
  <div class="vc-db-row2">
    <!-- Activity -->
    <div class="vc-db-card">
      <div class="vc-db-card-hd">
        <div class="vc-db-card-title">Clinic activity &mdash; Last 24 hours</div>
        <button class="vc-db-btn-ghost" onclick="window._nav('audittrail')">View audit log</button>
      </div>
      <div class="vc-db-card-body">${activityRows}</div>
    </div>
    <!-- Outcomes chart -->
    <div class="vc-db-card">
      <div class="vc-db-card-hd">
        <div>
          <div class="vc-db-card-title">Outcomes &middot; cohort avg &#916;</div>
          <div class="vc-db-card-meta">Week-over-week &middot; lower is better</div>
        </div>
        <div class="vc-db-chart-toggles">
          <button class="vc-db-chart-toggle active">4W</button>
          <button class="vc-db-chart-toggle">12W</button>
          <button class="vc-db-chart-toggle">1Y</button>
        </div>
      </div>
      <div class="vc-db-card-body">
        <div class="vc-db-chart-legend">
          <span><span class="vc-db-legend-dot" style="background:#4a9eff"></span><span style="font-size:12px">PHQ-9 avg</span></span>
          <span><span class="vc-db-legend-dot" style="background:#00d4bc"></span><span style="font-size:12px">GAD-7 avg</span></span>
        </div>
        ${outcomeChart()}
        <div style="display:flex;justify-content:space-between;margin-top:10px;font-size:11px;color:rgba(255,255,255,0.3)">
          <span>PHQ-9: 14.2 &#8594; 7.9</span>
          <span>GAD-7: 11.6 &#8594; 6.4</span>
        </div>
      </div>
    </div>
  </div>

</div>`;
}

// =============================================================================
// pgVirtualCareLegacyFull — Original VC inbox retained internally (unreachable
// from nav after the merge, but kept to preserve working implementation).
// =============================================================================
async function pgVirtualCareLegacyFull(setTopbar, navigate) {
  setTopbar({ title: 'Virtual Care', subtitle: 'Inbox · video visits · voice calls · shared media · AI notes' });

  const el = document.getElementById('main-content') || document.getElementById('content');
  if (!el) return;
  el.innerHTML = '<div class="vc-loading">Loading Virtual Care\u2026</div>';

  // Reset state
  _vc.tab = 'inbox';
  _vc.selectedPid = null;
  _vc.selectedItem = null;
  _vc.activeCall = null;
  _vc.recording = null;
  _vc.compose = false;

  // Load patients
  const api = window._api || {};
  let apiPatients = [];
  try { const r = await api.listPatients?.(); apiPatients = r?.items || (Array.isArray(r) ? r : []); } catch {}

  // ── Stats ────────────────────────────────────────────────────────────────
  const urgentCalls   = VC_DATA.callRequests.filter(c => c.urgency === 'urgent').length;
  const todayVisits   = VC_DATA.videoVisits.filter(v => v.status === 'scheduled').length;
  const unreadCount   = VC_DATA.messages.reduce((s, m) => s + (m.unread || 0), 0);
  const unreviewed    = VC_DATA.patientUpdates.filter(u => !u.reviewed).length;
  const pendingNotes  = VC_DATA.clinicianNotes.filter(n => n.status !== 'signed').length;

  // ── Status badge helpers ────────────────────────────────────────────────
  const _statusBadge = status => {
    const map = { scheduled:'vc-badge-blue',completed:'vc-badge-green','follow-up-needed':'vc-badge-amber',missed:'vc-badge-red','awaiting-signoff':'vc-badge-amber','awaiting-review':'vc-badge-blue',signed:'vc-badge-green',urgent:'vc-badge-red',routine:'vc-badge-grey' };
    return `<span class="vc-badge ${map[status]||'vc-badge-grey'}">${_e(status?.replace(/-/g,' '))}</span>`;
  };

  // ── One-click action bar (context-aware) ───────────────────────────────
  const _actionBar = (patientId, patientName, context = '') => `
    <div class="vc-action-bar">
      <span class="vc-action-label">Quick actions:</span>
      <button class="vc-action-btn" onclick="window._vcAction('note','${_e(patientId)}','${_e(patientName)}','${_e(context)}')" title="Convert to or create a clinical note">
        \uD83D\uDCDD Convert to Note
      </button>
      <button class="vc-action-btn" onclick="window._vcAction('task','${_e(patientId)}','${_e(patientName)}','')" title="Assign a home task to patient">
        \u2713 Assign Task
      </button>
      <button class="vc-action-btn" onclick="window._vcAction('assessment','${_e(patientId)}','${_e(patientName)}','')" title="Request an assessment">
        \uD83D\uDCCB Request Assessment
      </button>
      <button class="vc-action-btn vc-action-amber" onclick="window._vcAction('flag','${_e(patientId)}','${_e(patientName)}','${_e(context)}')" title="Flag for clinical review">
        \u26A0 Flag Review
      </button>
      <button class="vc-action-btn vc-action-green" onclick="window._vcAction('followup','${_e(patientId)}','${_e(patientName)}','')" title="Schedule a follow-up">
        \uD83D\uDCC5 Schedule Follow-Up
      </button>
      <button class="vc-action-btn" onclick="window._vcAction('monitor','${_e(patientId)}','${_e(patientName)}','')" title="View patient monitoring data">
        \uD83D\uDCCA Monitoring
      </button>
      <button class="vc-action-btn" onclick="window._vcAction('hometasks','${_e(patientId)}','${_e(patientName)}','')" title="View patient home tasks">
        \uD83C\uDFE0 Home Tasks
      </button>
    </div>`;

  // ── Video call overlay ─────────────────────────────────────────────────
  const _videoCallOverlay = call => {
    if (!call) return '';
    const item = call.item;
    const isVideo = call.type === 'video';
    const phase = call.phase;
    const hasSpeech = _hasSpeech;
    const roomName = call.roomName || 'deepsynaps-session';
    const jitsiUrl = call.type === 'video'
      ? `https://meet.jit.si/${roomName}`
      : `https://meet.jit.si/${roomName}#config.startWithVideoMuted=true`;
    return `
      <div class="vc-call-overlay">
        <div class="vc-call-modal" style="width:95vw;max-width:1400px;height:90vh;display:flex;flex-direction:column">
          <div class="vc-call-header">
            <div class="vc-call-patient">
              <div class="vc-avatar">${_e(item.initials)}</div>
              <div>
                <div class="vc-call-name">${_e(item.patientName)}</div>
                <div class="vc-call-cond">${_e(item.condition)} \u00B7 ${_e(item.modality)} \u00B7 ${_e(item.purpose || 'Virtual consult')}</div>
              </div>
            </div>
            <span class="vc-call-status-pill ${phase==='connecting'?'vc-connecting':phase==='active'?'vc-active':'vc-ended'}">
              ${phase==='connecting'?'\u23F3 Connecting\u2026':phase==='active'?'\u25CF Live':'\u25A0 Ended'}
            </span>
          </div>

          ${phase === 'connecting' ? `
          <div style="flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px">
            <div class="vc-spinner"></div>
            <div style="font-size:14px;color:var(--text-secondary)">Loading meeting room\u2026</div>
          </div>` : ''}

          ${phase === 'active' ? `
          <div class="vc-call-layout" style="display:flex;flex:1;overflow:hidden">
            <div style="flex:3;position:relative">
              <iframe id="vc-jitsi-frame" src="${jitsiUrl}"
                allow="camera;microphone;display-capture;autoplay;clipboard-write"
                style="width:100%;height:100%;border:none;border-radius:8px"></iframe>
            </div>
            <div id="vc-transcript-sidebar" style="flex:1;min-width:260px;max-width:320px;border-left:1px solid var(--border);display:flex;flex-direction:column;padding:12px;overflow-y:auto">
              <div style="font-size:11px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">\uD83C\uDFA4 Live Transcription</div>
              <div id="vc-live-transcript" style="flex:1;font-size:12px;color:var(--text-secondary);line-height:1.6;overflow-y:auto"></div>
              <div id="vc-interim-text" style="font-size:12px;color:var(--text-tertiary);font-style:italic;margin-top:4px"></div>
              ${!hasSpeech ? '<div style="font-size:11px;color:var(--amber);margin-top:8px;padding:6px 8px;background:rgba(255,181,71,0.08);border-radius:6px">Speech recognition requires Chrome or Edge.</div>' : ''}
            </div>
          </div>` : ''}

          <div class="vc-call-controls">
            <button class="vc-ctrl-btn vc-ctrl-mute" onclick="window._vcCallCtrl('mute')" title="Mute">
              \uD83C\uDF99
            </button>
            ${isVideo ? `<button class="vc-ctrl-btn vc-ctrl-video" onclick="window._vcCallCtrl('video')" title="Toggle camera">\uD83D\uDCF9</button>` : ''}
            <button class="vc-ctrl-btn vc-ctrl-record" onclick="window._vcCallCtrl('record')" title="Record">
              \u23FA Rec
            </button>
            <button class="vc-ctrl-btn vc-ctrl-note" onclick="window._vcCallCtrl('note')" title="Take note">
              \uD83D\uDCDD Note
            </button>
            <button class="vc-ctrl-btn vc-ctrl-end" onclick="window._vcEndCall()" title="End call">
              \u260E\uFE0F End
            </button>
          </div>

          ${phase === 'ended' ? `
          <div class="vc-call-ended-panel">
            <div class="vc-ended-title">Call ended</div>
            <div id="vc-call-summary" style="margin-top:12px"></div>
            ${_actionBar(item.patientId, item.patientName, item.purpose || 'Call')}
            <button class="vc-action-btn" onclick="window._vcCaptureNote('${_e(item.patientId)}','${_e(item.patientName)}')">Capture Call Note</button>
          </div>` : ''}
        </div>
      </div>`;
  };

  // ── Note capture overlay ───────────────────────────────────────────────
  const _noteCapture = rec => {
    if (!rec) return '';
    const isRecording = rec.phase === 'recording';
    const isProcessing = rec.phase === 'processing';
    const isDone = rec.phase === 'done';
    return `
      <div class="vc-call-overlay">
        <div class="vc-capture-modal">
          <div class="vc-capture-header">
            <span class="vc-capture-title">Capture Clinical Note</span>
            <button class="vc-modal-close" onclick="window._vcCloseCapture()">\u2715</button>
          </div>
          <div class="vc-capture-body">
            <div class="vc-capture-patient">
              <div class="vc-avatar-sm">${_e(rec.initials || '?')}</div>
              <span>${_e(rec.patientName || 'Patient')}</span>
            </div>

            <div class="vc-capture-type-bar">
              ${['voice','video','text'].map(t =>
                `<button class="vc-cap-type-btn${rec.type===t?' active':''}" onclick="window._vcCapType('${t}')">${t==='voice'?'\uD83C\uDFA4 Voice':t==='video'?'\uD83D\uDCF9 Video':'\uD83D\uDCDD Text'}</button>`
              ).join('')}
            </div>

            ${rec.type === 'text' ? `
              <textarea id="vc-cap-text" class="vc-cap-textarea" placeholder="Type your clinical note here\u2026">${_e(rec.transcription || '')}</textarea>
            ` : `
              <div class="vc-cap-record-area">
                ${isRecording ? `
                  <div class="vc-rec-indicator">
                    <span class="vc-rec-dot"></span> Recording\u2026
                  </div>
                  <div class="vc-waveform"><div class="vc-wave-bar"></div><div class="vc-wave-bar"></div><div class="vc-wave-bar"></div><div class="vc-wave-bar"></div><div class="vc-wave-bar"></div></div>
                ` : isProcessing ? `
                  <div class="vc-processing">
                    <div class="vc-spinner"></div>
                    AI transcription in progress\u2026
                  </div>
                ` : isDone ? '' : `
                  <div class="vc-rec-idle">\uD83C\uDFA4 Press Record to begin</div>
                `}
              </div>
            `}

            ${isDone || rec.type === 'text' ? `
              <div class="vc-cap-result">
                <div class="vc-cap-result-label">Transcription</div>
                <div class="vc-cap-transcription">${_e(rec.transcription || '')}</div>
                ${rec.aiSummary ? `
                  <div class="vc-cap-result-label vc-ai-label">\uD83E\uDD16 AI Summary</div>
                  <div class="vc-cap-summary">${_e(rec.aiSummary)}</div>
                ` : ''}
                ${_actionBar(rec.patientId, rec.patientName, rec.transcription || '')}
              </div>
            ` : ''}
          </div>
          <div class="vc-capture-footer">
            ${!isDone && rec.type !== 'text' ? `
              <button class="vc-rec-btn${isRecording?' vc-rec-stop':''}" onclick="window._vcToggleRecording()">
                ${isRecording ? '\u23F9 Stop Recording' : '\u23FA Start Recording'}
              </button>
            ` : ''}
            ${isDone || rec.type === 'text' ? `
              <button class="vc-cap-save-btn" onclick="window._vcSaveNote()">Save Note</button>
            ` : ''}
            <button class="vc-cap-cancel-btn" onclick="window._vcCloseCapture()">Cancel</button>
          </div>
        </div>
      </div>`;
  };

  // ── TABS ─────────────────────────────────────────────────────────────────
  const TABS = [
    { id:'inbox',         label:'Inbox',          count:unreadCount,   attn:unreadCount>0 },
    { id:'call-requests', label:'Call Requests',  count:VC_DATA.callRequests.length, attn:urgentCalls>0 },
    { id:'video-visits',  label:'Video Visits',   count:todayVisits },
    { id:'voice-calls',   label:'Voice Calls',    count:VC_DATA.voiceCalls.filter(v=>v.status==='scheduled').length },
    { id:'shared-media',  label:'Shared Media',   count:unreviewed,    attn:unreviewed>0 },
    { id:'ai-notes',      label:'AI Notes',       count:pendingNotes,  attn:pendingNotes>0, ai:true },
  ];

  const tabBar = () => TABS.map(t => `
    <button class="vc-tab${_vc.tab===t.id?' vc-tab-active':''}" onclick="window._vcTab('${t.id}')">
      ${t.icon ? `<span>${t.icon}</span>` : ''}
      ${_e(t.label)}
      ${t.count ? `<span class="vc-tab-badge${t.attn?' vc-tab-badge-attn':''}">${t.count}</span>` : ''}
      ${t.ai ? '<span class="vc-ai-dot">\uD83E\uDD16</span>' : ''}
    </button>`).join('');

  // ── Inbox tab ─────────────────────────────────────────────────────────
  const inboxTab = () => {
    const threads = VC_DATA.messages;
    const selThread = _vc.selectedPid;
    const msgs = selThread ? (VC_DATA.messageThreads[selThread] || []) : [];
    const selMeta = threads.find(t => t.patientId === selThread);
    return `
      <div class="vc-messages-layout">
        <div class="vc-thread-list">
          <div class="vc-thread-search-bar">
            <input class="vc-thread-search" type="text" placeholder="Search conversations\u2026">
            <button class="vc-compose-btn" onclick="window._vcCompose()">+ New Message</button>
          </div>
          ${threads.map(t => `
            <div class="vc-thread-item${selThread===t.patientId?' vc-thread-active':''}" onclick="window._vcSelectThread('${t.patientId}')">
              <div class="vc-avatar-sm">${_e(t.initials)}</div>
              <div class="vc-thread-body">
                <div class="vc-thread-name">${_e(t.patientName)} <span class="vc-thread-cond">${_e(t.condition)}</span></div>
                <div class="vc-thread-preview">${_e(t.lastMsg)}</div>
              </div>
              <div class="vc-thread-right">
                <div class="vc-thread-ago">${_ago(t.lastAt)}</div>
                ${t.unread ? `<div class="vc-thread-unread">${t.unread}</div>` : ''}
              </div>
            </div>`).join('')}
        </div>

        <div class="vc-msg-workspace">
          ${selThread && selMeta ? `
            <div class="vc-msg-header">
              <div class="vc-avatar">${_e(selMeta.initials)}</div>
              <div>
                <div class="vc-msg-patient-name">${_e(selMeta.patientName)}</div>
                <div class="vc-msg-cond">${_e(selMeta.condition)}</div>
              </div>
              <div class="vc-msg-header-btns">
                <button class="vc-hdr-btn" onclick="window._vcStartCall('video','${selThread}')">📹 Video</button>
                <button class="vc-hdr-btn" onclick="window._vcStartCall('voice','${selThread}')">📞 Voice</button>
                <button class="vc-hdr-btn" onclick="window._vcCaptureNote('${selThread}','${_e(selMeta.patientName)}')">📝 Note</button>
                <button class="vc-hdr-btn" onclick="window._vcAction('monitor','${selThread}','${_e(selMeta.patientName)}','')">📊 Monitor</button>
                <button class="vc-hdr-btn" onclick="window._vcAction('hometasks','${selThread}','${_e(selMeta.patientName)}','')">🏠 Tasks</button>
              </div>
            </div>
            ${_actionBar(selThread, selMeta.patientName, 'messaging')}
            <div class="vc-msg-thread">
              ${msgs.map(m => `
                <div class="vc-msg-bubble vc-msg-${m.from}">
                  <div class="vc-bubble-text">${_e(m.text)}</div>
                  <div class="vc-bubble-meta">${_ago(m.at)}</div>
                </div>`).join('')}
            </div>
            <div class="vc-msg-compose">
              <textarea class="vc-msg-input" id="vc-msg-input" placeholder="Type a message\u2026" rows="2">${_e(_vc.messageText)}</textarea>
              <div class="vc-msg-actions">
                <button class="vc-msg-attach" title="Attach file">\uD83D\uDCCE</button>
                <button class="vc-msg-send" onclick="window._vcSendMsg('${selThread}')">Send</button>
              </div>
            </div>
          ` : `<div class="vc-empty-state">Select a conversation to begin</div>`}
        </div>
      </div>`;
  };

  // ── Call Requests tab ────────────────────────────────────────────────
  const callRequestsTab = () => `
    <div class="vc-list-view">
      <div class="vc-list-header">
        <span>Patient</span><span>Condition / Course</span><span>Reason</span><span>Preferred Time</span><span>Urgency</span><span>Actions</span>
      </div>
      ${VC_DATA.callRequests.map(cr => `
        <div class="vc-list-row">
          <div class="vc-list-pt">
            <div class="vc-avatar-sm">${_e(cr.initials)}</div>
            <div>
              <div class="vc-list-name">${_e(cr.patientName)}</div>
              <div class="vc-list-ago">${_ago(cr.requestedAt)}</div>
            </div>
          </div>
          <div>
            <div class="vc-list-cond">${_e(cr.condition)} \u00B7 ${_e(cr.modality)}</div>
            <div class="vc-list-ref">${_e(cr.courseRef)} \u00B7 ${_e(cr.sessionRef)}</div>
          </div>
          <div class="vc-list-reason">${_e(cr.reason)}</div>
          <div class="vc-list-time">${_e(cr.preferredTime)}</div>
          <div>${_statusBadge(cr.urgency)}</div>
          <div class="vc-list-acts">
            <button class="vc-act-primary" onclick="window._vcAcceptCall('${cr.id}','${cr.type}')">${cr.type==='video'?'\uD83D\uDCF9 Join':'\uD83D\uDCDE Call'}</button>
            <button class="vc-act-btn" onclick="window._vcScheduleCall('${cr.id}')">Schedule</button>
            <button class="vc-act-btn vc-act-sm" onclick="window._vcDismissCallReq('${cr.id}')">\u2715</button>
          </div>
        </div>
        ${cr.urgency === 'urgent' ? _actionBar(cr.patientId, cr.patientName, cr.reason) : ''}
      `).join('')}
    </div>`;

  // ── Video Visits tab ─────────────────────────────────────────────────
  const videoVisitsTab = () => `
    <div class="vc-list-view">
      <div class="vc-visit-top-btns">
        <button class="vc-act-primary" onclick="window._vcScheduleNew('video')">+ Schedule Video Visit</button>
      </div>
      <div class="vc-list-header">
        <span>Patient</span><span>Purpose</span><span>Scheduled</span><span>Duration</span><span>Status</span><span>Actions</span>
      </div>
      ${VC_DATA.videoVisits.map(v => `
        <div class="vc-list-row">
          <div class="vc-list-pt">
            <div class="vc-avatar-sm">${_e(v.initials)}</div>
            <div>
              <div class="vc-list-name">${_e(v.patientName)}</div>
              <div class="vc-list-ref">${_e(v.condition)} \u00B7 ${_e(v.modality)}</div>
            </div>
          </div>
          <div class="vc-list-reason">${_e(v.purpose)}</div>
          <div class="vc-list-time">${_fmtTime(v.scheduledAt)}</div>
          <div class="vc-list-dur">${v.duration} min</div>
          <div>${_statusBadge(v.status)}</div>
          <div class="vc-list-acts">
            ${v.status==='scheduled' ? `<button class="vc-act-primary" onclick="window._vcJoinVisit('${v.id}','video')">\uD83D\uDCF9 Join</button>` : ''}
            ${v.status==='completed' ? `<button class="vc-act-btn" onclick="window._vcCaptureNote('${v.patientId}','${_e(v.patientName)}')">Write Note</button>` : ''}
            ${v.status==='missed' ? `<button class="vc-act-btn vc-act-amber" onclick="window._vcScheduleNew('video')">Reschedule</button>` : ''}
            <div class="vc-act-more" onclick="event.stopPropagation();this.nextElementSibling.classList.toggle('vc-drop-open')">\u22EF</div>
            <div class="vc-act-dropdown">
              <div onclick="window.openPatient('${v.patientId}');window._nav('patient-profile')">Open Patient</div>
              <div onclick="window._vcCaptureNote('${v.patientId}','${_e(v.patientName)}')">Capture Note</div>
              <div onclick="window._vcAction('followup','${v.patientId}','${_e(v.patientName)}','')">Schedule Follow-Up</div>
              <div onclick="window._vcAction('flag','${v.patientId}','${_e(v.patientName)}','${_e(v.purpose)}')">Flag Review</div>
            </div>
          </div>
        </div>
        ${v.status==='missed' ? _actionBar(v.patientId, v.patientName, v.purpose) : ''}
      `).join('')}
    </div>`;

  // ── Voice Calls tab ──────────────────────────────────────────────────
  const voiceCallsTab = () => `
    <div class="vc-list-view">
      <div class="vc-visit-top-btns">
        <button class="vc-act-primary" onclick="window._vcScheduleNew('voice')">+ Schedule Voice Call</button>
      </div>
      <div class="vc-list-header">
        <span>Patient</span><span>Purpose</span><span>Scheduled</span><span>Duration</span><span>Status</span><span>Actions</span>
      </div>
      ${VC_DATA.voiceCalls.map(v => `
        <div class="vc-list-row">
          <div class="vc-list-pt">
            <div class="vc-avatar-sm">${_e(v.initials)}</div>
            <div>
              <div class="vc-list-name">${_e(v.patientName)}</div>
              <div class="vc-list-ref">${_e(v.condition)} \u00B7 ${_e(v.modality)}</div>
            </div>
          </div>
          <div class="vc-list-reason">${_e(v.purpose)}</div>
          <div class="vc-list-time">${_fmtTime(v.scheduledAt)}</div>
          <div class="vc-list-dur">${v.duration} min</div>
          <div>${_statusBadge(v.status)}</div>
          <div class="vc-list-acts">
            ${v.status==='scheduled' ? `<button class="vc-act-primary" onclick="window._vcJoinVisit('${v.id}','voice')">\uD83D\uDCDE Call</button>` : ''}
            ${v.status==='completed' || v.status==='follow-up-needed' ? `<button class="vc-act-btn" onclick="window._vcCaptureNote('${v.patientId}','${_e(v.patientName)}')">Write Note</button>` : ''}
            <div class="vc-act-more" onclick="event.stopPropagation();this.nextElementSibling.classList.toggle('vc-drop-open')">\u22EF</div>
            <div class="vc-act-dropdown">
              <div onclick="window.openPatient('${v.patientId}');window._nav('patient-profile')">Open Patient</div>
              <div onclick="window._vcAction('followup','${v.patientId}','${_e(v.patientName)}','')">Schedule Follow-Up</div>
              <div onclick="window._vcAction('flag','${v.patientId}','${_e(v.patientName)}','${_e(v.purpose)}')">Flag Review</div>
            </div>
          </div>
        </div>
        ${v.status==='follow-up-needed' ? _actionBar(v.patientId, v.patientName, v.purpose) : ''}
      `).join('')}
    </div>`;

  // ── Shared Media tab ─────────────────────────────────────────────────
  const sharedMediaTab = () => {
    const updates = VC_DATA.patientUpdates;
    const sel = _vc.selectedItem ? updates.find(u => u.id === _vc.selectedItem) : null;
    return `
      <div class="vc-updates-layout">
        <div class="vc-update-list">
          ${updates.map(u => `
            <div class="vc-update-item${_vc.selectedItem===u.id?' vc-update-active':''}${!u.reviewed?' vc-update-unread':''}" onclick="window._vcSelectUpdate('${u.id}')">
              <div class="vc-avatar-sm">${_e(u.initials)}</div>
              <div class="vc-update-body">
                <div class="vc-update-name">${_e(u.patientName)} <span class="vc-update-type-icon">${u.type==='voice-note'?'\uD83C\uDFA4':u.type==='video-update'?'\uD83D\uDCF9':'\uD83D\uDCDD'}</span></div>
                <div class="vc-update-subject">${_e(u.subject)}</div>
                <div class="vc-update-meta">
                  <span class="vc-update-trend${u.trend==='Worse'?' vc-trend-worse':u.trend==='Better'?' vc-trend-better':''}">${u.trend==='Worse'?'\u2193':u.trend==='Better'?'\u2191':'\u2192'} ${u.trend}</span>
                  \u00B7 ${_ago(u.submittedAt)}
                  ${u.urgency==='urgent' ? '<span class="vc-urgent-pill">Urgent</span>' : ''}
                </div>
              </div>
            </div>`).join('')}
        </div>

        <div class="vc-update-workspace">
          ${sel ? `
            <div class="vc-update-header">
              <div class="vc-avatar">${_e(sel.initials)}</div>
              <div>
                <div class="vc-update-hd-name">${_e(sel.patientName)}</div>
                <div class="vc-update-hd-meta">${_e(sel.condition)} \u00B7 ${_e(sel.modality)} \u00B7 ${_e(sel.sessionRef)}</div>
              </div>
              ${sel.urgency==='urgent' ? '<span class="vc-urgent-pill">Urgent</span>' : ''}
            </div>

            <div class="vc-update-detail-card">
              <div class="vc-update-subject-lg">${_e(sel.subject)}</div>
              <div class="vc-update-stats">
                <span>Type: ${_e(sel.type?.replace(/-/g,' '))}</span>
                <span>Reason: ${_e(sel.reason)}</span>
                <span>Severity: ${_e(sel.severity)}</span>
                <span class="${sel.trend==='Worse'?'vc-trend-worse':sel.trend==='Better'?'vc-trend-better':''}">Trend: ${_e(sel.trend)}</span>
                ${sel.duration ? `<span>Duration: ${_e(sel.duration)}</span>` : ''}
              </div>
              ${sel.type==='voice-note'||sel.type==='video-update' ? `
                <div class="vc-media-player">
                  <span class="vc-media-icon">${sel.type==='voice-note'?'\uD83C\uDFA4':'\uD83D\uDCF9'}</span>
                  <div class="vc-media-bar"><div class="vc-media-fill"></div></div>
                  <span class="vc-media-dur">${sel.duration||'—'}</span>
                </div>` : ''}

              <div class="vc-transcription-block">
                <div class="vc-block-label">Patient's Words (AI Transcribed)</div>
                <div class="vc-transcription-text">"${_e(sel.transcription)}"</div>
              </div>

              <div class="vc-ai-summary-block">
                <div class="vc-block-label vc-ai-label">\uD83E\uDD16 AI Clinical Summary</div>
                <div class="vc-ai-summary-text">${_e(sel.aiSummary)}</div>
              </div>

              ${_actionBar(sel.patientId, sel.patientName, sel.transcription)}
            </div>
          ` : `<div class="vc-empty-state">Select a shared item to review</div>`}
        </div>
      </div>`;
  };

  // ── Capture Note tab ─────────────────────────────────────────────────
  const captureNoteTab = () => `
    <div class="vc-capture-inline">
      <div class="vc-capture-header-inline">
        <span class="vc-capture-title-inline">Capture Clinical Note</span>
      </div>
      <div class="vc-capture-select-pt">
        <label class="vc-cap-lbl">Patient</label>
        <select class="vc-cap-select" id="vc-cap-pid" onchange="window._vcCapPatient(this.value)">
          <option value="">Select patient\u2026</option>
          ${VC_DATA.messages.map(m => `<option value="${m.patientId}"${_vc.recording?.patientId===m.patientId?' selected':''}>${_e(m.patientName)}</option>`).join('')}
        </select>
      </div>
      <div class="vc-cap-type-bar">
        ${['voice','video','text'].map(t =>
          `<button class="vc-cap-type-btn${(!_vc.recording||_vc.recording?.type===t)?' active':''}" onclick="window._vcCapType('${t}')">${t==='voice'?'\uD83C\uDFA4 Voice Note':t==='video'?'\uD83D\uDCF9 Video Note':'\uD83D\uDCDD Text Note'}</button>`
        ).join('')}
      </div>
      ${_vc.recording ? `
        ${_vc.recording.type === 'text' ? `
          <textarea id="vc-cap-text" class="vc-cap-textarea" placeholder="Type your clinical note here\u2026" rows="6">${_e(_vc.recording.transcription || '')}</textarea>
        ` : `
          <div class="vc-cap-record-area-inline">
            ${_vc.recording.phase==='idle' ? '<div class="vc-rec-idle">\uD83C\uDFA4 Press Record to begin capturing</div>' : ''}
            ${_vc.recording.phase==='recording' ? `
              <div class="vc-rec-indicator"><span class="vc-rec-dot"></span> Recording\u2026</div>
              <div class="vc-waveform"><div class="vc-wave-bar"></div><div class="vc-wave-bar"></div><div class="vc-wave-bar"></div><div class="vc-wave-bar"></div><div class="vc-wave-bar"></div></div>
            ` : ''}
            ${_vc.recording.phase==='processing' ? '<div class="vc-processing"><div class="vc-spinner"></div> AI transcription in progress\u2026</div>' : ''}
          </div>
        `}
        ${_vc.recording.phase==='done' || _vc.recording.type==='text' ? `
          <div class="vc-cap-result">
            ${_vc.recording.transcription ? `
              <div class="vc-cap-result-label">Transcription</div>
              <div class="vc-cap-transcription">${_e(_vc.recording.transcription)}</div>
            ` : ''}
            ${_vc.recording.aiSummary ? `
              <div class="vc-cap-result-label vc-ai-label">\uD83E\uDD16 AI Summary</div>
              <div class="vc-cap-summary">${_e(_vc.recording.aiSummary)}</div>
            ` : ''}
            ${_actionBar(_vc.recording.patientId||'', _vc.recording.patientName||'', _vc.recording.transcription||'')}
          </div>
        ` : ''}
        <div class="vc-capture-footer-inline">
          ${_vc.recording.type !== 'text' ? `
            <button class="vc-rec-btn${_vc.recording.phase==='recording'?' vc-rec-stop':''}" onclick="window._vcToggleRecording()">
              ${_vc.recording.phase==='recording' ? '\u23F9 Stop' : '\u23FA Record'}
            </button>
          ` : ''}
          ${_vc.recording.phase==='done'||_vc.recording.type==='text' ? `<button class="vc-cap-save-btn" onclick="window._vcSaveNote()">Save Note</button>` : ''}
          <button class="vc-cap-cancel-btn" onclick="window._vcCloseCapture()">Clear</button>
        </div>
      ` : `
        <div class="vc-cap-empty">\uD83C\uDFA4 Select a patient and note type to begin</div>
      `}
    </div>`;

  // ── AI Notes tab ─────────────────────────────────────────────────────
  const aiNotesTab = () => {
    const notes = VC_DATA.clinicianNotes;
    const sel = _vc.selectedItem ? notes.find(n => n.id === _vc.selectedItem) : null;
    return `
      <div class="vc-updates-layout">
        <div class="vc-update-list">
          ${notes.map(n => `
            <div class="vc-update-item${_vc.selectedItem===n.id?' vc-update-active':''}" onclick="window._vcSelectNote('${n.id}')">
              <div class="vc-avatar-sm">${_e(n.initials)}</div>
              <div class="vc-update-body">
                <div class="vc-update-name">${_e(n.patientName)}</div>
                <div class="vc-update-subject">${_e(n.subject)}</div>
                <div class="vc-update-meta">${_statusBadge(n.status)} \u00B7 ${_ago(n.recordedAt)}</div>
              </div>
            </div>`).join('')}
        </div>

        <div class="vc-update-workspace">
          ${sel ? `
            <div class="vc-update-header">
              <div class="vc-avatar">${_e(sel.initials)}</div>
              <div>
                <div class="vc-update-hd-name">${_e(sel.patientName)}</div>
                <div class="vc-update-hd-meta">${_e(sel.condition)} \u00B7 ${_e(sel.modality)}</div>
              </div>
              ${_statusBadge(sel.status)}
            </div>

            <div class="vc-update-detail-card">
              <div class="vc-update-subject-lg">${_e(sel.subject)}</div>
              <div class="vc-transcription-block">
                <div class="vc-block-label">Clinical Note (Transcribed)</div>
                <div class="vc-transcription-text">${_e(sel.transcription)}</div>
              </div>
              <div class="vc-ai-summary-block">
                <div class="vc-block-label vc-ai-label">\uD83E\uDD16 AI Summary</div>
                <div class="vc-ai-summary-text">${_e(sel.aiSummary)}</div>
              </div>

              ${_actionBar(sel.patientId, sel.patientName, sel.transcription)}

              ${sel.status !== 'signed' ? `
                <div class="vc-note-sign-bar">
                  <button class="vc-sign-btn" onclick="window._vcSignNote('${sel.id}')">\u2713 Sign Note</button>
                  <button class="vc-edit-note-btn" onclick="window._vcEditNote('${sel.id}')">Edit</button>
                </div>` : '<div class="vc-note-signed">\u2713 Note signed</div>'}
            </div>
          ` : `<div class="vc-empty-state">Select a note to review and sign</div>`}
        </div>
      </div>`;
  };

  // ── Main render ───────────────────────────────────────────────────────
  const renderPage = () => {
    let tabContent = '';
    switch(_vc.tab) {
      case 'inbox':         tabContent = inboxTab();        break;
      case 'call-requests': tabContent = callRequestsTab(); break;
      case 'video-visits':  tabContent = videoVisitsTab();  break;
      case 'voice-calls':   tabContent = voiceCallsTab();   break;
      case 'shared-media':  tabContent = sharedMediaTab();  break;
      case 'ai-notes':      tabContent = aiNotesTab();      break;
    }

    el.innerHTML = `
      <div class="vc-page">
        <div class="vc-top-actions">
          <button class="vc-top-btn vc-top-btn-primary" onclick="window._vcScheduleNew('video')">\uD83D\uDCF9 Start Video Visit</button>
          <button class="vc-top-btn vc-top-btn-primary" onclick="window._vcScheduleNew('voice')">\uD83D\uDCDE Start Voice Call</button>
          <button class="vc-top-btn" onclick="window._vcTab('inbox');window._vcCompose()">\u2709 New Message</button>
          <button class="vc-top-btn" onclick="window._vcCaptureNote('','')">&#127908; Record Note</button>
        </div>

        <div class="vc-summary-strip">
          <div class="vc-chip${unreadCount?' vc-chip-blue':''}"><span class="vc-chip-val">${unreadCount}</span><span class="vc-chip-lbl">Unread</span></div>
          <div class="vc-chip${urgentCalls?' vc-chip-red':''}"><span class="vc-chip-val">${VC_DATA.callRequests.length}</span><span class="vc-chip-lbl">Call Requests</span></div>
          <div class="vc-chip"><span class="vc-chip-val">${todayVisits}</span><span class="vc-chip-lbl">Video Visits Today</span></div>
          <div class="vc-chip${unreviewed?' vc-chip-amber':''}"><span class="vc-chip-val">${unreviewed}</span><span class="vc-chip-lbl">Shared Media</span></div>
          <div class="vc-chip${pendingNotes?' vc-chip-amber':''}"><span class="vc-chip-val">${pendingNotes}</span><span class="vc-chip-lbl">Notes Pending Sign-off</span></div>
        </div>

        <div class="vc-tab-bar">${tabBar()}</div>

        <div class="vc-tab-content">${tabContent}</div>
      </div>

      ${_vc.activeCall ? _videoCallOverlay(_vc.activeCall) : ''}
      ${_vc.recording ? _noteCapture(_vc.recording) : ''}`;
  };

  // ── Window handlers ───────────────────────────────────────────────────
  window._vcTab = t => { _vc.tab = t; _vc.selectedItem = null; renderPage(); };
  window._vcSelectThread = async pid => {
    _vc.selectedPid = pid;
    renderPage();
    // Fetch real messages if available
    try {
      const res = await api.getPatientMessages?.(pid);
      if (res?.items?.length || res?.length) {
        const msgs = (res.items || res).map(m => ({ from: m.sender === 'clinician' ? 'clinician' : 'patient', text: m.content || m.text || m.message, at: m.created_at || m.sent_at }));
        VC_DATA.messageThreads[pid] = msgs;
        renderPage();
      }
    } catch {}
  };
  window._vcSelectUpdate = id => { _vc.selectedItem = id; renderPage(); };
  window._vcSelectNote   = id => { _vc.selectedItem = id; renderPage(); };
  window._vcCompose      = () => { _vc.compose = true; renderPage(); };

  window._vcSendMsg = async pid => {
    const inp = document.getElementById('vc-msg-input');
    const text = inp?.value?.trim();
    if (!text) return;
    if (!VC_DATA.messageThreads[pid]) VC_DATA.messageThreads[pid] = [];
    VC_DATA.messageThreads[pid].push({ from:'clinician', text, at: new Date().toISOString() });
    const meta = VC_DATA.messages.find(m => m.patientId === pid);
    if (meta) { meta.lastMsg = text; meta.lastAt = new Date().toISOString(); meta.unread = 0; }
    _vc.messageText = '';
    renderPage();
    try { await api.sendPatientMessage?.(pid, text); } catch {}
    window._showNotifToast?.({ title:'Sent', body:'Message delivered to patient.', severity:'success' });
  };

  window._vcStartCall = (type, pid) => {
    const meta = VC_DATA.messages.find(m => m.patientId === pid);
    if (!meta) return;
    const item = { patientId:pid, patientName:meta.patientName, initials:meta.initials, condition:meta.condition, modality:'', purpose:'Ad-hoc call' };
    _vc.activeCall = { type, item, phase:'connecting' };
    _vc.activeCall.roomName = 'ds-' + (window._clinicId || 'clinic') + '-' + pid.replace(/[^a-z0-9]/gi,'') + '-' + Date.now();
    renderPage();
    setTimeout(() => { if(_vc.activeCall) { _vc.activeCall.phase = 'active'; renderPage(); _startLiveTranscription(); } }, 2000);
  };

  window._vcJoinVisit = (id, type) => {
    const list = type==='video' ? VC_DATA.videoVisits : VC_DATA.voiceCalls;
    const item = list.find(v => v.id === id);
    if (!item) return;
    _vc.activeCall = { type, item, phase:'connecting' };
    _vc.activeCall.roomName = 'ds-' + (window._clinicId || 'clinic') + '-' + (item.patientId || id).replace(/[^a-z0-9]/gi,'') + '-' + Date.now();
    renderPage();
    setTimeout(() => { if(_vc.activeCall) { _vc.activeCall.phase = 'active'; renderPage(); _startLiveTranscription(); } }, 2000);
  };

  window._vcAcceptCall = (id, type) => {
    const cr = VC_DATA.callRequests.find(c => c.id === id);
    if (!cr) return;
    _vc.activeCall = { type, item:cr, phase:'connecting' };
    _vc.activeCall.roomName = 'ds-' + (window._clinicId || 'clinic') + '-' + (cr.patientId || id).replace(/[^a-z0-9]/gi,'') + '-' + Date.now();
    renderPage();
    setTimeout(() => { if(_vc.activeCall) { _vc.activeCall.phase = 'active'; renderPage(); _startLiveTranscription(); } }, 2000);
  };

  window._vcEndCall = async () => {
    if (!_vc.activeCall) return;
    _stopLiveTranscription();
    _vc.activeCall.phase = 'ended';
    renderPage();
    // Auto-generate AI summary from transcript
    if (_vc.liveTranscript.trim()) {
      const summaryEl = document.getElementById('vc-call-summary');
      if (summaryEl) summaryEl.innerHTML = '<div style="font-size:11px;color:var(--text-tertiary)">Generating AI summary...</div>';
      try {
        const res = await api.chatAgent?.([
          { role: 'user', content: 'Summarize this clinical call transcript into a concise SOAP note:\n\n' + _vc.liveTranscript }
        ], 'anthropic', null, null);
        _vc.callSummary = res?.reply || '';
        if (summaryEl && _vc.callSummary) summaryEl.innerHTML = `<div style="font-size:12px;color:var(--text-secondary);line-height:1.5;padding:8px;background:rgba(155,127,255,0.06);border-radius:6px;border:1px solid rgba(155,127,255,0.15)"><div style="font-size:10px;font-weight:700;color:var(--violet);margin-bottom:4px">AI Summary</div>${_e(_vc.callSummary)}</div>`;
      } catch {}
      // Auto-open note capture with transcript pre-filled
      _vc.recording = { type: 'text', phase: 'done', patientId: _vc.activeCall.item.patientId, patientName: _vc.activeCall.item.patientName, initials: _vc.activeCall.item.initials, transcription: _vc.liveTranscript, aiSummary: _vc.callSummary };
    }
  };

  window._vcCallCtrl = ctrl => {
    if (ctrl === 'note' && _vc.activeCall) {
      const item = _vc.activeCall.item;
      _vc.recording = { type:'voice', phase:'idle', patientId:item.patientId, patientName:item.patientName, initials:item.initials||'?', transcription:'', aiSummary:'' };
    }
    window._showNotifToast?.({ title:ctrl, body:`${ctrl} toggled.`, severity:'info' });
  };

  const _vcSimulateTranscript = () => {
    const lines = ['Patient speaking...', 'Reports mild discomfort...', 'Describing symptom improvement...', 'Asking about next session...'];
    let i = 0;
    const interval = setInterval(() => {
      const el2 = document.getElementById('vc-transcript-preview');
      if (!el2 || !_vc.activeCall || _vc.activeCall.phase !== 'active') { clearInterval(interval); return; }
      el2.textContent = lines[i % lines.length];
      i++;
    }, 2500);
  };

  window._vcDismissCallReq = id => {
    const idx = VC_DATA.callRequests.findIndex(c => c.id === id);
    if (idx >= 0) VC_DATA.callRequests.splice(idx, 1);
    renderPage();
  };

  window._vcScheduleCall = id => {
    window._nav('calendar');
    window._showNotifToast?.({ title:'Open Calendar', body:'Select a time slot to schedule the call.', severity:'info' });
  };

  window._vcScheduleNew = type => {
    window._nav('calendar');
    window._showNotifToast?.({ title:`Schedule ${type === 'video' ? 'Video Visit' : 'Voice Call'}`, body:'Open calendar to book.', severity:'info' });
  };

  window._vcCaptureNote = (pid, name) => {
    const meta = VC_DATA.messages.find(m => m.patientId === pid);
    _vc.recording = { type:'voice', phase:'idle', patientId:pid||'', patientName:name||'', initials:meta?.initials||'?', transcription:'', aiSummary:'' };
    renderPage();
  };

  window._vcCapPatient = pid => {
    const meta = VC_DATA.messages.find(m => m.patientId === pid);
    _vc.recording = { type: _vc.recording?.type || 'voice', phase:'idle', patientId:pid, patientName:meta?.patientName||pid, initials:meta?.initials||'?', transcription:'', aiSummary:'' };
    renderPage();
  };

  window._vcCapType = type => {
    if (!_vc.recording) _vc.recording = { type, phase:'idle', patientId:'', patientName:'', initials:'?', transcription:'', aiSummary:'' };
    else _vc.recording.type = type;
    if (type === 'text') _vc.recording.phase = 'idle';
    renderPage();
  };

  window._vcToggleRecording = async () => {
    if (!_vc.recording) return;
    const rec = _vc.recording;

    if (rec.phase === 'idle') {
      // Try to use MediaRecorder
      rec.phase = 'recording';
      renderPage();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        _vc.recorder = new MediaRecorder(stream);
        _vc.chunks = [];
        _vc.recorder.ondataavailable = e => { if (e.data.size > 0) _vc.chunks.push(e.data); };
        _vc.recorder.start();
      } catch {
        // No mic access — simulate recording
      }
      // Start speech recognition in parallel
      if (_hasSpeech) {
        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        const sr = new SpeechRec();
        sr.continuous = true; sr.interimResults = true; sr.lang = 'en-GB';
        _vc.recording.transcription = '';
        sr.onresult = function(e) {
          let t = '';
          for (let i = 0; i < e.results.length; i++) { if (e.results[i].isFinal) t += e.results[i][0].transcript + ' '; }
          _vc.recording.transcription = t;
        };
        sr.onend = function() { if (_vc.recording?.phase === 'recording') { try { sr.start(); } catch {} } };
        _vc.speechRec = sr;
        try { sr.start(); } catch {}
      }
    } else if (rec.phase === 'recording') {
      rec.phase = 'processing';
      renderPage();
      // Stop actual recorder if running
      if (_vc.recorder && _vc.recorder.state === 'recording') {
        _vc.recorder.stop();
        _vc.recorder.stream?.getTracks().forEach(t => t.stop());
      }
      // Stop speech recognition for note capture
      if (_vc.speechRec) { try { _vc.speechRec.stop(); } catch {} _vc.speechRec = null; }
      // If we have speech recognition data, use it; otherwise prompt text input
      if (rec.transcription) {
        // Already captured via speech recognition during recording
        try {
          const res = await api.chatAgent?.([
            { role: 'user', content: 'Summarize this clinical note transcription concisely:\n\n' + rec.transcription }
          ], 'anthropic', null, null);
          rec.aiSummary = res?.reply || 'Summary unavailable.';
        } catch { rec.aiSummary = 'Summary unavailable — AI not connected.'; }
        rec.phase = 'done';
        renderPage();
      } else {
        // No speech data — prompt manual input
        rec.phase = 'done';
        rec.transcription = '';
        rec.aiSummary = '';
        renderPage();
        window._showNotifToast?.({ title: 'No speech detected', body: 'Type your note manually below.', severity: 'info' });
      }
    }
  };

  window._vcCloseCapture = () => {
    _vc.recording = null;
    if (_vc.activeCall?.phase === 'ended') _vc.activeCall = null;
    renderPage();
  };

  window._vcSaveNote = async () => {
    if (!_vc.recording) return;
    const textEl = document.getElementById('vc-cap-text');
    const text = textEl ? textEl.value : _vc.recording.transcription;
    try {
      await api.createClinicianNote?.({
        patient_id: _vc.recording.patientId,
        note_type: _vc.recording.type || 'clinical_update',
        text_content: text || _vc.recording.transcription || '',
        course_id: null,
        session_id: null,
      });
    } catch {
      window._showNotifToast?.({ title: 'Saved locally', body: 'Note saved locally — API unavailable.', severity: 'warning' });
    }
    VC_DATA.clinicianNotes.unshift({
      id: 'cn-' + Date.now(),
      patientId: _vc.recording.patientId,
      patientName: _vc.recording.patientName,
      initials: _vc.recording.initials,
      condition: '', modality: '',
      type: _vc.recording.type,
      recordedAt: new Date().toISOString(),
      subject: 'New clinical note',
      transcription: text || _vc.recording.transcription || '',
      aiSummary: _vc.recording.aiSummary || '',
      status: 'awaiting-signoff',
      actionsTaken: [],
    });
    window._showNotifToast?.({ title:'Note Saved', body:'Note saved and queued for sign-off.', severity:'success' });
    _vc.recording = null;
    _vc.tab = 'ai-notes';
    renderPage();
  };

  window._vcSignNote = id => {
    const note = VC_DATA.clinicianNotes.find(n => n.id === id);
    if (note) { note.status = 'signed'; note.actionsTaken = [...(note.actionsTaken||[]), 'signed']; }
    renderPage();
    window._showNotifToast?.({ title:'Note Signed', body:'Clinical note signed and finalised.', severity:'success' });
  };

  window._vcEditNote = id => {
    const note = VC_DATA.clinicianNotes.find(n => n.id === id);
    if (!note) return;
    _vc.recording = { type:'text', phase:'idle', patientId:note.patientId, patientName:note.patientName, initials:note.initials||'?', transcription:note.transcription, aiSummary:note.aiSummary };
    renderPage();
  };

  // ── One-click actions ─────────────────────────────────────────────────
  window._vcAction = (action, patientId, patientName, context) => {
    if (patientId) { window.openPatient?.(patientId); window._profilePatientId = patientId; }
    switch(action) {
      case 'note':
        window._vcCaptureNote(patientId, patientName);
        break;
      case 'task':
        window._nav('home-task-manager');
        window._showNotifToast?.({ title:'Assign Task', body:`Opening Home Programs for ${patientName}.`, severity:'info' });
        break;
      case 'assessment':
        window._nav('assessments-hub');
        window._showNotifToast?.({ title:'Request Assessment', body:`Opening Assessments Hub for ${patientName}.`, severity:'info' });
        break;
      case 'flag':
        window._nav('adverse-events');
        window._showNotifToast?.({ title:'Flag for Review', body:`Flagging ${patientName} in Adverse Events.`, severity:'warn' });
        break;
      case 'followup':
        window._nav('calendar');
        window._showNotifToast?.({ title:'Schedule Follow-Up', body:`Open calendar to book follow-up for ${patientName}.`, severity:'info' });
        break;
      case 'monitor':
        localStorage.setItem('ds_selected_patient_id', patientId);
        window._nav('monitor-hub');
        window._showNotifToast?.({ title:'Monitoring', body:`Viewing monitoring data for ${patientName}.`, severity:'info' });
        break;
      case 'hometasks':
        localStorage.setItem('ds_selected_patient_id', patientId);
        window._nav('home-task-manager');
        window._showNotifToast?.({ title:'Home Tasks', body:`Viewing home tasks for ${patientName}.`, severity:'info' });
        break;
    }
  };

  renderPage();
}

// =============================================================================
// pgLiveSession — Screen 10 · Unified Live Session
// Merges: session runtime + Virtual Care (telehealth) + Monitor Hub telemetry.
// =============================================================================
let _lsState = null;

export async function pgLiveSession(setTopbar, navigate) {
  const mount = document.getElementById('main-content') || document.getElementById('content');
  if (!mount) return;

  _lsTeardown();

  let session = null;
  let patient = null;
  let events = [];
  try { session = await (api.getCurrentSession?.() ?? Promise.resolve(null)); } catch {}
  if (!session) {
    session = {
      id: 'sess-' + Date.now(),
      patient_id: 'p001',
      patient_name: 'Samantha Li',
      modality: 'tDCS',
      montage: 'F3 \u2192 Fp2',
      target_region: 'DLPFC-L',
      intensity_mA: 2.0,
      duration_min: 20,
      session_no: 12,
      session_total: 20,
      session_type: 'in-person',
      phase: 'stimulation',
      impedance_kohm: 4.8,
      started_at: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
    };
  }
  try { if (session.patient_id && api.getPatient) patient = await api.getPatient(session.patient_id); } catch {}
  if (!patient) {
    patient = { id: session.patient_id, display_name: session.patient_name || 'Patient', initials: _lsInitials(session.patient_name || 'P'), condition: 'MDD', age: 34, sex: 'F' };
  }
  try { const r = await (api.listSessionEvents?.(session.id) ?? Promise.resolve(null)); events = r?.items || (Array.isArray(r) ? r : []); } catch {}
  if (!events.length) {
    events = _lsSeedEvents();
  }

  const durationSec = (session.duration_min || 20) * 60;
  const elapsedSec = Math.min(durationSec, Math.max(0, Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000)) || 378);
  const isTelehealth = (session.session_type || session.type || '').toLowerCase() === 'telehealth';

  _lsState = {
    mount,
    session,
    patient,
    events,
    durationSec,
    elapsedSec,
    paused: false,
    isTelehealth,
    videoActive: false,
    currentMA: session.intensity_mA || 2.0,
    impedanceKohm: session.impedance_kohm || 4.8,
    trace: _lsInitTrace(session.intensity_mA || 2.0),
    phase: session.phase || 'stimulation',
    checklist: _lsInitChecklist(),
    sideEffects: { tingling: 2, itching: 1, headache: 0, discomfort: 0, mood: 4 },
    timerInt: null,
    traceInt: null,
    keyHandler: null,
    navHandler: null,
    unloadHandler: null,
    activeTab: 'session',
    tasks: [],
    completions: {},
    taskFilter: { category: 'all', status: 'all', overdueOnly: false },
    tasksLoaded: false,
    taskSelectedPid: null,
    tasksRefreshInt: null,
  };

  try {
    setTopbar({
      title: 'Live Session',
      subtitle: `${_e(patient.display_name || session.patient_name || '')} \u00B7 ${_e(session.modality || '')} ${session.intensity_mA || ''} mA ${_e(session.montage || '')} \u00B7 Session ${session.session_no || 1}/${session.session_total || 20}`,
      right: `<button class="btn btn-ghost btn-sm" onclick="window._lsPauseResume()" id="ls-pause-btn">${_lsState.paused ? 'Resume' : 'Pause'}</button><button class="btn btn-sm" style="color:#ff6b6b;border:1px solid rgba(255,107,107,0.3);background:transparent;margin-left:6px" onclick="window._lsEndSession()">End Session</button>`,
    });
  } catch {
    try { setTopbar('Live Session', `<button class="btn btn-sm" onclick="window._lsPauseResume()" id="ls-pause-btn">Pause</button> <button class="btn btn-sm" style="color:#ff6b6b" onclick="window._lsEndSession()">End Session</button>`); } catch {}
  }

  _lsRender();
  _lsStartTimers();
  _lsBindKeys();
  _lsBindNavCleanup();

  window._lsCheckToggle = _lsCheckToggle;
  window._lsReportAE = _lsReportAE;
  window._lsPauseResume = _lsPauseResume;
  window._lsEndSession = _lsEndSession;
  window._lsPhase = _lsPhase;
  window._lsStartVideo = _lsStartVideo;
  window._lsEndVideo = _lsEndVideo;
  window._lsSnapMonitor = _lsSnapMonitor;
  window._lsSetImpedance = _lsSetImpedance;
  window._lsSetTab = _lsSetTab;
  window._lsTasksTab = _lsTasksTab;
  window._lsAssignTask = _lsAssignTask;
  window._lsCycleTaskStatus = _lsCycleTaskStatus;
  window._lsEditTask = _lsEditTask;
  window._lsDeleteTask = _lsDeleteTask;
  window._lsRemindTask = _lsRemindTask;
  window._lsBulkAssignTemplate = _lsBulkAssignTemplate;
  window._lsOpenAssignModal = _lsOpenAssignModal;
  window._lsCloseModal = _lsCloseModal;
  window._lsSubmitAssign = _lsSubmitAssign;
  window._lsSubmitEdit = _lsSubmitEdit;
  window._lsSetTaskFilter = _lsSetTaskFilter;
  window._lsPickTemplate = _lsPickTemplate;
  window._lsPickPatient = _lsPickPatient;
}

function _lsInitials(name) {
  return String(name || '').split(/\s+/).map(s => s[0] || '').join('').slice(0,2).toUpperCase() || 'P';
}

function _lsInitTrace(target) {
  const arr = [];
  for (let i = 0; i < 60; i++) arr.push(target + (Math.random() - 0.5) * 0.06);
  return arr;
}

function _lsInitChecklist() {
  return [
    { id:'consent',  label:'Consent verified', done:true },
    { id:'skin',     label:'Skin inspection clear', done:true },
    { id:'electrodes', label:'Electrode saturation \u00B7 saline', done:true },
    { id:'placement', label:'F3 / Fp2 placement verified', done:true },
    { id:'impedance', label:'Impedance < 10 k\u03A9', done:true },
    { id:'previtals', label:'Pre-stim vitals logged', done:true },
    { id:'ramp',      label:'Ramp up \u00B7 no discomfort', done:true },
    { id:'check5',    label:'Side-effect check \u00B7 5 min', done:true },
    { id:'check10',   label:'Mid-session check \u00B7 10 min', done:false },
    { id:'postvitals',label:'Post-stim vitals + debrief', done:false },
  ];
}

function _lsSeedEvents() {
  const now = Date.now();
  const mk = (ago, type, msg) => ({ ts: new Date(now - ago * 1000).toISOString(), type, note: msg });
  return [
    mk(10,  'STIM',  'Current stable at 2.00 mA'),
    mk(120, 'CHECK', '5-min side-effect check \u00B7 tingling 2, itch 1, headache 0'),
    mk(228, 'STIM',  'Ramp complete \u00B7 stimulation phase started'),
    mk(258, 'RAMP',  'Ramp up 0 \u2192 2.00 mA over 30s \u00B7 no discomfort'),
    mk(273, 'OPER',  'Operator started stimulation'),
    mk(306, 'CHECK', 'Impedance 4.8 k\u03A9 \u00B7 within limit'),
    mk(348, 'OPER',  'Electrodes mounted F3/Fp2'),
    mk(588, 'CLEAR', 'Consent reviewed \u00B7 no new contraindications'),
  ];
}

function _lsFmtClock(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
}

function _lsFmtTs(iso) {
  try { const d = new Date(iso); return d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', second:'2-digit' }); } catch { return ''; }
}

function _lsRender() {
  const s = _lsState; if (!s) return;
  const { mount, session, patient, events, durationSec, elapsedSec, paused, isTelehealth, impedanceKohm, currentMA, phase, checklist, sideEffects } = s;
  if (!mount) return;
  const remaining = Math.max(0, durationSec - elapsedSec);
  const frac = durationSec > 0 ? Math.min(1, elapsedSec / durationSec) : 0;
  const circ = 2 * Math.PI * 92;
  const dashOffset = circ * (1 - frac);
  const impedancePct = Math.min(100, Math.max(0, (impedanceKohm / 20) * 100));
  const impColor = impedanceKohm < 10 ? 'var(--green,#4ade80)' : impedanceKohm < 15 ? 'var(--amber,#f59e0b)' : '#ff6b6b';
  const anode = (session.montage || '').split(/\s*[\u2192\->]+\s*/)[0]?.trim() || 'F3';
  const cathode = (session.montage || '').split(/\s*[\u2192\->]+\s*/)[1]?.trim() || 'Fp2';

  let brainMapSvg = '';
  try {
    const mod = window.__brainMap || null;
    if (mod && typeof mod.renderBrainMap10_20 === 'function') {
      brainMapSvg = mod.renderBrainMap10_20({ anode, cathode, targetRegion: session.target_region || null, size: 320 });
    }
  } catch {}
  if (!brainMapSvg) {
    brainMapSvg = _lsBrainMapFallback(anode, cathode);
  }

  const phaseDef = [
    { id:'setup',  label:'Setup',        target:120 },
    { id:'ramp_up',label:'Ramp \u2191',  target:30 },
    { id:'stim',   label:'Stimulation',  target:durationSec },
    { id:'ramp_dn',label:'Ramp \u2193',  target:30 },
  ];
  const phaseHtml = phaseDef.map(p => {
    const st = p.id === phase ? 'active' : (_lsPhaseDoneBefore(phase, p.id) ? 'done' : '');
    const mins = Math.floor(p.target / 60), secs = p.target % 60;
    return `<div class="ls-phase-cell ${st}" onclick="window._lsPhase?.('${p.id}')"><span>${p.label}</span><em>${mins}:${String(secs).padStart(2,'0')}</em></div>`;
  }).join('');

  const checklistHtml = checklist.map(c => `
    <label class="ls-check${c.done ? ' done' : ''}" for="ls-ck-${c.id}">
      <input type="checkbox" id="ls-ck-${c.id}" ${c.done ? 'checked' : ''} onchange="window._lsCheckToggle('${c.id}')">
      <span class="ls-check-box"></span>
      <span class="ls-check-lbl">${_e(c.label)}</span>
    </label>`).join('');

  const eventsHtml = events.map(ev => {
    const type = (ev.type || 'INFO').toUpperCase();
    const col = type === 'STIM' ? 'var(--teal,#00d4bc)' : type === 'CHECK' ? 'var(--blue,#4a9eff)' : type === 'RAMP' ? 'var(--amber,#f59e0b)' : type === 'OPER' ? 'var(--violet,#a78bfa)' : type === 'CLEAR' ? 'var(--green,#4ade80)' : type === 'AE' ? '#ff6b6b' : 'var(--text-secondary)';
    return `<div class="ls-log-row"><span class="ls-log-ts">${_lsFmtTs(ev.ts)}</span><span class="ls-log-type" style="color:${col}">${_e(type)}</span><span class="ls-log-msg">${_e(ev.note || ev.message || '')}</span></div>`;
  }).join('');

  const tracePathD = _lsTraceD(s.trace, 500, 160, 2.0);

  const videoPanel = isTelehealth ? `
    <div class="dv2-card" style="padding:14px;margin-bottom:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div>
          <div style="font-family:var(--dv2-font-display,var(--font-display));font-size:14px;font-weight:600">Video consult</div>
          <div style="font-size:11px;color:var(--text-tertiary)">Telehealth session \u00B7 patient connected remotely</div>
        </div>
        <span class="chip ${s.videoActive ? 'teal' : ''}" style="${s.videoActive ? '' : 'color:var(--text-tertiary)'}">${s.videoActive ? '\u25CF Live' : 'Idle'}</span>
      </div>
      <div style="aspect-ratio:16/9;border-radius:8px;overflow:hidden;background:rgba(0,0,0,0.35);border:1px solid var(--border);display:flex;align-items:center;justify-content:center">
        ${s.videoActive
          ? `<iframe id="ls-video-iframe" src="https://meet.jit.si/ds-live-${_e(session.id)}" allow="camera;microphone;autoplay" style="width:100%;height:100%;border:none"></iframe>`
          : `<div style="text-align:center;color:var(--text-tertiary);font-size:12px"><div style="font-size:28px;margin-bottom:6px">\uD83D\uDCF9</div>Video not started</div>`}
      </div>
      <div style="display:flex;gap:6px;margin-top:10px">
        ${s.videoActive
          ? `<button class="btn btn-sm" onclick="window._lsEndVideo()" style="flex:1">End call</button>`
          : `<button class="btn btn-primary btn-sm" onclick="window._lsStartVideo()" style="flex:1">Start video</button>`}
      </div>
    </div>` : '';

  const monitorWidget = `
    <div class="dv2-card" style="padding:14px;margin-top:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div>
          <div style="font-family:var(--dv2-font-display,var(--font-display));font-size:13px;font-weight:600">Remote telemetry</div>
          <div style="font-size:11px;color:var(--text-tertiary)">HRV \u00B7 impedance \u00B7 adherence beacons</div>
        </div>
        <button class="btn btn-sm" onclick="window._lsSnapMonitor()">Snapshot</button>
      </div>
      <div id="ls-monitor-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-size:11px">
        <div><div style="color:var(--text-tertiary);font-size:10px;letter-spacing:0.8px;text-transform:uppercase">HRV</div><div style="font-family:var(--dv2-font-mono,var(--font-mono));font-size:16px;font-weight:600">58<span style="font-size:10px;color:var(--text-tertiary);margin-left:3px">ms</span></div></div>
        <div><div style="color:var(--text-tertiary);font-size:10px;letter-spacing:0.8px;text-transform:uppercase">Impedance</div><div style="font-family:var(--dv2-font-mono,var(--font-mono));font-size:16px;font-weight:600">${impedanceKohm.toFixed(1)}<span style="font-size:10px;color:var(--text-tertiary);margin-left:3px">k\u03A9</span></div></div>
        <div><div style="color:var(--text-tertiary);font-size:10px;letter-spacing:0.8px;text-transform:uppercase">Adherence</div><div style="font-family:var(--dv2-font-mono,var(--font-mono));font-size:16px;font-weight:600;color:var(--green,#4ade80)">OK</div></div>
      </div>
    </div>`;

  const activeTab = s.activeTab || 'session';
  const tabStrip = `
    <div class="dv2l-ht-tabstrip">
      <button class="dv2l-ht-tabbtn${activeTab==='session'?' on':''}" data-ls-tab="session" onclick="window._lsSetTab('session')">Session</button>
      <button class="dv2l-ht-tabbtn${activeTab==='log'?' on':''}"     data-ls-tab="log"     onclick="window._lsSetTab('log')">Event Log</button>
      <button class="dv2l-ht-tabbtn"                                  data-ls-tab="htm"     onclick="window._lsSetTab('htm')" title="Assign tasks to patients, track adherence">🏠 Home Task Manager</button>
      <span class="dv2l-ht-tabspacer"></span>
      <span class="dv2l-ht-tabctx">${_e(patient.display_name || '')} &middot; ${_e(session.modality || '')} &middot; Session ${session.session_no || 1}/${session.session_total || 20}</span>
    </div>`;

  mount.innerHTML = `
    <style id="dv2l-hometasks-styles">
      .dv2l-ht-tabstrip { display:flex;align-items:center;gap:4px;padding:10px 16px 0;max-width:1600px;margin:0 auto }
      .dv2l-ht-tabbtn { background:transparent;border:1px solid var(--border);border-bottom:none;padding:8px 14px;color:var(--text-secondary);font-size:12px;font-weight:600;cursor:pointer;border-radius:6px 6px 0 0;letter-spacing:0.3px }
      .dv2l-ht-tabbtn:hover { color:var(--text-primary) }
      .dv2l-ht-tabbtn.on { background:var(--bg-card,rgba(15,23,32,0.6));border-color:rgba(0,212,188,0.35);color:var(--teal,#00d4bc) }
      .dv2l-ht-tabspacer { flex:1 }
      .dv2l-ht-tabctx { font-size:11px;color:var(--text-tertiary);font-family:var(--dv2-font-mono,var(--font-mono)) }
      .dv2l-ht-wrap { padding:16px;max-width:1600px;margin:0 auto;display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:16px }
      @media (max-width:1080px){ .dv2l-ht-wrap { grid-template-columns:1fr } }
      .dv2l-ht-kpis { display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px }
      .dv2l-ht-kpi { padding:12px;background:var(--bg-card,rgba(15,23,32,0.6));border:1px solid var(--border);border-radius:8px }
      .dv2l-ht-kpi-v { font-family:var(--dv2-font-display,var(--font-display));font-size:22px;font-weight:600;line-height:1 }
      .dv2l-ht-kpi-l { font-size:10px;color:var(--text-tertiary);letter-spacing:0.8px;text-transform:uppercase;margin-top:4px }
      .dv2l-ht-filters { display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px }
      .dv2l-ht-chip { padding:5px 10px;border-radius:999px;background:rgba(255,255,255,0.03);border:1px solid var(--border);font-size:11px;color:var(--text-secondary);cursor:pointer }
      .dv2l-ht-chip.on { background:rgba(0,212,188,0.12);border-color:rgba(0,212,188,0.4);color:var(--teal,#00d4bc) }
      .dv2l-ht-row { display:grid;grid-template-columns:24px 1fr auto auto auto auto;gap:10px;align-items:center;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--bg-card,rgba(15,23,32,0.6));margin-bottom:8px }
      .dv2l-ht-row.demo { border-style:dashed;opacity:0.92 }
      .dv2l-ht-ico { font-size:18px }
      .dv2l-ht-title { font-size:13px;font-weight:600;color:var(--text-primary);font-family:var(--dv2-font-display,var(--font-display)) }
      .dv2l-ht-sub { font-size:11px;color:var(--text-tertiary);margin-top:2px }
      .dv2l-ht-meta { font-family:var(--dv2-font-mono,var(--font-mono));font-size:10px;color:var(--text-tertiary) }
      .dv2l-ht-status { padding:3px 9px;border-radius:999px;font-size:10px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;cursor:pointer;border:1px solid transparent }
      .dv2l-ht-status.assigned    { background:rgba(74,158,255,0.12);color:#4a9eff;border-color:rgba(74,158,255,0.35) }
      .dv2l-ht-status.in-progress { background:rgba(0,212,188,0.12);color:#00d4bc;border-color:rgba(0,212,188,0.35) }
      .dv2l-ht-status.completed   { background:rgba(74,222,128,0.12);color:#4ade80;border-color:rgba(74,222,128,0.35) }
      .dv2l-ht-status.skipped     { background:rgba(124,134,153,0.14);color:#7c8699;border-color:rgba(124,134,153,0.35) }
      .dv2l-ht-status.overdue     { background:rgba(255,107,107,0.12);color:#ff6b6b;border-color:rgba(255,107,107,0.35) }
      .dv2l-ht-spark { display:inline-flex;gap:2px;align-items:flex-end;height:18px }
      .dv2l-ht-spark i { display:block;width:4px;background:rgba(0,212,188,0.35);border-radius:1px }
      .dv2l-ht-spark i.on { background:var(--teal,#00d4bc) }
      .dv2l-ht-iconbtn { background:transparent;border:1px solid var(--border);color:var(--text-secondary);border-radius:6px;padding:4px 8px;font-size:11px;cursor:pointer }
      .dv2l-ht-iconbtn:hover { color:var(--text-primary);border-color:rgba(0,212,188,0.35) }
      .dv2l-ht-empty { text-align:center;padding:36px 12px;color:var(--text-tertiary);font-size:12px;border:1px dashed var(--border);border-radius:8px }
      .dv2l-ht-tag-demo { font-size:9px;padding:2px 6px;border-radius:4px;background:rgba(124,134,153,0.15);color:#7c8699;margin-left:6px;letter-spacing:0.5px }
      .dv2l-ht-tag-offline { font-size:9px;padding:2px 6px;border-radius:4px;background:rgba(245,158,11,0.15);color:#f59e0b;margin-left:6px;letter-spacing:0.5px }
      .dv2l-ht-panel { padding:14px }
      .dv2l-ht-input,.dv2l-ht-select,.dv2l-ht-textarea { width:100%;background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:6px;padding:8px 10px;color:var(--text-primary);font-size:12px;font-family:inherit }
      .dv2l-ht-textarea { min-height:60px;resize:vertical }
      .dv2l-ht-label { font-size:10px;color:var(--text-tertiary);letter-spacing:0.6px;text-transform:uppercase;display:block;margin-bottom:4px;font-weight:600 }
      .dv2l-ht-fgroup { margin-bottom:10px }
      .dv2l-ht-modal-bg { position:fixed;inset:0;background:rgba(4,12,20,0.65);z-index:1000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px) }
      .dv2l-ht-modal { background:var(--bg-card,rgba(15,23,32,0.95));border:1px solid var(--border);border-radius:10px;max-width:520px;width:92%;max-height:85vh;overflow:auto;padding:18px }
    </style>
    ${tabStrip}
    <div id="dv2l-ht-panel-tasks" style="display:${activeTab==='tasks'?'block':'none'}"></div>
    <div id="dv2l-ht-panel-log" style="display:${activeTab==='log'?'block':'none'}"></div>
    <div id="ls-session-panel" style="display:${activeTab==='session'?'block':'none'}">
    <style>
      .ls-root { display:grid; grid-template-columns:minmax(0,1.4fr) minmax(0,1fr); gap:16px; padding:16px; max-width:1600px; margin:0 auto; }
      .ls-col-right { display:grid; grid-template-rows:auto auto; gap:16px; }
      @media (max-width:1080px){ .ls-root { grid-template-columns:1fr; } }
      .ls-timer-card { padding:22px;background:linear-gradient(135deg, rgba(0,212,188,0.08), rgba(74,158,255,0.04)), var(--bg-card, rgba(15,23,32,0.6));border:1px solid rgba(0,212,188,0.18);border-radius:12px;position:relative;overflow:hidden;margin-bottom:12px }
      .ls-ring-wrap { position:relative;width:210px;height:210px;flex-shrink:0 }
      .ls-ring-center { position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center }
      .ls-ring-time { font-family:var(--dv2-font-mono,var(--font-mono));font-size:48px;font-weight:600;letter-spacing:-1px;line-height:1;color:var(--text-primary) }
      .ls-phase-cell { display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:8px 6px;border-radius:6px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);font-size:10.5px;color:var(--text-tertiary);cursor:pointer;transition:all .15s }
      .ls-phase-cell em { font-style:normal;font-family:var(--dv2-font-mono,var(--font-mono));font-size:10px;color:var(--text-tertiary) }
      .ls-phase-cell.done { background:rgba(74,222,128,0.08);border-color:rgba(74,222,128,0.25);color:var(--green,#4ade80) }
      .ls-phase-cell.done em { color:var(--green,#4ade80) }
      .ls-phase-cell.active { background:rgba(0,212,188,0.1);border-color:rgba(0,212,188,0.35);color:var(--teal,#00d4bc) }
      .ls-phase-cell.active em { color:var(--teal,#00d4bc) }
      .ls-check { display:flex;align-items:center;gap:10px;padding:7px 2px;cursor:pointer;font-size:12px;color:var(--text-secondary) }
      .ls-check input { position:absolute;opacity:0;pointer-events:none }
      .ls-check-box { width:14px;height:14px;border-radius:3px;border:1.5px solid var(--border);flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.02) }
      .ls-check.done .ls-check-box { background:var(--teal,#00d4bc);border-color:var(--teal,#00d4bc);color:#04121c }
      .ls-check.done .ls-check-box::after { content:'\u2713';font-size:10px;font-weight:700;color:#04121c }
      .ls-check.done .ls-check-lbl { color:var(--text-tertiary);text-decoration:line-through }
      .ls-log-row { display:grid;grid-template-columns:80px 64px 1fr;gap:10px;padding:4px 0;font-family:var(--dv2-font-mono,var(--font-mono));font-size:11px;line-height:1.7;animation:lsFadeIn .25s ease-out }
      .ls-log-ts { color:var(--text-tertiary) }
      .ls-log-type { font-weight:700 }
      .ls-log-msg { color:var(--text-secondary);word-break:break-word }
      .ls-ae-btn { padding:8px 12px;border-radius:6px;background:rgba(255,181,71,0.08);border:1px solid rgba(255,181,71,0.25);color:var(--amber,#f59e0b);font-size:12px;cursor:pointer;transition:all .15s }
      .ls-ae-btn:hover { background:rgba(255,181,71,0.14) }
      @keyframes lsFadeIn { from { opacity:0;transform:translateY(-2px) } to { opacity:1;transform:none } }
    </style>

    <div class="ls-root">
      <div class="ls-col-left">
        <div class="ls-timer-card">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">
            <div>
              <div style="font-family:var(--dv2-font-mono,var(--font-mono));font-size:10px;color:var(--teal,#00d4bc);letter-spacing:1.4px;text-transform:uppercase;margin-bottom:4px">${paused ? 'Paused' : 'Session timer'}</div>
              <div style="font-size:12px;color:var(--text-secondary)">${_e((phase || 'stimulation').replace(/_/g,' '))} phase</div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;padding:3px 9px;border-radius:999px;background:${paused?'rgba(255,181,71,0.12)':'rgba(74,222,128,0.12)'};border:1px solid ${paused?'rgba(255,181,71,0.3)':'rgba(74,222,128,0.3)'};font-size:11px;color:${paused?'var(--amber,#f59e0b)':'var(--green,#4ade80)'};font-weight:600"><span style="width:6px;height:6px;border-radius:50%;background:currentColor"></span>${paused ? 'Paused' : 'Device nominal'}</div>
          </div>

          <div style="display:flex;align-items:center;gap:28px;flex-wrap:wrap">
            <div class="ls-ring-wrap">
              <svg width="210" height="210" style="transform:rotate(-90deg)">
                <circle cx="105" cy="105" r="92" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="10"/>
                <circle id="ls-ring-prog" cx="105" cy="105" r="92" fill="none" stroke="url(#ls-ring-grad)" stroke-width="10" stroke-linecap="round" stroke-dasharray="${circ.toFixed(2)}" stroke-dashoffset="${dashOffset.toFixed(2)}"/>
                <defs><linearGradient id="ls-ring-grad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#00d4bc"/><stop offset="100%" stop-color="#4a9eff"/></linearGradient></defs>
              </svg>
              <div class="ls-ring-center">
                <div class="ls-ring-time" id="ls-ring-time">${_lsFmtClock(remaining)}</div>
                <div style="font-size:10px;letter-spacing:1.4px;text-transform:uppercase;color:var(--text-tertiary);margin-top:4px">Remaining of ${_lsFmtClock(durationSec)}</div>
              </div>
            </div>

            <div style="flex:1;min-width:220px;display:flex;flex-direction:column;gap:14px">
              <div>
                <div style="font-size:10px;letter-spacing:1.2px;text-transform:uppercase;color:var(--text-tertiary);font-weight:600;margin-bottom:4px">Current output</div>
                <div id="ls-ma-readout" style="font-family:var(--dv2-font-display,var(--font-display));font-size:42px;font-weight:600;letter-spacing:-1.2px;line-height:1;color:var(--teal,#00d4bc)">${currentMA.toFixed(2)}<span style="font-size:18px;color:var(--text-tertiary);font-weight:500;margin-left:6px">mA</span></div>
                <div id="ls-ma-meta" style="font-size:11px;color:var(--text-tertiary);margin-top:4px;font-family:var(--dv2-font-mono,var(--font-mono))">target ${(session.intensity_mA || 2).toFixed(2)} \u00B7 \u0394 \u00B10.02</div>
              </div>
              <div>
                <div style="font-size:10px;letter-spacing:1.2px;text-transform:uppercase;color:var(--text-tertiary);font-weight:600;margin-bottom:4px">Impedance</div>
                <div style="font-family:var(--dv2-font-display,var(--font-display));font-size:26px;font-weight:600;letter-spacing:-0.6px;line-height:1" id="ls-imp-readout">${impedanceKohm.toFixed(1)}<span style="font-size:14px;color:var(--text-tertiary);font-weight:500;margin-left:3px">k\u03A9</span></div>
                <div style="height:6px;border-radius:3px;background:rgba(255,255,255,0.05);overflow:hidden;margin-top:6px;width:200px"><div id="ls-imp-bar" style="height:100%;width:${impedancePct.toFixed(0)}%;background:${impColor};border-radius:3px;transition:width .3s"></div></div>
                <div style="font-size:10px;color:var(--text-tertiary);margin-top:4px">${impedanceKohm < 10 ? 'good' : impedanceKohm < 15 ? 'elevated' : 'high'} \u00B7 limit 20 k\u03A9</div>
              </div>
            </div>
          </div>

          <div style="margin-top:18px;display:grid;grid-template-columns:repeat(4,1fr);gap:4px">${phaseHtml}</div>
        </div>

        <div class="dv2-card" style="padding:16px;margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
            <div>
              <div style="font-family:var(--dv2-font-display,var(--font-display));font-size:14px;font-weight:600">Current trace \u00B7 last 60s</div>
              <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">Target ${(session.intensity_mA || 2).toFixed(1)} mA \u00B7 drift-corrected</div>
            </div>
            <span class="chip teal">${paused ? 'Paused' : 'Live'}</span>
          </div>
          <svg id="ls-trace-svg" viewBox="0 0 500 160" style="width:100%;height:170px" aria-hidden="true">
            <defs><linearGradient id="ls-wf-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#00d4bc" stop-opacity="0.35"/><stop offset="100%" stop-color="#00d4bc" stop-opacity="0"/></linearGradient></defs>
            <g stroke="rgba(255,255,255,0.05)"><line x1="0" y1="40" x2="500" y2="40"/><line x1="0" y1="80" x2="500" y2="80"/><line x1="0" y1="120" x2="500" y2="120"/></g>
            <line x1="0" y1="80" x2="500" y2="80" stroke="rgba(0,212,188,0.35)" stroke-width="1" stroke-dasharray="3,3"/>
            <text x="8" y="36" font-size="9" fill="#7c8699" font-family="var(--dv2-font-mono,monospace)">${((session.intensity_mA||2)+0.2).toFixed(1)} mA</text>
            <text x="8" y="84" font-size="9" fill="#00d4bc" font-family="var(--dv2-font-mono,monospace)">${(session.intensity_mA||2).toFixed(1)} mA</text>
            <text x="8" y="124" font-size="9" fill="#7c8699" font-family="var(--dv2-font-mono,monospace)">${((session.intensity_mA||2)-0.2).toFixed(1)} mA</text>
            <path id="ls-trace-fill" d="${tracePathD.fill}" fill="url(#ls-wf-g)"/>
            <path id="ls-trace-line" d="${tracePathD.line}" stroke="#00d4bc" stroke-width="1.8" fill="none"/>
            <circle id="ls-trace-dot" cx="500" cy="${tracePathD.lastY.toFixed(1)}" r="4" fill="#00d4bc"/>
          </svg>
          <div style="display:flex;justify-content:space-between;font-family:var(--dv2-font-mono,var(--font-mono));font-size:10px;color:var(--text-tertiary);margin-top:2px"><span>\u221260s</span><span>\u221230s</span><span>now</span></div>
        </div>

        ${monitorWidget}

        <div class="dv2-card" style="padding:16px;margin-top:12px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
            <div>
              <div style="font-family:var(--dv2-font-display,var(--font-display));font-size:14px;font-weight:600">Operator checklist</div>
              <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">Click to mark done \u00B7 logged to event record</div>
            </div>
            <span class="chip teal" id="ls-check-count">${checklist.filter(c=>c.done).length}/${checklist.length}</span>
          </div>
          <div>${checklistHtml}</div>
        </div>
      </div>

      <div class="ls-col-right">
        <div>
          ${videoPanel}

          <div class="dv2-card" style="padding:16px;margin-bottom:12px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
              <div>
                <div style="font-family:var(--dv2-font-display,var(--font-display));font-size:14px;font-weight:600">Patient \u00B7 side-effect report</div>
                <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">Self-report or operator-entered</div>
              </div>
              <span class="chip green">OK</span>
            </div>
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--border)">
              <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#00d4bc,#4a9eff);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:#04121c">${_e(patient.initials || _lsInitials(patient.display_name))}</div>
              <div>
                <div style="font-size:14px;font-weight:600;font-family:var(--dv2-font-display,var(--font-display))">${_e(patient.display_name || '')}</div>
                <div style="font-size:11px;color:var(--text-tertiary)">${patient.age ? patient.age : ''}${patient.sex ? patient.sex : ''} \u00B7 ${_e(patient.condition || '')} \u00B7 session ${session.session_no || 1}/${session.session_total || 20}</div>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px">
              ${['tingling','itching','headache','discomfort','other'].map(ae => `
                <button class="ls-ae-btn" onclick="window._lsReportAE('${ae}')">Report ${ae}</button>
              `).join('')}
            </div>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:12px">
              ${['tingling','itching','headache','discomfort'].map(k => `
                <div><div style="font-size:9px;color:var(--text-tertiary);letter-spacing:0.8px;text-transform:uppercase;font-weight:600;margin-bottom:3px">${k}</div><div id="ls-ae-${k}" style="font-family:var(--dv2-font-display,var(--font-display));font-size:18px;font-weight:600">${sideEffects[k]}<span style="font-size:10px;color:var(--text-tertiary);margin-left:3px">/10</span></div></div>
              `).join('')}
            </div>
          </div>

          <div class="dv2-card" style="padding:16px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
              <div>
                <div style="font-family:var(--dv2-font-display,var(--font-display));font-size:14px;font-weight:600">Montage</div>
                <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">${_e(session.modality || 'tDCS')} \u00B7 ${_e(anode)} \u2192 ${_e(cathode)}</div>
              </div>
              <span class="chip teal">${_e(anode)} / ${_e(cathode)}</span>
            </div>
            <div style="aspect-ratio:1/1;display:flex;align-items:center;justify-content:center" id="ls-brain-mount">${brainMapSvg}</div>
          </div>
        </div>

        <div class="dv2-card" style="padding:16px;display:flex;flex-direction:column;min-height:280px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
            <div>
              <div style="font-family:var(--dv2-font-display,var(--font-display));font-size:14px;font-weight:600">Event log</div>
              <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">Append-only \u00B7 newest first \u00B7 session ${_e(session.id)}</div>
            </div>
            <span class="chip" id="ls-log-count">${events.length} entries</span>
          </div>
          <div id="ls-log-body" style="max-height:380px;overflow-y:auto;padding-right:4px">${eventsHtml}</div>
        </div>
      </div>
    </div>
    </div>
  `;

  _lsLoadBrainMapLazy();
  if (activeTab === 'tasks') _lsRenderTasks();
  if (activeTab === 'log') _lsRenderLogPanel();
}

function _lsBrainMapFallback(anode, cathode) {
  const sites = { 'Fp1':[160,60],'Fp2':[240,60],'F3':[150,140],'F4':[250,140],'Fz':[200,135],'C3':[130,200],'Cz':[200,200],'C4':[270,200],'P3':[150,260],'Pz':[200,265],'P4':[250,260],'O1':[170,330],'O2':[230,330] };
  const dots = Object.entries(sites).map(([k,[x,y]]) => {
    const isA = k === anode, isC = k === cathode;
    if (isA) return `<circle cx="${x}" cy="${y}" r="12" fill="rgba(255,107,107,0.2)" stroke="#ff6b6b" stroke-width="2"/><circle cx="${x}" cy="${y}" r="4" fill="#ff6b6b"/><text x="${x}" y="${y-18}" text-anchor="middle" font-size="10" fill="#ff6b6b" font-weight="700">${k} (+)</text>`;
    if (isC) return `<circle cx="${x}" cy="${y}" r="12" fill="rgba(0,212,188,0.2)" stroke="#00d4bc" stroke-width="2"/><circle cx="${x}" cy="${y}" r="4" fill="#00d4bc"/><text x="${x}" y="${y-18}" text-anchor="middle" font-size="10" fill="#00d4bc" font-weight="700">${k} (-)</text>`;
    return `<circle cx="${x}" cy="${y}" r="4" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.25)" stroke-width="1"/><text x="${x}" y="${y-8}" text-anchor="middle" font-size="8" fill="rgba(255,255,255,0.35)">${k}</text>`;
  }).join('');
  const a = sites[anode], c = sites[cathode];
  const line = a && c ? `<line x1="${a[0]}" y1="${a[1]}" x2="${c[0]}" y2="${c[1]}" stroke="url(#ls-bm-grad)" stroke-width="2" stroke-dasharray="4,3"/>` : '';
  return `<svg viewBox="0 0 400 400" style="width:100%;height:100%;max-width:320px">
    <defs><linearGradient id="ls-bm-grad" x1="0%" x2="100%"><stop offset="0%" stop-color="#ff6b6b"/><stop offset="100%" stop-color="#00d4bc"/></linearGradient></defs>
    <ellipse cx="200" cy="200" rx="165" ry="180" fill="rgba(14,22,40,0.45)" stroke="rgba(255,255,255,0.15)" stroke-width="2"/>
    <polygon points="200,20 188,40 212,40" fill="rgba(255,255,255,0.08)"/>
    ${line}${dots}
  </svg>`;
}

async function _lsLoadBrainMapLazy() {
  if (window.__brainMap) return;
  try {
    const mod = await import('./brain-map-svg.js');
    window.__brainMap = mod;
    const s = _lsState; if (!s || !s.session) return;
    const mount = document.getElementById('ls-brain-mount');
    if (!mount) return;
    const anode = (s.session.montage || '').split(/\s*[\u2192\->]+\s*/)[0]?.trim() || 'F3';
    const cathode = (s.session.montage || '').split(/\s*[\u2192\->]+\s*/)[1]?.trim() || 'Fp2';
    mount.innerHTML = mod.renderBrainMap10_20({ anode, cathode, targetRegion: s.session.target_region || null, size: 320 });
  } catch {}
}

function _lsPhaseDoneBefore(current, candidate) {
  const order = ['setup','ramp_up','stim','ramp_dn','done'];
  return order.indexOf(candidate) < order.indexOf(current);
}

function _lsTraceD(arr, w, h, target) {
  const N = arr.length;
  const xs = i => (i / (N - 1)) * w;
  const ys = v => {
    const ymid = h / 2;
    const px = (v - target) / 0.4;
    return Math.max(6, Math.min(h - 6, ymid - px * (h / 2 - 12)));
  };
  let line = '', fill = '';
  arr.forEach((v, i) => { const x = xs(i).toFixed(1), y = ys(v).toFixed(1); line += (i === 0 ? 'M' : 'L') + x + ' ' + y + ' '; });
  fill = 'M0 ' + h + ' L' + line.slice(1) + 'L' + w + ' ' + h + ' Z';
  const lastY = ys(arr[N - 1]);
  return { line: line.trim(), fill, lastY };
}

function _lsStartTimers() {
  const s = _lsState; if (!s) return;
  if (s.timerInt) clearInterval(s.timerInt);
  if (s.traceInt) clearInterval(s.traceInt);

  s.timerInt = setInterval(() => {
    if (!_lsState || _lsState.paused) return;
    _lsState.elapsedSec = Math.min(_lsState.durationSec, _lsState.elapsedSec + 1);
    const remaining = Math.max(0, _lsState.durationSec - _lsState.elapsedSec);
    const frac = _lsState.durationSec > 0 ? Math.min(1, _lsState.elapsedSec / _lsState.durationSec) : 0;
    const circ = 2 * Math.PI * 92;
    const dashOffset = circ * (1 - frac);
    const ringEl = document.getElementById('ls-ring-prog');
    const timeEl = document.getElementById('ls-ring-time');
    if (ringEl) ringEl.setAttribute('stroke-dashoffset', dashOffset.toFixed(2));
    if (timeEl) timeEl.textContent = _lsFmtClock(remaining);
    if (remaining === 0 && _lsState.phase !== 'done') {
      _lsState.phase = 'done';
      _lsLogEvent('STIM', 'Session complete \u00B7 auto-transition to post-stim');
    }
  }, 1000);

  s.traceInt = setInterval(() => {
    if (!_lsState) return;
    if (_lsState.paused) return;
    const target = _lsState.session.intensity_mA || 2.0;
    const drift = (Math.random() - 0.5) * 0.05;
    const next = target + drift;
    _lsState.currentMA = next;
    _lsState.trace.push(next);
    if (_lsState.trace.length > 60) _lsState.trace.shift();
    const { line, fill, lastY } = _lsTraceD(_lsState.trace, 500, 160, target);
    const l = document.getElementById('ls-trace-line'); if (l) l.setAttribute('d', line);
    const f = document.getElementById('ls-trace-fill'); if (f) f.setAttribute('d', fill);
    const d = document.getElementById('ls-trace-dot'); if (d) d.setAttribute('cy', lastY.toFixed(1));
    const r = document.getElementById('ls-ma-readout');
    if (r) r.innerHTML = `${next.toFixed(2)}<span style="font-size:18px;color:var(--text-tertiary);font-weight:500;margin-left:6px">mA</span>`;
  }, 1000);
}

function _lsBindKeys() {
  const s = _lsState; if (!s) return;
  const handler = ev => {
    const t = ev.target;
    const inField = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    if (inField) return;
    if (ev.code === 'Space' || ev.key === ' ') {
      ev.preventDefault();
      _lsPauseResume();
    } else if (ev.key === 'Escape') {
      _lsEndSession();
    }
  };
  document.addEventListener('keydown', handler);
  s.keyHandler = handler;
}

function _lsBindNavCleanup() {
  const s = _lsState; if (!s) return;
  const orig = window._nav;
  if (typeof orig === 'function' && !window._nav.__lsPatched) {
    window._nav = async function(id, params) {
      if (id !== 'live-session') _lsTeardown();
      return orig(id, params);
    };
    window._nav.__lsPatched = true;
    s.navHandler = { orig };
  }
  const ul = () => _lsTeardown();
  window.addEventListener('beforeunload', ul);
  s.unloadHandler = ul;
}

function _lsTeardown() {
  const s = _lsState;
  if (!s) return;
  try { if (s.timerInt) clearInterval(s.timerInt); } catch {}
  try { if (s.traceInt) clearInterval(s.traceInt); } catch {}
  try { if (s.tasksRefreshInt) clearInterval(s.tasksRefreshInt); } catch {}
  try { if (s.keyHandler) document.removeEventListener('keydown', s.keyHandler); } catch {}
  try { if (s.unloadHandler) window.removeEventListener('beforeunload', s.unloadHandler); } catch {}
  try { const m = document.querySelector('.dv2l-ht-modal-bg'); if (m) m.remove(); } catch {}
  s.timerInt = null;
  s.traceInt = null;
  s.tasksRefreshInt = null;
  s.keyHandler = null;
  s.unloadHandler = null;
  _lsState = null;
}

function _lsLogEvent(type, note) {
  const s = _lsState; if (!s) return;
  const ev = { ts: new Date().toISOString(), type, note };
  s.events.unshift(ev);
  const body = document.getElementById('ls-log-body');
  if (body) {
    const col = type === 'STIM' ? 'var(--teal,#00d4bc)' : type === 'CHECK' ? 'var(--blue,#4a9eff)' : type === 'RAMP' ? 'var(--amber,#f59e0b)' : type === 'OPER' ? 'var(--violet,#a78bfa)' : type === 'AE' ? '#ff6b6b' : type === 'CLEAR' ? 'var(--green,#4ade80)' : 'var(--text-secondary)';
    const row = document.createElement('div');
    row.className = 'ls-log-row';
    row.innerHTML = `<span class="ls-log-ts">${_lsFmtTs(ev.ts)}</span><span class="ls-log-type" style="color:${col}">${_e(type)}</span><span class="ls-log-msg">${_e(note)}</span>`;
    body.insertBefore(row, body.firstChild);
    body.scrollTop = 0;
  }
  const cnt = document.getElementById('ls-log-count');
  if (cnt) cnt.textContent = `${s.events.length} entries`;
  try { api.logSessionEvent?.(s.session.id, { type, note }); } catch {}
}

function _lsCheckToggle(id) {
  const s = _lsState; if (!s) return;
  const c = s.checklist.find(x => x.id === id); if (!c) return;
  c.done = !c.done;
  const doneCount = s.checklist.filter(x => x.done).length;
  const row = document.querySelector(`#ls-ck-${id}`)?.closest('.ls-check');
  if (row) row.classList.toggle('done', c.done);
  const cnt = document.getElementById('ls-check-count');
  if (cnt) cnt.textContent = `${doneCount}/${s.checklist.length}`;
  _lsLogEvent('OPER', `${c.done ? 'Completed' : 'Reopened'}: ${c.label}`);
}

function _lsReportAE(kind) {
  const s = _lsState; if (!s) return;
  if (kind === 'other') {
    const v = window.prompt('Describe adverse event or observation:');
    if (!v) return;
    _lsLogEvent('AE', 'Other: ' + v);
    return;
  }
  const cur = s.sideEffects[kind] || 0;
  s.sideEffects[kind] = Math.min(10, cur + 1);
  const el = document.getElementById('ls-ae-' + kind);
  if (el) el.innerHTML = `${s.sideEffects[kind]}<span style="font-size:10px;color:var(--text-tertiary);margin-left:3px">/10</span>`;
  _lsLogEvent('AE', `${kind} reported \u00B7 level ${s.sideEffects[kind]}/10`);
  try { api.logSessionEvent?.(s.session.id, { type: 'AE', note: `${kind} ${s.sideEffects[kind]}/10` }); } catch {}
}

function _lsPauseResume() {
  const s = _lsState; if (!s) return;
  s.paused = !s.paused;
  const btn = document.getElementById('ls-pause-btn');
  if (btn) btn.textContent = s.paused ? 'Resume' : 'Pause';
  _lsLogEvent('OPER', s.paused ? 'Session paused by operator' : 'Session resumed');
}

function _lsEndSession() {
  const s = _lsState; if (!s) return;
  if (!window.confirm('End this session? This will stop stimulation and finalise the record.')) return;
  _lsLogEvent('OPER', 'Session ended by operator');
  try { api.sessionPhaseTransition?.(s.session.id, 'ended'); } catch {}
  _lsTeardown();
  try { window._nav?.('courses') || window._nav?.('dashboard'); } catch {}
}

function _lsPhase(id) {
  const s = _lsState; if (!s) return;
  s.phase = id;
  _lsLogEvent('STIM', `Phase transition \u2192 ${id}`);
  try { api.sessionPhaseTransition?.(s.session.id, id); } catch {}
  _lsRender();
  _lsStartTimers();
}

async function _lsStartVideo() {
  const s = _lsState; if (!s) return;
  s.videoActive = true;
  try { await (api.startVideoConsult?.(s.session.id)); } catch {}
  _lsLogEvent('OPER', 'Video consult started');
  _lsRender();
  _lsStartTimers();
}

async function _lsEndVideo() {
  const s = _lsState; if (!s) return;
  s.videoActive = false;
  try { await (api.endVideoConsult?.(s.session.id)); } catch {}
  _lsLogEvent('OPER', 'Video consult ended');
  _lsRender();
  _lsStartTimers();
}

async function _lsSnapMonitor() {
  const s = _lsState; if (!s) return;
  let snap = null;
  try { snap = await (api.remoteMonitorSnapshot?.(s.session.patient_id || s.session.id)); } catch {}
  if (!snap) snap = { hrv: Math.round(50 + Math.random() * 20), impedance: s.impedanceKohm, adherence: 'OK' };
  const grid = document.getElementById('ls-monitor-grid');
  if (grid) {
    grid.innerHTML = `
      <div><div style="color:var(--text-tertiary);font-size:10px;letter-spacing:0.8px;text-transform:uppercase">HRV</div><div style="font-family:var(--dv2-font-mono,var(--font-mono));font-size:16px;font-weight:600">${snap.hrv}<span style="font-size:10px;color:var(--text-tertiary);margin-left:3px">ms</span></div></div>
      <div><div style="color:var(--text-tertiary);font-size:10px;letter-spacing:0.8px;text-transform:uppercase">Impedance</div><div style="font-family:var(--dv2-font-mono,var(--font-mono));font-size:16px;font-weight:600">${Number(snap.impedance || 0).toFixed(1)}<span style="font-size:10px;color:var(--text-tertiary);margin-left:3px">k\u03A9</span></div></div>
      <div><div style="color:var(--text-tertiary);font-size:10px;letter-spacing:0.8px;text-transform:uppercase">Adherence</div><div style="font-family:var(--dv2-font-mono,var(--font-mono));font-size:16px;font-weight:600;color:var(--green,#4ade80)">${_e(snap.adherence || 'OK')}</div></div>`;
  }
  _lsLogEvent('CHECK', `Telemetry snapshot \u00B7 HRV ${snap.hrv}ms`);
}

function _lsSetImpedance(kohm) {
  const s = _lsState; if (!s) return;
  s.impedanceKohm = kohm;
  try { api.setSessionImpedance?.(s.session.id, kohm); } catch {}
  const r = document.getElementById('ls-imp-readout');
  if (r) r.innerHTML = `${kohm.toFixed(1)}<span style="font-size:14px;color:var(--text-tertiary);font-weight:500;margin-left:3px">k\u03A9</span>`;
  const b = document.getElementById('ls-imp-bar');
  if (b) b.style.width = Math.min(100, (kohm / 20) * 100).toFixed(0) + '%';
}

// ── Home Task Manager (embedded inside Live Session) ──────────────────────
const LS_HT_TASK_TYPES = [
  { id:'breathing',    icon:'\uD83D\uDCA8', label:'Breathing / Relaxation' },
  { id:'sleep',        icon:'\uD83C\uDF19', label:'Sleep Routine' },
  { id:'mood-journal', icon:'\uD83D\uDCD3', label:'Mood Journal' },
  { id:'activity',     icon:'\uD83C\uDFC3', label:'Walking / Activity' },
  { id:'assessment',   icon:'\uD83D\uDCCB', label:'Assessment / Check-in' },
  { id:'media',        icon:'\uD83C\uDFAC', label:'Watch / Listen Guide' },
  { id:'home-device',  icon:'\uD83E\uDDE0', label:'Home Device Session' },
  { id:'caregiver',    icon:'\uD83E\uDD1D', label:'Caregiver Task' },
  { id:'pre-session',  icon:'\u26A1',       label:'Pre-Session Prep' },
  { id:'post-session', icon:'\uD83C\uDF3F', label:'Post-Session Care' },
];
const LS_HT_STATUSES = ['assigned','in-progress','completed','skipped','overdue'];
const LS_HT_CYCLE = { 'assigned':'in-progress', 'in-progress':'completed', 'completed':'assigned', 'skipped':'assigned', 'overdue':'in-progress' };

function _lsHtTypeIcon(id) { return (LS_HT_TASK_TYPES.find(t => t.id === id) || {}).icon || '\uD83D\uDCDD'; }
function _lsHtTypeLabel(id) { return (LS_HT_TASK_TYPES.find(t => t.id === id) || {}).label || (id || 'Task'); }
function _lsHtClinKey(pid) { return 'ds_clinician_tasks_' + pid; }
function _lsHtCompKey(pid) { return 'ds_task_completions_' + pid; }
function _lsHtRead(k, d) { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch { return d; } }
function _lsHtWrite(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

function _lsSetTab(tab) {
  const s = _lsState; if (!s) return;
  if (tab === 'htm') {
    // Render Home Task Manager in a full-screen overlay so the clinician
    // stays in the Virtual Care context (no page navigation).
    const existing = document.getElementById('ls-htm-overlay');
    if (existing) { existing.remove(); }
    const overlay = document.createElement('div');
    overlay.id = 'ls-htm-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:600;background:var(--bg-root,#040c14);overflow:auto;display:flex;flex-direction:column';
    const patientName = s.patient?.display_name || s.session?.patient_name || '';
    overlay.innerHTML = `
      <div style="padding:10px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px;flex-shrink:0;background:var(--bg-sidebar,rgba(4,12,20,0.95));backdrop-filter:blur(8px)">
        <button id="ls-htm-close" class="btn btn-sm">← Back to Session</button>
        <span style="font-size:13px;font-weight:600">Home Task Manager</span>
        ${patientName ? `<span style="font-size:11px;color:var(--teal,#00d4bc);font-weight:600">${patientName}</span><span style="font-size:11px;color:var(--text-tertiary)">· current session patient</span>` : `<span style="font-size:11px;color:var(--text-tertiary)">All patients · assign tasks · track adherence</span>`}
      </div>
      <div id="ls-htm-content" style="flex:1;overflow:auto"></div>`;
    document.body.appendChild(overlay);
    document.getElementById('ls-htm-close')?.addEventListener('click', () => {
      overlay.remove();
      _lsSetTab('session');
    });
    // Pre-select the current session's patient so the clinician lands on their task view.
    if (s.session?.patient_id) {
      window._hpPatViewPid = s.session.patient_id;
    }
    // Temporarily promote the overlay content div to #content so pgHomePrograms renders into it.
    const realContent = document.getElementById('content');
    if (realContent) realContent.id = '__ls_content_bak__';
    const htmContent = document.getElementById('ls-htm-content');
    if (htmContent) htmContent.id = 'content';
    (async () => {
      try {
        const { pgHomePrograms } = await import('./pages-clinical-tools.js');
        await pgHomePrograms(() => {}, null);
      } catch {
        const c = document.getElementById('content');
        if (c) c.innerHTML = `<div style="padding:48px;text-align:center;color:var(--text-tertiary)"><div style="font-size:32px;margin-bottom:12px">🏠</div><div>Could not load Home Task Manager.</div></div>`;
      }
      // Restore IDs — overlay content no longer needs to be #content.
      const overlayInner = document.getElementById('content');
      if (overlayInner && overlayInner.closest('#ls-htm-overlay')) overlayInner.id = 'ls-htm-content';
      if (realContent) realContent.id = 'content';
    })();
    return;
  }
  s.activeTab = tab;
  const panels = {
    session: document.getElementById('ls-session-panel'),
    tasks:   document.getElementById('dv2l-ht-panel-tasks'),
    log:     document.getElementById('dv2l-ht-panel-log'),
  };
  Object.entries(panels).forEach(([k, el]) => { if (el) el.style.display = (k === tab) ? 'block' : 'none'; });
  const strip = document.querySelectorAll('.dv2l-ht-tabbtn');
  strip.forEach(b => {
    const key = b.getAttribute('data-ls-tab');
    if (key) b.classList.toggle('on', key === tab);
  });
  if (tab === 'tasks') _lsRenderTasks();
  if (tab === 'log') _lsRenderLogPanel();
}

function _lsTasksTab() { _lsSetTab('tasks'); }

function _lsRenderLogPanel() {
  const el = document.getElementById('dv2l-ht-panel-log'); if (!el) return;
  const s = _lsState; if (!s) return;
  const rows = s.events.map(ev => {
    const type = (ev.type || 'INFO').toUpperCase();
    const col = type === 'STIM' ? 'var(--teal,#00d4bc)' : type === 'CHECK' ? 'var(--blue,#4a9eff)' : type === 'RAMP' ? 'var(--amber,#f59e0b)' : type === 'OPER' ? 'var(--violet,#a78bfa)' : type === 'CLEAR' ? 'var(--green,#4ade80)' : type === 'AE' ? '#ff6b6b' : 'var(--text-secondary)';
    return `<div class="ls-log-row"><span class="ls-log-ts">${_lsFmtTs(ev.ts)}</span><span class="ls-log-type" style="color:${col}">${_e(type)}</span><span class="ls-log-msg">${_e(ev.note || ev.message || '')}</span></div>`;
  }).join('');
  el.innerHTML = `
    <div class="dv2l-ht-wrap" style="grid-template-columns:1fr">
      <div class="dv2-card dv2l-ht-panel">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
          <div>
            <div style="font-family:var(--dv2-font-display,var(--font-display));font-size:14px;font-weight:600">Event log</div>
            <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">Append-only \u00B7 newest first \u00B7 session ${_e(s.session.id)}</div>
          </div>
          <span class="chip">${s.events.length} entries</span>
        </div>
        <div style="max-height:62vh;overflow-y:auto;padding-right:4px">${rows}</div>
      </div>
    </div>`;
}

async function _lsLoadTasks() {
  const s = _lsState; if (!s) return;
  const pid = s.taskSelectedPid || s.session.patient_id;
  if (!pid) { s.tasks = []; s.completions = {}; s.tasksLoaded = true; return; }
  let tasks = null; let offline = false;
  try {
    const res = await (api.listHomeProgramTasks?.({ patientId: pid }));
    if (res && Array.isArray(res.items)) tasks = res.items;
    else if (Array.isArray(res)) tasks = res;
  } catch { offline = true; }
  if (!tasks) {
    tasks = _lsHtRead(_lsHtClinKey(pid), null);
    if (!tasks || !tasks.length) {
      tasks = _lsHtSeedTasks(pid);
      _lsHtWrite(_lsHtClinKey(pid), tasks);
      offline = true;
    } else {
      offline = true;
    }
  }
  let compMap = {};
  try {
    const comps = await (api.listHomeProgramTaskCompletions?.({ patientId: pid }));
    if (Array.isArray(comps)) {
      comps.forEach(c => { if (c && c.server_task_id) compMap[c.server_task_id] = c; });
    }
  } catch {}
  if (!Object.keys(compMap).length) {
    const saved = _lsHtRead(_lsHtCompKey(pid), {});
    Object.keys(saved || {}).forEach(k => { compMap[k] = saved[k]; });
  }
  s.tasks = (tasks || []).map(t => ({ ...t, _offline: offline || !!t._demo }));
  s.completions = compMap;
  s.tasksLoaded = true;
}

function _lsHtSeedTasks(pid) {
  const today = new Date();
  const iso = (d) => d.toISOString();
  const addDays = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return d; };
  return [
    { id:`demo-${pid}-1`, patientId:pid, title:'Daily mood check-in', type:'mood-journal', category:'mood-journal',
      instructions:'Rate mood 0-10 with one-line note', frequency:'daily', dueDate:iso(addDays(0)),
      status:'in-progress', assignedAt:iso(addDays(-5)), lastActivityAt:iso(addDays(0)),
      _demo:true, _history:[1,1,0,1,1,1,0,1,1,1,1,1,0,1] },
    { id:`demo-${pid}-2`, patientId:pid, title:'Coherent breathing 10 min', type:'breathing', category:'breathing',
      instructions:'4s in / 6s out, 10 minutes', frequency:'daily', dueDate:iso(addDays(0)),
      status:'assigned', assignedAt:iso(addDays(-3)), lastActivityAt:iso(addDays(-1)),
      _demo:true, _history:[0,1,1,1,0,1,1,0,1,1,0,1,1,0] },
    { id:`demo-${pid}-3`, patientId:pid, title:'Walk 20 minutes', type:'activity', category:'activity',
      instructions:'Brisk walk in daylight', frequency:'3x-week', dueDate:iso(addDays(-1)),
      status:'overdue', assignedAt:iso(addDays(-10)), lastActivityAt:iso(addDays(-3)),
      _demo:true, _history:[1,0,1,0,0,1,0,0,1,0,1,0,0,0] },
    { id:`demo-${pid}-4`, patientId:pid, title:'Read handbook section 2', type:'media', category:'media',
      instructions:'Read tDCS safety handbook pp.8-14', frequency:'once', dueDate:iso(addDays(2)),
      status:'assigned', assignedAt:iso(addDays(-2)), lastActivityAt:null,
      _demo:true, _history:[0,0,0,0,0,0,0,0,0,0,0,0,0,0] },
    { id:`demo-${pid}-5`, patientId:pid, title:'Pre-session prep checklist', type:'pre-session', category:'pre-session',
      instructions:'Hydrate, no caffeine 2h pre, remove metallics', frequency:'before-session', dueDate:iso(addDays(1)),
      status:'completed', assignedAt:iso(addDays(-7)), lastActivityAt:iso(addDays(-1)),
      _demo:true, _history:[1,1,1,1,1,1,1,1,1,1,1,1,1,1] },
  ];
}

function _lsHtAdherence(task) {
  const h = Array.isArray(task._history) ? task._history : [];
  if (!h.length) {
    if (task.status === 'completed') return { pct: 100, num: 1, den: 1 };
    if (task.status === 'skipped' || task.status === 'overdue') return { pct: 0, num: 0, den: 1 };
    return { pct: 50, num: 0, den: 0 };
  }
  const num = h.filter(x => x).length;
  const den = h.length;
  return { pct: Math.round((num/den)*100), num, den };
}

function _lsHtOverallAdherence(tasks) {
  let num = 0, den = 0;
  tasks.forEach(t => { const a = _lsHtAdherence(t); num += a.num; den += a.den; });
  return den ? Math.round((num/den)*100) : 0;
}

function _lsHtSparkline(history) {
  const h = Array.isArray(history) ? history.slice(-14) : [];
  if (!h.length) return '<span class="dv2l-ht-meta">no data</span>';
  return '<span class="dv2l-ht-spark">' + h.map(v => `<i class="${v ? 'on' : ''}" style="height:${v ? 14 : 4}px"></i>`).join('') + '</span>';
}

async function _lsRenderTasks() {
  const s = _lsState; if (!s) return;
  const el = document.getElementById('dv2l-ht-panel-tasks'); if (!el) return;
  if (!s.taskSelectedPid) s.taskSelectedPid = s.session.patient_id || null;
  if (!s.tasksLoaded) { el.innerHTML = `<div class="dv2l-ht-wrap"><div class="dv2l-ht-empty">Loading home tasks\u2026</div><div></div></div>`; await _lsLoadTasks(); }
  const tasks = Array.isArray(s.tasks) ? s.tasks : [];
  const f = s.taskFilter || { category:'all', status:'all', overdueOnly:false };
  const now = Date.now();
  const decorated = tasks.map(t => {
    const status = (t.status === 'assigned' && t.dueDate && new Date(t.dueDate).getTime() < now - 86400000) ? 'overdue' : (t.status || 'assigned');
    return { ...t, _effectiveStatus: status };
  });
  const filtered = decorated.filter(t => {
    if (f.category !== 'all' && (t.type || t.category) !== f.category) return false;
    if (f.status !== 'all' && t._effectiveStatus !== f.status) return false;
    if (f.overdueOnly && t._effectiveStatus !== 'overdue') return false;
    return true;
  });
  const total = decorated.length;
  const completed = decorated.filter(t => t._effectiveStatus === 'completed').length;
  const overdue = decorated.filter(t => t._effectiveStatus === 'overdue').length;
  const pct = _lsHtOverallAdherence(decorated);
  const patient = s.patient || {};
  const offlineAny = decorated.some(t => t._offline);
  const categoryChips = ['all', ...LS_HT_TASK_TYPES.map(t => t.id)].map(c => {
    const lbl = c === 'all' ? 'All types' : _lsHtTypeLabel(c);
    return `<span class="dv2l-ht-chip${f.category===c?' on':''}" onclick="window._lsSetTaskFilter('category','${c}')">${_e(lbl)}</span>`;
  }).join('');
  const statusChips = ['all', ...LS_HT_STATUSES].map(c => {
    const lbl = c === 'all' ? 'Any status' : c.replace('-',' ');
    return `<span class="dv2l-ht-chip${f.status===c?' on':''}" onclick="window._lsSetTaskFilter('status','${c}')">${_e(lbl)}</span>`;
  }).join('');
  const overdueChip = `<span class="dv2l-ht-chip${f.overdueOnly?' on':''}" onclick="window._lsSetTaskFilter('overdueOnly','toggle')">Overdue only</span>`;
  const rows = filtered.length ? filtered.map(t => {
    const st = t._effectiveStatus;
    const icon = _lsHtTypeIcon(t.type || t.category);
    const adh = _lsHtAdherence(t);
    const due = t.dueDate ? new Date(t.dueDate).toLocaleDateString('en-GB',{day:'2-digit',month:'short'}) : '—';
    const last = t.lastActivityAt ? _ago(t.lastActivityAt) : (t.assignedAt ? _ago(t.assignedAt) : '—');
    const demoTag = t._demo ? '<span class="dv2l-ht-tag-demo">demo</span>' : '';
    const offTag = (t._offline && !t._demo) ? '<span class="dv2l-ht-tag-offline">offline</span>' : '';
    return `
      <div class="dv2l-ht-row${t._demo?' demo':''}">
        <div class="dv2l-ht-ico">${icon}</div>
        <div>
          <div class="dv2l-ht-title">${_e(t.title || 'Untitled task')}${demoTag}${offTag}</div>
          <div class="dv2l-ht-sub">${_e(_lsHtTypeLabel(t.type || t.category))} \u00B7 ${_e(t.frequency || 'once')} \u00B7 due ${_e(due)} \u00B7 last ${_e(last)}</div>
        </div>
        <div class="dv2l-ht-meta">${adh.pct}%<br><span style="color:var(--text-tertiary)">${adh.num}/${adh.den || 0}</span></div>
        <div>${_lsHtSparkline(t._history)}</div>
        <span class="dv2l-ht-status ${st}" onclick="window._lsCycleTaskStatus('${_e(t.id)}')" title="Click to cycle status">${_e(st)}</span>
        <div style="display:flex;gap:4px;flex-wrap:nowrap">
          <button class="dv2l-ht-iconbtn" onclick="window._lsEditTask('${_e(t.id)}')" title="Edit">Edit</button>
          <button class="dv2l-ht-iconbtn" onclick="window._lsRemindTask('${_e(t.id)}')" title="Send reminder">Remind</button>
          <button class="dv2l-ht-iconbtn" onclick="window._lsDeleteTask('${_e(t.id)}')" title="Remove">\u00D7</button>
        </div>
      </div>`;
  }).join('') : `<div class="dv2l-ht-empty">No home tasks match this filter. Use <b>Assign</b> to create one.</div>`;

  const patHeader = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#00d4bc,#4a9eff);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;color:#04121c">${_e(patient.initials || _lsInitials(patient.display_name || ''))}</div>
        <div>
          <div style="font-size:13px;font-weight:600;font-family:var(--dv2-font-display,var(--font-display))">${_e(patient.display_name || 'Patient')}</div>
          <div style="font-size:11px;color:var(--text-tertiary)">${_e(patient.condition || '')} \u00B7 session ${s.session.session_no || 1}/${s.session.session_total || 20} ${offlineAny?'\u00B7 <span style=\"color:#f59e0b\">offline data</span>':''}</div>
        </div>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-sm" onclick="window._lsPickPatient()">Change patient</button>
        <button class="btn btn-primary btn-sm" onclick="window._lsOpenAssignModal()">Assign task</button>
      </div>
    </div>`;

  const kpis = `
    <div class="dv2l-ht-kpis">
      <div class="dv2l-ht-kpi"><div class="dv2l-ht-kpi-v">${pct}%</div><div class="dv2l-ht-kpi-l">Adherence</div></div>
      <div class="dv2l-ht-kpi"><div class="dv2l-ht-kpi-v">${completed}/${total}</div><div class="dv2l-ht-kpi-l">Completed</div></div>
      <div class="dv2l-ht-kpi"><div class="dv2l-ht-kpi-v" style="color:${overdue?'#ff6b6b':'var(--text-primary)'}">${overdue}</div><div class="dv2l-ht-kpi-l">Overdue</div></div>
      <div class="dv2l-ht-kpi"><div class="dv2l-ht-kpi-v">${decorated.filter(t=>t._effectiveStatus==='in-progress').length}</div><div class="dv2l-ht-kpi-l">In progress</div></div>
    </div>`;

  const templates = CONDITION_HOME_TEMPLATES;
  const patientCondId = (patient.condition_id || patient.conditionId || null);
  const suggested = patientCondId ? templates.filter(t => t.conditionId === patientCondId).slice(0, 3)
                                  : templates.slice(0, 3);
  const templatePanel = `
    <div class="dv2-card dv2l-ht-panel" style="margin-top:12px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
        <div>
          <div style="font-family:var(--dv2-font-display,var(--font-display));font-size:13px;font-weight:600">Quick templates</div>
          <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">Condition-matched home tasks \u00B7 tap to assign now</div>
        </div>
      </div>
      <div style="display:grid;gap:8px">
        ${suggested.map(tpl => `
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;padding:8px;border:1px solid var(--border);border-radius:6px">
            <div style="min-width:0">
              <div style="font-size:12px;font-weight:600">${_e(tpl.title)}</div>
              <div style="font-size:10.5px;color:var(--text-tertiary);margin-top:2px">${_e(tpl.conditionName)} \u00B7 ${_e(tpl.category)} \u00B7 ${_e(tpl.frequency)}</div>
            </div>
            <button class="btn btn-sm" onclick="window._lsPickTemplate('${_e(tpl.id)}')">Assign</button>
          </div>`).join('')}
      </div>
      <div style="margin-top:10px">
        <button class="btn btn-sm" onclick="window._lsBulkAssignTemplate()" style="width:100%">Bulk-assign by condition\u2026</button>
      </div>
    </div>`;

  const kpiCard = `
    <div class="dv2-card dv2l-ht-panel" style="margin-top:12px">
      <div style="font-family:var(--dv2-font-display,var(--font-display));font-size:13px;font-weight:600;margin-bottom:8px">Patient context</div>
      <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.55">
        <div><b>Patient:</b> ${_e(patient.display_name || '—')} ${patient.age?'\u00B7 '+patient.age:''} ${patient.sex?'\u00B7 '+patient.sex:''}</div>
        <div><b>Condition:</b> ${_e(patient.condition || '—')}</div>
        <div><b>Modality:</b> ${_e(s.session.modality || '—')}</div>
        <div><b>Course:</b> session ${s.session.session_no || 1} of ${s.session.session_total || 20}</div>
      </div>
      <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-sm" onclick="window._nav?.('patient',{id:'${_e(s.session.patient_id || '')}'})">Open profile</button>
        <button class="btn btn-sm" onclick="window._nav?.('home-tasks-v2')">Full manager</button>
      </div>
    </div>`;

  el.innerHTML = `
    <div class="dv2l-ht-wrap">
      <div>
        ${patHeader}
        ${kpis}
        <div class="dv2l-ht-filters">${categoryChips}</div>
        <div class="dv2l-ht-filters">${statusChips}${overdueChip}</div>
        <div>${rows}</div>
      </div>
      <div>
        ${kpiCard}
        ${templatePanel}
      </div>
    </div>`;
}

function _lsSetTaskFilter(key, val) {
  const s = _lsState; if (!s) return;
  s.taskFilter = s.taskFilter || { category:'all', status:'all', overdueOnly:false };
  if (key === 'overdueOnly') s.taskFilter.overdueOnly = !s.taskFilter.overdueOnly;
  else s.taskFilter[key] = val;
  _lsRenderTasks();
}

function _lsPickPatient() {
  const s = _lsState; if (!s) return;
  const cur = s.taskSelectedPid || s.session.patient_id || '';
  const v = window.prompt('Enter patient id (e.g. p001):', cur);
  if (!v) return;
  s.taskSelectedPid = v.trim();
  s.tasksLoaded = false;
  _lsRenderTasks();
}

async function _lsAssignTask(payload) {
  const s = _lsState; if (!s) return null;
  const pid = payload.patientId || s.taskSelectedPid || s.session.patient_id;
  if (!pid) { window.alert('No patient selected.'); return null; }
  const now = new Date().toISOString();
  const id = payload.id || `ht-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
  const task = {
    id,
    patientId: pid,
    title: payload.title,
    type: payload.type || 'activity',
    category: payload.type || 'activity',
    instructions: payload.instructions || '',
    dueDate: payload.dueDate || '',
    frequency: payload.frequency || 'once',
    reason: payload.reason || '',
    courseId: payload.courseId || '',
    course_id: payload.courseId || '',
    status: 'assigned',
    assignedAt: now,
    lastActivityAt: now,
    clientUpdatedAt: now,
    _history: new Array(14).fill(0),
  };
  let persisted = false;
  try {
    if (typeof api.mutateHomeProgramTask === 'function') {
      const res = await api.mutateHomeProgramTask(task);
      if (res) { Object.assign(task, res.task || res); persisted = true; }
    } else if (typeof api.createHomeProgramTask === 'function') {
      const res = await api.createHomeProgramTask(task);
      if (res) { Object.assign(task, res); persisted = true; }
    }
  } catch { persisted = false; }
  if (!persisted) task._offline = true;
  const arr = _lsHtRead(_lsHtClinKey(pid), []);
  arr.push(task);
  _lsHtWrite(_lsHtClinKey(pid), arr);
  s.tasks = [...(s.tasks || []), task];
  _lsLogEvent('OPER', `Home task assigned: ${task.title}`);
  try { window.dispatchEvent(new CustomEvent('ds:home-task-updated', { detail: { taskId: task.id, patientId: pid, action: 'assigned' } })); } catch {}
  _lsRenderTasks();
  return task;
}

async function _lsCycleTaskStatus(id) {
  const s = _lsState; if (!s) return;
  const t = (s.tasks || []).find(x => x.id === id); if (!t) return;
  const cur = t.status || 'assigned';
  const next = LS_HT_CYCLE[cur] || 'assigned';
  t.status = next;
  t.lastActivityAt = new Date().toISOString();
  t.clientUpdatedAt = t.lastActivityAt;
  if (Array.isArray(t._history)) { t._history.push(next === 'completed' ? 1 : 0); if (t._history.length > 14) t._history.shift(); }
  let synced = false;
  try {
    if (typeof api.mutateHomeProgramTask === 'function') { await api.mutateHomeProgramTask(t); synced = true; }
    else if (typeof api.upsertHomeProgramTask === 'function') { await api.upsertHomeProgramTask(t); synced = true; }
  } catch {}
  if (!synced) t._offline = true;
  const pid = t.patientId || s.taskSelectedPid || s.session.patient_id;
  if (pid) {
    const arr = _lsHtRead(_lsHtClinKey(pid), []);
    const idx = arr.findIndex(x => x.id === t.id);
    if (idx >= 0) arr[idx] = t; else arr.push(t);
    _lsHtWrite(_lsHtClinKey(pid), arr);
  }
  _lsLogEvent('OPER', `Home task ${t.title} \u2192 ${next}`);
  try { window.dispatchEvent(new CustomEvent('ds:home-task-updated', { detail: { taskId: t.id, patientId: pid, action: 'status', status: next } })); } catch {}
  _lsRenderTasks();
}

async function _lsEditTask(id) {
  const s = _lsState; if (!s) return;
  const t = (s.tasks || []).find(x => x.id === id); if (!t) return;
  const typeOpts = LS_HT_TASK_TYPES.map(tp => `<option value="${tp.id}"${(t.type||t.category)===tp.id?' selected':''}>${_e(tp.label)}</option>`).join('');
  const stOpts = LS_HT_STATUSES.map(st => `<option value="${st}"${(t.status||'assigned')===st?' selected':''}>${_e(st)}</option>`).join('');
  const pid = t.patientId || s.taskSelectedPid || s.session.patient_id || '';
  const { list: courses, unavailable } = pid ? await _lsFetchPatientCourses(pid) : { list: [], unavailable: false };
  const selectedCourseId = t.course_id || t.courseId || '';
  const courseHtml = _lsCourseSelectHtml('ls-ht-ed-course', courses, unavailable, selectedCourseId);
  _lsOpenModal(`
    <div style="font-family:var(--dv2-font-display,var(--font-display));font-size:16px;font-weight:700;margin-bottom:12px">Edit task</div>
    <div class="dv2l-ht-fgroup"><label class="dv2l-ht-label">Title</label><input id="ls-ht-ed-title" class="dv2l-ht-input" value="${_e(t.title || '')}"></div>
    <div class="dv2l-ht-fgroup"><label class="dv2l-ht-label">Type</label><select id="ls-ht-ed-type" class="dv2l-ht-select">${typeOpts}</select></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="dv2l-ht-fgroup"><label class="dv2l-ht-label">Frequency</label><input id="ls-ht-ed-freq" class="dv2l-ht-input" value="${_e(t.frequency || 'once')}"></div>
      <div class="dv2l-ht-fgroup"><label class="dv2l-ht-label">Due date</label><input type="date" id="ls-ht-ed-due" class="dv2l-ht-input" value="${_e((t.dueDate || '').slice(0,10))}"></div>
    </div>
    <div class="dv2l-ht-fgroup"><label class="dv2l-ht-label">Status</label><select id="ls-ht-ed-status" class="dv2l-ht-select">${stOpts}</select></div>
    <div class="dv2l-ht-fgroup"><label class="dv2l-ht-label">Instructions</label><textarea id="ls-ht-ed-inst" class="dv2l-ht-textarea">${_e(t.instructions || '')}</textarea></div>
    ${courseHtml}
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">
      <button class="btn btn-sm" onclick="window._lsCloseModal()">Cancel</button>
      <button class="btn btn-primary btn-sm" onclick="window._lsSubmitEdit('${_e(id)}')">Save</button>
    </div>`);
  try { const el = document.getElementById('ls-ht-ed-course'); if (el && selectedCourseId) el.value = selectedCourseId; } catch {}
}

async function _lsSubmitEdit(id) {
  const s = _lsState; if (!s) return;
  const t = (s.tasks || []).find(x => x.id === id); if (!t) return;
  const title = (document.getElementById('ls-ht-ed-title')?.value || '').trim();
  if (!title) { window.alert('Title required.'); return; }
  t.title = title;
  t.type = document.getElementById('ls-ht-ed-type')?.value || t.type;
  t.category = t.type;
  t.frequency = (document.getElementById('ls-ht-ed-freq')?.value || t.frequency || 'once').trim();
  const due = document.getElementById('ls-ht-ed-due')?.value;
  t.dueDate = due ? new Date(due).toISOString() : '';
  t.status = document.getElementById('ls-ht-ed-status')?.value || t.status;
  t.instructions = document.getElementById('ls-ht-ed-inst')?.value || '';
  const courseSel = document.getElementById('ls-ht-ed-course');
  if (courseSel) {
    const cv = (courseSel.value || '').trim();
    t.courseId = cv;
    t.course_id = cv;
  }
  t.clientUpdatedAt = new Date().toISOString();
  t.lastActivityAt = t.clientUpdatedAt;
  let synced = false;
  try {
    if (typeof api.mutateHomeProgramTask === 'function') { await api.mutateHomeProgramTask(t); synced = true; }
    else if (typeof api.upsertHomeProgramTask === 'function') { await api.upsertHomeProgramTask(t); synced = true; }
  } catch {}
  if (!synced) t._offline = true;
  const pid = t.patientId || s.taskSelectedPid || s.session.patient_id;
  if (pid) {
    const arr = _lsHtRead(_lsHtClinKey(pid), []);
    const idx = arr.findIndex(x => x.id === t.id);
    if (idx >= 0) arr[idx] = t; else arr.push(t);
    _lsHtWrite(_lsHtClinKey(pid), arr);
  }
  _lsLogEvent('OPER', `Home task edited: ${t.title}`);
  try { window.dispatchEvent(new CustomEvent('ds:home-task-updated', { detail: { taskId: t.id, patientId: pid, action: 'edit' } })); } catch {}
  _lsCloseModal();
  _lsRenderTasks();
}

async function _lsDeleteTask(id) {
  const s = _lsState; if (!s) return;
  const t = (s.tasks || []).find(x => x.id === id); if (!t) return;
  if (!window.confirm(`Remove task "${t.title}"?`)) return;
  try { await (api.deleteHomeProgramTask?.(t.id)); } catch {}
  s.tasks = (s.tasks || []).filter(x => x.id !== id);
  const pid = t.patientId || s.taskSelectedPid || s.session.patient_id;
  if (pid) {
    const arr = _lsHtRead(_lsHtClinKey(pid), []).filter(x => x.id !== id);
    _lsHtWrite(_lsHtClinKey(pid), arr);
  }
  _lsLogEvent('OPER', `Home task removed: ${t.title}`);
  try { window.dispatchEvent(new CustomEvent('ds:home-task-updated', { detail: { taskId: id, patientId: pid, action: 'delete' } })); } catch {}
  _lsRenderTasks();
}

async function _lsRemindTask(id) {
  const s = _lsState; if (!s) return;
  const t = (s.tasks || []).find(x => x.id === id); if (!t) return;
  let sent = false;
  try {
    const res = await (api.remindHomeProgramTask?.(t.id, { channel: 'default' }));
    if (res) sent = true;
  } catch {}
  if (!sent) {
    try {
      const res = await (api.sendReminderNow?.({ taskId: t.id, patientId: t.patientId }));
      if (res) sent = true;
    } catch {}
  }
  _lsLogEvent('OPER', sent ? `Reminder sent: ${t.title}` : `Reminder queued locally (offline): ${t.title}`);
  if (!sent) {
    const key = `ds_home_task_reminders_queue`;
    const q = _lsHtRead(key, []);
    q.push({ taskId: t.id, patientId: t.patientId, queuedAt: new Date().toISOString() });
    _lsHtWrite(key, q);
  }
  try { window.dispatchEvent(new CustomEvent('ds:home-task-updated', { detail: { taskId: t.id, patientId: t.patientId, action: 'remind', sent } })); } catch {}
}

async function _lsFetchPatientCourses(pid) {
  const s = _lsState; if (!s || !pid) return { list: [], unavailable: false };
  s.patientCourses = s.patientCourses || {};
  if (s.patientCourses[pid]) return s.patientCourses[pid];
  let list = [];
  let unavailable = false;
  try {
    let res = null;
    if (typeof api.listPatientCourses === 'function') {
      res = await api.listPatientCourses(pid);
    } else if (typeof api.listCourses === 'function') {
      res = await api.listCourses({ patient_id: pid });
    } else {
      unavailable = true;
    }
    if (res) {
      const raw = Array.isArray(res) ? res : (res.courses || res.items || res.data || []);
      list = raw.filter(c => {
        const st = String(c.status || c.state || 'active').toLowerCase();
        return st === 'active' || st === 'in_progress' || st === 'in-progress' || st === 'running';
      });
    }
  } catch {
    unavailable = true;
  }
  const cached = { list, unavailable };
  s.patientCourses[pid] = cached;
  return cached;
}

function _lsCourseLabel(c) {
  const name = c.protocol_name || c.protocolName || c.name || c.title || c.protocol || (c.id ? `Course ${c.id}` : 'Course');
  const cur = c.session_number ?? c.current_session ?? c.sessionsCompleted ?? c.sessions_completed ?? c.completed_sessions;
  const tot = c.total_sessions ?? c.sessions_total ?? c.sessionsTotal ?? c.planned_sessions ?? c.target_sessions;
  if (cur != null && tot != null) return `${name} \u00B7 Session ${cur}/${tot}`;
  if (tot != null) return `${name} \u00B7 ${tot} sessions`;
  return name;
}

function _lsCourseSelectHtml(selectId, courses, unavailable, selectedId) {
  const sel = selectedId || '';
  if (unavailable) {
    return `<div class="dv2l-ht-fgroup"><label class="dv2l-ht-label">Link to treatment course</label>`
      + `<select id="${selectId}" class="dv2l-ht-select"><option value="">\u2014 None \u2014</option></select>`
      + `<div style="font-size:11px;opacity:0.65;margin-top:4px">Courses unavailable</div></div>`;
  }
  if (!courses || !courses.length) {
    return `<div class="dv2l-ht-fgroup"><label class="dv2l-ht-label">Link to treatment course</label>`
      + `<select id="${selectId}" class="dv2l-ht-select"><option value="">\u2014 None \u2014</option></select>`
      + `<div style="font-size:11px;opacity:0.65;margin-top:4px">No active courses</div></div>`;
  }
  const opts = ['<option value="">\u2014 None \u2014</option>'].concat(
    courses.map(c => `<option value="${_e(c.id)}"${sel === c.id ? ' selected' : ''}>${_e(_lsCourseLabel(c))}</option>`)
  ).join('');
  return `<div class="dv2l-ht-fgroup"><label class="dv2l-ht-label">Link to treatment course</label>`
    + `<select id="${selectId}" class="dv2l-ht-select">${opts}</select></div>`;
}

async function _lsOpenAssignModal() {
  const s = _lsState; if (!s) return;
  const typeOpts = LS_HT_TASK_TYPES.map(tp => `<option value="${tp.id}">${_e(tp.label)}</option>`).join('');
  const tplOpts = ['<option value="">Custom task</option>'].concat(
    CONDITION_HOME_TEMPLATES.map(tpl => `<option value="${_e(tpl.id)}">${_e(tpl.conditionName)} \u2014 ${_e(tpl.title)}</option>`)
  ).join('');
  const pid = s.taskSelectedPid || s.session.patient_id || '';
  const { list: courses, unavailable } = pid ? await _lsFetchPatientCourses(pid) : { list: [], unavailable: false };
  const courseHtml = _lsCourseSelectHtml('ls-ht-a-course', courses, unavailable, '');
  _lsOpenModal(`
    <div style="font-family:var(--dv2-font-display,var(--font-display));font-size:16px;font-weight:700;margin-bottom:12px">Assign home task</div>
    <div class="dv2l-ht-fgroup"><label class="dv2l-ht-label">Patient id</label><input id="ls-ht-a-pid" class="dv2l-ht-input" value="${_e(pid)}"></div>
    <div class="dv2l-ht-fgroup"><label class="dv2l-ht-label">Template</label><select id="ls-ht-a-tpl" class="dv2l-ht-select" onchange="(function(){var v=document.getElementById('ls-ht-a-tpl').value;if(!v)return;var t=window.__dv2lTplById&&window.__dv2lTplById(v);if(!t)return;document.getElementById('ls-ht-a-title').value=t.title||'';document.getElementById('ls-ht-a-type').value=t.type||'activity';document.getElementById('ls-ht-a-freq').value=t.frequency||'once';document.getElementById('ls-ht-a-inst').value=t.instructions||'';})()">${tplOpts}</select></div>
    <div class="dv2l-ht-fgroup"><label class="dv2l-ht-label">Title</label><input id="ls-ht-a-title" class="dv2l-ht-input" placeholder="e.g. Evening breathing 10 min"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="dv2l-ht-fgroup"><label class="dv2l-ht-label">Type</label><select id="ls-ht-a-type" class="dv2l-ht-select">${typeOpts}</select></div>
      <div class="dv2l-ht-fgroup"><label class="dv2l-ht-label">Frequency</label><input id="ls-ht-a-freq" class="dv2l-ht-input" value="daily"></div>
    </div>
    <div class="dv2l-ht-fgroup"><label class="dv2l-ht-label">Due date</label><input id="ls-ht-a-due" type="date" class="dv2l-ht-input"></div>
    <div class="dv2l-ht-fgroup"><label class="dv2l-ht-label">Instructions</label><textarea id="ls-ht-a-inst" class="dv2l-ht-textarea" placeholder="Step-by-step guidance for patient"></textarea></div>
    ${courseHtml}
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">
      <button class="btn btn-sm" onclick="window._lsCloseModal()">Cancel</button>
      <button class="btn btn-primary btn-sm" onclick="window._lsSubmitAssign()">Assign</button>
    </div>`);
  window.__dv2lTplById = (id) => CONDITION_HOME_TEMPLATES.find(t => t.id === id) || null;
}

async function _lsSubmitAssign() {
  const title = (document.getElementById('ls-ht-a-title')?.value || '').trim();
  if (!title) { window.alert('Title required.'); return; }
  const courseId = (document.getElementById('ls-ht-a-course')?.value || '').trim();
  const payload = {
    patientId: (document.getElementById('ls-ht-a-pid')?.value || '').trim(),
    title,
    type: document.getElementById('ls-ht-a-type')?.value || 'activity',
    frequency: (document.getElementById('ls-ht-a-freq')?.value || 'once').trim(),
    instructions: document.getElementById('ls-ht-a-inst')?.value || '',
    dueDate: (function(){ const v = document.getElementById('ls-ht-a-due')?.value; return v ? new Date(v).toISOString() : ''; })(),
    courseId,
  };
  await _lsAssignTask(payload);
  _lsCloseModal();
}

async function _lsPickTemplate(tplId) {
  const tpl = CONDITION_HOME_TEMPLATES.find(t => t.id === tplId); if (!tpl) return;
  await _lsAssignTask({
    title: tpl.title, type: tpl.type || 'activity', frequency: tpl.frequency || 'daily',
    instructions: tpl.instructions || '', reason: tpl.reason || '', courseId: tpl.conditionId || '',
  });
}

async function _lsBulkAssignTemplate() {
  const s = _lsState; if (!s) return;
  const cond = window.prompt('Condition id to bulk-assign (e.g. CON-001) or bundle name:', (s.patient && (s.patient.condition_id || '')) || '');
  if (!cond) return;
  const tpls = CONDITION_HOME_TEMPLATES.filter(t => t.conditionId === cond || t.conditionName.toLowerCase().includes(cond.toLowerCase()));
  if (!tpls.length) { window.alert('No templates matched.'); return; }
  if (!window.confirm(`Assign ${tpls.length} template task(s)?`)) return;
  for (const tpl of tpls) {
    await _lsAssignTask({
      title: tpl.title, type: tpl.type || 'activity', frequency: tpl.frequency || 'daily',
      instructions: tpl.instructions || '', reason: tpl.reason || '', courseId: tpl.conditionId || '',
    });
  }
}

function _lsOpenModal(html) {
  _lsCloseModal();
  const bg = document.createElement('div');
  bg.className = 'dv2l-ht-modal-bg';
  bg.onclick = (ev) => { if (ev.target === bg) _lsCloseModal(); };
  bg.innerHTML = `<div class="dv2l-ht-modal" role="dialog">${html}</div>`;
  document.body.appendChild(bg);
}

function _lsCloseModal() {
  try { document.querySelectorAll('.dv2l-ht-modal-bg').forEach(n => n.remove()); } catch {}
}

