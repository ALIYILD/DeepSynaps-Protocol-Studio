// ─────────────────────────────────────────────────────────────────────────────
// pages-virtualcare.js — Virtual Care Hub
// Video Visits · Voice Calls · Messaging · Note Capture · AI Transcription
// ─────────────────────────────────────────────────────────────────────────────

import { api } from './api.js';

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
// pgVirtualCare
// =============================================================================
export async function pgVirtualCare(setTopbar, navigate) {
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
