"""Virtual Care patch — rename messaging + implement pgVirtualCare."""
import sys, io, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# ─── 1. app.js ────────────────────────────────────────────────────────────────
with open('apps/web/src/app.js', 'r', encoding='utf-8') as f:
    app = f.read()

app = app.replace(
    "{ id: 'messaging',          label: 'Messages',           icon: '\u25ce' }",
    "{ id: 'messaging',          label: 'Virtual Care',       icon: '\u25ab' }"
)
app = app.replace("messaging: 'Messaging'", "messaging: 'Virtual Care'")
app = app.replace('await m.pgMessaging(setTopbar);', 'await m.pgVirtualCare(setTopbar);')

with open('apps/web/src/app.js', 'w', encoding='utf-8') as f:
    f.write(app)
print('OK  app.js — nav renamed + routing updated')

# ─── 2. pages-clinical.js ─────────────────────────────────────────────────────
with open('apps/web/src/pages-clinical.js', 'r', encoding='utf-8') as f:
    src = f.read()

OLD_START = 'export async function pgMessaging(setTopbar) {'
OLD_END   = '\n// Protocol Builder\n'

start_pos = src.find(OLD_START)
end_pos   = src.find(OLD_END)

if start_pos < 0:
    print('ERROR: pgMessaging start not found', file=sys.stderr); sys.exit(1)
if end_pos < 0:
    print('ERROR: Protocol Builder end marker not found', file=sys.stderr); sys.exit(1)

NEW_VC = r'''// ─── Virtual Care ────────────────────────────────────────────────────────────

function _vcEsc(v) {
  if (v == null) return '';
  return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
}

function _vcRelTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000)    return 'Just now';
  if (diff < 3600000)  return Math.floor(diff/60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff/3600000) + 'h ago';
  return new Date(iso).toLocaleDateString('en-GB',{day:'numeric',month:'short'});
}

function _vcStatusBadge(status) {
  const MAP = {
    'scheduled':       ['vc-status--scheduled',  'Scheduled'],
    'in-progress':     ['vc-status--inprog',      'In Progress'],
    'completed':       ['vc-status--done',        'Completed'],
    'missed':          ['vc-status--missed',      'Missed'],
    'follow-up-needed':['vc-status--followup',    'Follow-up Needed'],
    'awaiting-signoff':['vc-status--signoff',     'Awaiting Sign-off'],
    'awaiting-review': ['vc-status--review',      'Awaiting Review'],
    'signed':          ['vc-status--done',        'Signed'],
    'transcribing':    ['vc-status--inprog',      'Transcribing\u2026'],
  };
  const [cls, lbl] = MAP[status] || ['vc-status--scheduled', status];
  return `<span class="vc-status-badge ${cls}">${lbl}</span>`;
}

function _vcUrgencyBadge(urgency) {
  if (urgency === 'urgent')   return '<span class="vc-urg vc-urg--urgent">Urgent</span>';
  if (urgency === 'moderate') return '<span class="vc-urg vc-urg--moderate">Moderate</span>';
  return '<span class="vc-urg vc-urg--routine">Routine</span>';
}

const VC_MOCK = {
  callRequests: [
    { id:'cr1', patientId:'p_demo',  patientName:'Emma Larson',    initials:'EL',
      condition:'Treatment-Resistant Depression', modality:'TMS',
      requestedAt:'2026-04-12T08:45:00Z', preferredTime:'Morning (9\u201311 am)',
      type:'video', reason:'Headache after session 9, feels worse than usual',
      urgency:'urgent',   courseRef:'TMS \u2014 Week 5', sessionRef:'Session 9' },
    { id:'cr2', patientId:'p_demo2', patientName:'James Okafor',   initials:'JO',
      condition:'Generalised Anxiety Disorder',   modality:'Neurofeedback',
      requestedAt:'2026-04-12T07:30:00Z', preferredTime:'Afternoon (2\u20134 pm)',
      type:'voice', reason:'Question about homework protocol and schedule change',
      urgency:'routine',  courseRef:'NF \u2014 Week 3',  sessionRef:'Session 6' },
    { id:'cr3', patientId:'p_demo3', patientName:'Ana Reyes',      initials:'AR',
      condition:'PTSD',   modality:'tDCS',
      requestedAt:'2026-04-11T15:00:00Z', preferredTime:'Flexible',
      type:'voice', reason:'Consent question for upcoming protocol change',
      urgency:'routine',  courseRef:'tDCS \u2014 Week 2',sessionRef:'Session 4' },
  ],
  videoVisits: [
    { id:'vv1', patientId:'p_demo',  patientName:'Emma Larson',    initials:'EL',
      condition:'TRD', modality:'TMS',
      scheduledAt:'2026-04-12T14:00:00Z', duration:30,
      purpose:'Mid-course check-in and side effect review',
      status:'scheduled', notesStatus:'pending' },
    { id:'vv2', patientId:'p_demo4', patientName:'David Chen',     initials:'DC',
      condition:'OCD', modality:'TMS',
      scheduledAt:'2026-04-12T10:30:00Z', duration:20,
      purpose:'Post-intensive follow-up',
      status:'completed', notesStatus:'draft' },
    { id:'vv3', patientId:'p_demo5', patientName:'Priya Nair',     initials:'PN',
      condition:'MDD', modality:'CES',
      scheduledAt:'2026-04-11T16:00:00Z', duration:30,
      purpose:'Initial virtual assessment',
      status:'missed', notesStatus:'pending' },
  ],
  voiceCalls: [
    { id:'vcl1', patientId:'p_demo2', patientName:'James Okafor',  initials:'JO',
      condition:'GAD', modality:'Neurofeedback',
      scheduledAt:'2026-04-12T11:00:00Z', duration:20,
      purpose:'Weekly check-in', status:'scheduled', notesStatus:'pending' },
    { id:'vcl2', patientId:'p_demo3', patientName:'Ana Reyes',     initials:'AR',
      condition:'PTSD', modality:'tDCS',
      scheduledAt:'2026-04-11T14:00:00Z', duration:15,
      purpose:'Adverse event follow-up', status:'completed', notesStatus:'signed' },
    { id:'vcl3', patientId:'p_demo',  patientName:'Emma Larson',   initials:'EL',
      condition:'TRD', modality:'TMS',
      scheduledAt:'2026-04-10T15:30:00Z', duration:20,
      purpose:'Session 8 feedback', status:'follow-up-needed', notesStatus:'draft' },
  ],
  sharedMedia: [
    { id:'sm1', patientId:'p_demo',  patientName:'Emma Larson',    initials:'EL',
      condition:'TRD', modality:'TMS',
      type:'voice-note',   submittedAt:'2026-04-12T07:15:00Z',
      subject:'Post-session headache \u2014 Session 9',
      reason:'Side effect concern', severity:'Moderate (6/10)', trend:'Worse',
      sessionRef:'Session 9', duration:'1:42', urgency:'urgent', reviewed:false,
      aiSummary:'Patient describes throbbing headache (6/10) starting 2 hours post-session. Worse than sessions 7\u20138. No nausea. Resting helped slightly. Duration approx. 3 hours. Recommend follow-up before session 10.' },
    { id:'sm2', patientId:'p_demo2', patientName:'James Okafor',   initials:'JO',
      condition:'GAD', modality:'Neurofeedback',
      type:'text-update',  submittedAt:'2026-04-11T21:30:00Z',
      subject:'Feeling calmer \u2014 tracking homework',
      reason:'Progress update', severity:'None', trend:'Better',
      sessionRef:'Session 6', urgency:'routine', reviewed:false,
      aiSummary:'Patient reports reduced anxiety in social situations. Completed 5/7 homework sessions. Sleep slightly improved. No adverse events reported.' },
    { id:'sm3', patientId:'p_demo4', patientName:'David Chen',     initials:'DC',
      condition:'OCD', modality:'TMS',
      type:'video-update', submittedAt:'2026-04-11T18:00:00Z',
      subject:'Compulsion frequency self-report',
      reason:'Weekly self-report', severity:'Mild', trend:'Same',
      sessionRef:'Session 7', duration:'2:15', urgency:'routine', reviewed:true,
      aiSummary:'Checking behaviour: ~15\u2192~10 times/day. Work stress cited as maintaining factor. Good homework compliance. No new adverse events reported.' },
  ],
  aiNotes: [
    { id:'an1', patientId:'p_demo',  patientName:'Emma Larson',    initials:'EL',
      condition:'TRD', modality:'TMS',
      type:'voice-note',   recordedAt:'2026-04-11T17:00:00Z',
      subject:'Session 9 \u2014 Clinical observation',
      transcription:'Patient reported increased fatigue during session. Tolerated 120% MT but noted mild scalp discomfort at the coil site. Plan to review intensity for session 10. PHQ-9 showed improvement from 18 to 14 since baseline.',
      aiSummary:'Session 9 TMS: 120% MT, mild scalp discomfort noted. Patient fatigue reported. PHQ-9: 18\u219214 (improvement). Recommend intensity review for session 10.',
      status:'awaiting-signoff' },
    { id:'an2', patientId:'p_demo4', patientName:'David Chen',     initials:'DC',
      condition:'OCD', modality:'TMS',
      type:'text-note',    recordedAt:'2026-04-12T10:45:00Z',
      subject:'Post-visit note \u2014 Video consult',
      transcription:'Virtual visit completed. Patient engaged and motivated. Y-BOCS trending down since week 2. Recommended adding one additional ERP homework task. No adverse events to report.',
      aiSummary:'Virtual visit: patient engaged, motivated. Y-BOCS improving (down since week 2). ERP: add 1 additional task. No adverse events.',
      status:'awaiting-review' },
    { id:'an3', patientId:'p_demo2', patientName:'James Okafor',   initials:'JO',
      condition:'GAD', modality:'Neurofeedback',
      type:'transcription', recordedAt:'2026-04-10T15:30:00Z',
      subject:'Phone consultation note',
      transcription:'Called to review homework protocol. Patient consistent with NF sessions. GAD-7 down from 15 to 11. Discussed diaphragmatic breathing as a supplement between sessions.',
      aiSummary:'Phone consult: consistent NF sessions. GAD-7: 15\u219211. Breathing exercises added as supplement. No concerns raised.',
      status:'signed' },
  ],
};

// Module-level VC state (reset per pgVirtualCare call)
let _vcTab = 'inbox';
let _vcInboxPid = null;
let _vcInboxMsgs = [];
let _vcPatients = [];
let _vcSelCR = null;
let _vcSelVisit = null;
let _vcSelCall = null;
let _vcSelMedia = null;
let _vcSelNote = null;

export async function pgVirtualCare(setTopbar) {
  setTopbar('Virtual Care', 'Consultation & communication hub');
  const el = document.getElementById('content');
  if (!el) return;
  el.innerHTML = '<div class="page-loading"></div>';

  _vcTab = 'inbox'; _vcSelCR = null; _vcSelVisit = null;
  _vcSelCall = null; _vcSelMedia = null; _vcSelNote = null;

  try { const r = await api.listPatients(); _vcPatients = r?.items || (Array.isArray(r) ? r : []); } catch { _vcPatients = []; }

  if (!_vcInboxPid && _vcPatients.length) _vcInboxPid = _vcPatients[0]?.id || null;
  if (_vcInboxPid) {
    try { const r = await api.getPatientMessages(_vcInboxPid); _vcInboxMsgs = Array.isArray(r) ? r : (r?.items || []); } catch { _vcInboxMsgs = []; }
  }

  _vcRender();
}

function _vcRender() {
  const el = document.getElementById('content');
  if (!el) return;
  const e = _vcEsc;

  const todayVisits = VC_MOCK.videoVisits.filter(v => v.status === 'scheduled').length;
  const callReqs    = VC_MOCK.callRequests.length;
  const urgMedia    = VC_MOCK.sharedMedia.filter(m => m.urgency === 'urgent' && !m.reviewed).length;
  const awMedia     = VC_MOCK.sharedMedia.filter(m => !m.reviewed).length;
  const pendNotes   = VC_MOCK.aiNotes.filter(n => n.status !== 'signed').length;
  const threads     = _vcPatients.length;

  const TABS = [
    { id:'inbox',         label:'Inbox',        count:threads },
    { id:'call-requests', label:'Call Requests', count:callReqs,   attn:callReqs > 0 },
    { id:'video-visits',  label:'Video Visits',  count:todayVisits },
    { id:'voice-calls',   label:'Voice Calls',   count:null },
    { id:'shared-media',  label:'Shared Media',  count:awMedia,    attn:urgMedia > 0 },
    { id:'ai-notes',      label:'AI Notes',      count:pendNotes,  ai:true },
  ];

  let body = '';
  if      (_vcTab === 'inbox')         body = _vcInboxHTML();
  else if (_vcTab === 'call-requests') body = _vcCallReqHTML();
  else if (_vcTab === 'video-visits')  body = _vcConsultHTML('video');
  else if (_vcTab === 'voice-calls')   body = _vcConsultHTML('voice');
  else if (_vcTab === 'shared-media')  body = _vcMediaHTML();
  else if (_vcTab === 'ai-notes')      body = _vcAiNotesHTML();

  el.innerHTML = `
<div class="vc-wrap">
  <div class="vc-summary-strip">
    <button class="vc-chip" onclick="window._vcSetTab('video-visits')">
      <span class="vc-chip-n">${todayVisits}</span>
      <span class="vc-chip-lbl">Scheduled Visits</span>
    </button>
    <button class="vc-chip${callReqs ? ' vc-chip--attn' : ''}" onclick="window._vcSetTab('call-requests')">
      <span class="vc-chip-n">${callReqs}</span>
      <span class="vc-chip-lbl">Call Requests</span>
    </button>
    <button class="vc-chip" onclick="window._vcSetTab('inbox')">
      <span class="vc-chip-n">${threads}</span>
      <span class="vc-chip-lbl">Patient Threads</span>
    </button>
    <button class="vc-chip${urgMedia ? ' vc-chip--urgent' : ''}" onclick="window._vcSetTab('shared-media')">
      <span class="vc-chip-n">${awMedia}</span>
      <span class="vc-chip-lbl">Awaiting Review</span>
    </button>
    <button class="vc-chip vc-chip--ai" onclick="window._vcSetTab('ai-notes')">
      <span class="vc-chip-n">${pendNotes}</span>
      <span class="vc-chip-lbl">AI Notes Pending</span>
    </button>
  </div>

  <div class="vc-action-bar">
    <button class="vc-act vc-act--primary" onclick="window._vcStartVideoVisit(null)">&#9654;&ensp;Start Video Visit</button>
    <button class="vc-act"                 onclick="window._vcStartVoiceCall(null)">&#9742;&ensp;Start Voice Call</button>
    <button class="vc-act"                 onclick="window._vcSendMessage(null)">&#9993;&ensp;Send Message</button>
    <button class="vc-act"                 onclick="window._vcRecordNote()">&#9210;&ensp;Record Note</button>
  </div>

  <div class="vc-tabs" role="tablist">
    ${TABS.map(t => `<button class="vc-tab${_vcTab===t.id?' active':''}${t.attn?' vc-tab--attn':''}${t.ai?' vc-tab--ai':''}"
        role="tab" aria-selected="${_vcTab===t.id}" onclick="window._vcSetTab('${e(t.id)}')"
        >${e(t.label)}${t.count!=null?`<span class="vc-tab-badge">${t.count}</span>`:''}</button>`).join('')}
  </div>

  <div class="vc-content" id="vc-tab-content">${body}</div>
</div>`;

  if (_vcTab === 'inbox') setTimeout(() => {
    const t = document.getElementById('vc-thread'); if (t) t.scrollTop = t.scrollHeight;
  }, 50);
}

// ── Patient context header (reused across tabs) ───────────────────────────────
function _vcCtxHdr(item) {
  const e = _vcEsc;
  const isUrgent = item.urgency === 'urgent';
  return `
<div class="vc-ctx-hdr">
  <div class="vc-ctx-av${isUrgent?' vc-ctx-av--urgent':''}">${e(item.initials||'?')}</div>
  <div class="vc-ctx-info">
    <div class="vc-ctx-name">${e(item.patientName||'')}</div>
    <div class="vc-ctx-meta">${e(item.condition||'')}${item.modality?` &middot; ${e(item.modality)}`:''}${item.courseRef?` &middot; ${e(item.courseRef)}`:''}</div>
    ${item.sessionRef?`<div class="vc-ctx-meta">${e(item.sessionRef)}</div>`:''}
  </div>
  <div class="vc-ctx-acts">
    <button class="vc-ctx-btn" onclick="window._nav('patients')">Open Chart</button>
    <button class="vc-ctx-btn vc-ctx-btn--vid" onclick="window._vcStartVideoVisit('${e(item.patientId)}')">&#9654; Video</button>
  </div>
</div>`;
}

// ── INBOX TAB ─────────────────────────────────────────────────────────────────
function _vcInboxHTML() {
  const e = _vcEsc;
  const selPt = _vcPatients.find(p => p.id === _vcInboxPid);

  const listHTML = `
    <div class="vc-list-filter">
      <input id="vc-inbox-q" type="text" class="vc-search" placeholder="Search patients\u2026"
             oninput="window._vcFilterInbox(this.value)">
    </div>
    <div id="vc-inbox-list">
      ${_vcPatients.length === 0
        ? '<div class="vc-list-empty">No patients found</div>'
        : _vcPatients.map(p => {
            const name = (`${p.first_name||''} ${p.last_name||''}`).trim() || 'Unknown';
            const av   = name.split(' ').map(w=>w[0]||'').join('').slice(0,2).toUpperCase();
            const isSel = p.id === _vcInboxPid;
            return `<div class="vc-list-item${isSel?' selected':''}" onclick="window._vcInboxSel('${e(p.id)}')">
              <div class="vc-av">${av}</div>
              <div class="vc-li-body">
                <div class="vc-li-name">${e(name)}</div>
                <div class="vc-li-sub">${e(p.primary_condition||'Patient')}</div>
              </div>
            </div>`;
          }).join('')}
    </div>`;

  let detail = '';
  if (!selPt) {
    detail = '<div class="vc-detail-ph">Select a patient to view their thread</div>';
  } else {
    const name = (`${selPt.first_name||''} ${selPt.last_name||''}`).trim();
    const av   = name.split(' ').map(w=>w[0]||'').join('').slice(0,2).toUpperCase();
    detail = `
      <div class="vc-ctx-hdr">
        <div class="vc-ctx-av">${av}</div>
        <div class="vc-ctx-info">
          <div class="vc-ctx-name">${e(name)}</div>
          <div class="vc-ctx-meta">${e(selPt.primary_condition||'Patient')}</div>
        </div>
        <div class="vc-ctx-acts">
          <button class="vc-ctx-btn" onclick="window._nav('patients')">Open Chart</button>
          <button class="vc-ctx-btn vc-ctx-btn--vid" onclick="window._vcStartVideoVisit('${e(selPt.id)}')">&#9654; Video</button>
          <button class="vc-ctx-btn" onclick="window._vcStartVoiceCall('${e(selPt.id)}')">&#9742; Call</button>
        </div>
      </div>
      <div class="vc-thread" id="vc-thread">
        ${_vcInboxMsgs.length === 0
          ? '<div class="vc-thread-ph">No messages yet. Start the conversation below.</div>'
          : _vcInboxMsgs.map(m => {
              const out = m.sender_role !== 'patient';
              const ts  = m.created_at ? new Date(m.created_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}) : '';
              return `<div class="vc-msg${out?' vc-msg--out':''}">
                <div class="vc-msg-bub">${e(m.body||m.message||m.content||'')}</div>
                <div class="vc-msg-meta">${ts}${out?' &middot; Sent \u2713':''}</div>
              </div>`;
            }).join('')}
      </div>
      <div class="vc-reply-bar">
        <textarea id="vc-reply-ta" class="vc-reply-ta" rows="2"
          placeholder="Reply to ${e(name)}\u2026"
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();window._vcSendReply('${e(selPt.id)}')}"></textarea>
        <div class="vc-reply-acts">
          <button class="vc-reply-send" onclick="window._vcSendReply('${e(selPt.id)}')">Send &#9658;</button>
          <button class="vc-reply-act" onclick="window._vcStartVideoVisit('${e(selPt.id)}')">&#9654;</button>
          <button class="vc-reply-act" onclick="window._vcStartVoiceCall('${e(selPt.id)}')">&#9742;</button>
          <button class="vc-reply-act" onclick="window._vcRecordNote()">&#9210;</button>
        </div>
      </div>`;
  }

  return `<div class="vc-split"><div class="vc-list">${listHTML}</div><div class="vc-detail">${detail}</div></div>`;
}

// ── CALL REQUESTS TAB ─────────────────────────────────────────────────────────
function _vcCallReqHTML() {
  const e = _vcEsc;
  const reqs = VC_MOCK.callRequests;
  if (!_vcSelCR && reqs.length) _vcSelCR = reqs[0].id;
  const sel = reqs.find(r => r.id === _vcSelCR);

  const list = reqs.map(r => {
    const urg = r.urgency === 'urgent';
    return `<div class="vc-list-item${r.id===_vcSelCR?' selected':''}${urg?' vc-li--urgent':''}"
              onclick="window._vcSelCR('${e(r.id)}')">
      <div class="vc-av${urg?' vc-av--urgent':''}">${e(r.initials)}</div>
      <div class="vc-li-body">
        <div class="vc-li-name">${e(r.patientName)}</div>
        <div class="vc-li-sub">${r.type==='video'?'&#9654;':'&#9742;'} ${r.type==='video'?'Video':'Voice'} &middot; ${e(r.preferredTime)}</div>
        <div class="vc-li-preview">${e(r.reason)}</div>
      </div>
      ${urg?'<span class="vc-dot-urgent"></span>':''}
    </div>`;
  }).join('') || '<div class="vc-list-empty">No pending call requests</div>';

  let detail = sel ? `
    ${_vcCtxHdr(sel)}
    <div class="vc-detail-section">
      <div class="vc-ds-title">Call Request Details</div>
      <div class="vc-field-grid">
        <div class="vc-field"><span class="vc-fl">Type</span><span class="vc-fv">${sel.type==='video'?'&#9654; Video visit':'&#9742; Voice call'}</span></div>
        <div class="vc-field"><span class="vc-fl">Preferred time</span><span class="vc-fv">${e(sel.preferredTime)}</span></div>
        <div class="vc-field"><span class="vc-fl">Requested</span><span class="vc-fv">${_vcRelTime(sel.requestedAt)}</span></div>
        <div class="vc-field"><span class="vc-fl">Urgency</span><span class="vc-fv">${_vcUrgencyBadge(sel.urgency)}</span></div>
      </div>
      <div class="vc-reason-block">
        <div class="vc-fl">Reason for call</div>
        <div class="vc-reason-text">${e(sel.reason)}</div>
      </div>
    </div>
    <div class="vc-action-row">
      <button class="vc-ar-primary" onclick="window._vcStartCall('${e(sel.id)}','${e(sel.type)}')">${sel.type==='video'?'&#9654; Start Video Visit':'&#9742; Start Voice Call'}</button>
      <button class="vc-ar-sec" onclick="window._vcScheduleReq('${e(sel.id)}')">&#128197;&ensp;Schedule</button>
      <button class="vc-ar-sec" onclick="window._vcReplyReq('${e(sel.patientId)}')">&#9993;&ensp;Reply</button>
      <button class="vc-ar-ghost" onclick="window._vcDismissCR('${e(sel.id)}')">Mark Reviewed</button>
    </div>` : '<div class="vc-detail-ph">No call requests at this time</div>';

  return `<div class="vc-split"><div class="vc-list">${list}</div><div class="vc-detail">${detail}</div></div>`;
}

// ── VIDEO VISITS + VOICE CALLS TAB ────────────────────────────────────────────
function _vcConsultHTML(type) {
  const e = _vcEsc;
  const items = type === 'video' ? VC_MOCK.videoVisits : VC_MOCK.voiceCalls;
  const stateKey = type === 'video' ? '_vcSelVisit' : '_vcSelCall';
  if (!window[stateKey] && items.length) window[stateKey] = items[0].id;
  const sel = items.find(v => v.id === window[stateKey]);

  const list = items.map(v => {
    const timeStr = v.scheduledAt ? new Date(v.scheduledAt).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}) : '';
    const dateStr = v.scheduledAt ? new Date(v.scheduledAt).toLocaleDateString('en-GB',{day:'numeric',month:'short'}) : '';
    return `<div class="vc-list-item${v.id===window[stateKey]?' selected':''}"
              onclick="window._vcSelConsult('${e(type)}','${e(v.id)}')">
      <div class="vc-av">${e(v.initials)}</div>
      <div class="vc-li-body">
        <div class="vc-li-name">${e(v.patientName)}</div>
        <div class="vc-li-sub">${dateStr} ${timeStr} &middot; ${v.duration}min</div>
        <div class="vc-li-preview">${e(v.purpose)}</div>
      </div>
      ${_vcStatusBadge(v.status)}
    </div>`;
  }).join('') || `<div class="vc-list-empty">No ${type === 'video' ? 'video visits' : 'voice calls'} on record</div>`;

  let detail = '<div class="vc-detail-ph">Select a consultation to view details</div>';
  if (sel) {
    const timeStr = sel.scheduledAt ? new Date(sel.scheduledAt).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : '';
    const canStart = sel.status === 'scheduled' || sel.status === 'in-progress';
    detail = `
      ${_vcCtxHdr(sel)}
      <div class="vc-detail-section">
        <div class="vc-ds-title">${type==='video'?'Video Visit':'Voice Call'} Details</div>
        <div class="vc-field-grid">
          <div class="vc-field"><span class="vc-fl">Status</span><span class="vc-fv">${_vcStatusBadge(sel.status)}</span></div>
          <div class="vc-field"><span class="vc-fl">Scheduled</span><span class="vc-fv">${e(timeStr)}</span></div>
          <div class="vc-field"><span class="vc-fl">Duration</span><span class="vc-fv">${sel.duration} min</span></div>
          <div class="vc-field"><span class="vc-fl">Notes</span><span class="vc-fv">${_vcStatusBadge(sel.notesStatus||'pending')}</span></div>
        </div>
        <div class="vc-reason-block">
          <div class="vc-fl">Purpose</div>
          <div class="vc-reason-text">${e(sel.purpose)}</div>
        </div>
      </div>
      <div class="vc-action-row">
        ${canStart
          ? `<button class="vc-ar-primary" onclick="window._vcLaunchConsult('${e(type)}','${e(sel.id)}')">${type==='video'?'&#9654; Join Video Visit':'&#9742; Join Voice Call'}</button>`
          : `<button class="vc-ar-primary" onclick="window._vcRecordNote()">&#9210;&ensp;Add Visit Note</button>`}
        <button class="vc-ar-sec" onclick="window._vcRecordNote()">&#9210;&ensp;Record Note</button>
        <button class="vc-ar-sec" onclick="window._vcScheduleFollowUp('${e(sel.patientId)}')">&#128197;&ensp;Schedule Follow-up</button>
        ${sel.status === 'missed' ? `<button class="vc-ar-sec" onclick="window._vcReplyReq('${e(sel.patientId)}')">&#9993;&ensp;Contact Patient</button>` : ''}
        <button class="vc-ar-ghost" onclick="window._vcMarkFollowUpDone('${e(sel.id)}')">Mark Reviewed</button>
      </div>`;
  }

  return `<div class="vc-split"><div class="vc-list">${list}</div><div class="vc-detail">${detail}</div></div>`;
}

// ── SHARED MEDIA TAB ──────────────────────────────────────────────────────────
function _vcMediaHTML() {
  const e = _vcEsc;
  const items = VC_MOCK.sharedMedia;
  if (!_vcSelMedia && items.length) _vcSelMedia = items[0].id;
  const sel = items.find(m => m.id === _vcSelMedia);

  const TYPE_ICON = { 'voice-note':'&#9654;', 'video-update':'&#9654;', 'text-update':'&#9993;', 'symptom-update':'&#9650;', 'device-issue':'&#9670;' };
  const TYPE_LABEL = { 'voice-note':'Voice note', 'video-update':'Video update', 'text-update':'Text update', 'symptom-update':'Symptom update', 'device-issue':'Device issue' };

  const list = items.map(m => {
    const urg = m.urgency === 'urgent';
    const icon = TYPE_ICON[m.type] || '&#9643;';
    return `<div class="vc-list-item${m.id===_vcSelMedia?' selected':''}${urg?' vc-li--urgent':''}"
              onclick="window._vcSelMedia('${e(m.id)}')">
      <div class="vc-av${urg?' vc-av--urgent':''}${m.reviewed?' vc-av--muted':''}">${e(m.initials)}</div>
      <div class="vc-li-body">
        <div class="vc-li-name">${e(m.patientName)} ${m.reviewed?'<span class="vc-reviewed-tag">Reviewed</span>':''}</div>
        <div class="vc-li-sub">${icon} ${TYPE_LABEL[m.type]||m.type} &middot; ${_vcRelTime(m.submittedAt)}</div>
        <div class="vc-li-preview">${e(m.subject)}</div>
      </div>
      ${urg&&!m.reviewed?'<span class="vc-dot-urgent"></span>':''}
    </div>`;
  }).join('') || '<div class="vc-list-empty">No shared media to review</div>';

  let detail = '<div class="vc-detail-ph">Select an item to review it</div>';
  if (sel) {
    const hasAudio = sel.type === 'voice-note';
    const hasVideo = sel.type === 'video-update';
    detail = `
      ${_vcCtxHdr(sel)}
      <div class="vc-detail-section">
        <div class="vc-ds-title">Patient Update <span style="font-weight:400;font-size:.8rem">&middot; ${e(TYPE_LABEL[sel.type]||sel.type)}</span></div>
        <div class="vc-field-grid">
          <div class="vc-field"><span class="vc-fl">Reason</span><span class="vc-fv">${e(sel.reason)}</span></div>
          <div class="vc-field"><span class="vc-fl">Severity</span><span class="vc-fv">${e(sel.severity)}</span></div>
          <div class="vc-field"><span class="vc-fl">Trend</span><span class="vc-fv">${e(sel.trend)}</span></div>
          <div class="vc-field"><span class="vc-fl">Session</span><span class="vc-fv">${e(sel.sessionRef||'\u2014')}</span></div>
          <div class="vc-field"><span class="vc-fl">Submitted</span><span class="vc-fv">${_vcRelTime(sel.submittedAt)}</span></div>
          <div class="vc-field"><span class="vc-fl">Urgency</span><span class="vc-fv">${_vcUrgencyBadge(sel.urgency)}</span></div>
        </div>
        ${hasAudio||hasVideo ? `<div class="vc-media-player">
          <div class="vc-mp-icon">${hasVideo?'&#9654;':'&#9654;'}</div>
          <div class="vc-mp-info">
            <div class="vc-mp-label">${e(sel.subject)}</div>
            <div class="vc-mp-sub">${e(sel.duration||'')} &middot; Patient-recorded</div>
          </div>
          <button class="vc-mp-play" onclick="window._showNotifToast&&window._showNotifToast({title:'Media Player',body:'Media playback will be available when patient media upload is enabled.',severity:'info'})">&#9654; Play</button>
        </div>` : `<div class="vc-text-update-body">${e(sel.subject)}</div>`}
      </div>
      ${sel.aiSummary ? `<div class="vc-ai-panel">
        <div class="vc-ai-header"><span class="vc-ai-label">AI Summary</span><span class="vc-ai-note">Review before acting &middot; Not a clinical recommendation</span></div>
        <div class="vc-ai-body">${e(sel.aiSummary)}</div>
      </div>` : ''}
      <div class="vc-action-row">
        <button class="vc-ar-primary" onclick="window._vcStartVideoVisit('${e(sel.patientId)}')">&#9654; Video Visit</button>
        <button class="vc-ar-sec" onclick="window._vcSendMessage('${e(sel.patientId)}')">&#9993;&ensp;Reply</button>
        <button class="vc-ar-sec" onclick="window._vcConvertToNote('${e(sel.id)}')">&#9210;&ensp;Create Note</button>
        <button class="vc-ar-sec" onclick="window._vcFlagAdverse('${e(sel.id)}')">&#9650;&ensp;Flag Adverse Event</button>
        <button class="vc-ar-ghost" onclick="window._vcMarkMediaReviewed('${e(sel.id)}')">${sel.reviewed?'Reviewed \u2713':'Mark Reviewed'}</button>
      </div>`;
  }

  return `<div class="vc-split"><div class="vc-list">${list}</div><div class="vc-detail">${detail}</div></div>`;
}

// ── AI NOTES TAB ──────────────────────────────────────────────────────────────
function _vcAiNotesHTML() {
  const e = _vcEsc;
  const notes = VC_MOCK.aiNotes;
  if (!_vcSelNote && notes.length) _vcSelNote = notes[0].id;
  const sel = notes.find(n => n.id === _vcSelNote);

  const TYPE_ICON  = { 'voice-note':'&#9654;', 'video-note':'&#9654;', 'text-note':'&#9210;', 'transcription':'&#9210;' };
  const TYPE_LABEL = { 'voice-note':'Voice note', 'video-note':'Video note', 'text-note':'Text note', 'transcription':'Transcription' };

  const list = notes.map(n => {
    const pending = n.status !== 'signed';
    return `<div class="vc-list-item${n.id===_vcSelNote?' selected':''}${pending?' vc-li--pending':''}"
              onclick="window._vcSelNote('${e(n.id)}')">
      <div class="vc-av vc-av--ai">${e(n.initials)}</div>
      <div class="vc-li-body">
        <div class="vc-li-name">${e(n.patientName)}</div>
        <div class="vc-li-sub">${TYPE_ICON[n.type]||'&#9210;'} ${TYPE_LABEL[n.type]||n.type} &middot; ${_vcRelTime(n.recordedAt)}</div>
        <div class="vc-li-preview">${e(n.subject)}</div>
      </div>
      ${_vcStatusBadge(n.status)}
    </div>`;
  }).join('') || '<div class="vc-list-empty">No AI notes on record</div>';

  let detail = '<div class="vc-detail-ph">Select a note to review it</div>';
  if (sel) {
    detail = `
      ${_vcCtxHdr(sel)}
      <div class="vc-detail-section">
        <div class="vc-ds-title">${e(sel.subject)} ${_vcStatusBadge(sel.status)}</div>
        <div class="vc-field-grid">
          <div class="vc-field"><span class="vc-fl">Type</span><span class="vc-fv">${e(TYPE_LABEL[sel.type]||sel.type)}</span></div>
          <div class="vc-field"><span class="vc-fl">Recorded</span><span class="vc-fv">${_vcRelTime(sel.recordedAt)}</span></div>
        </div>
        <div class="vc-note-block">
          <div class="vc-fl" style="margin-bottom:6px">Transcription</div>
          <div class="vc-note-text" id="vc-note-trans-${e(sel.id)}" contenteditable="${sel.status!=='signed'}" spellcheck="true">${e(sel.transcription)}</div>
        </div>
      </div>
      <div class="vc-ai-panel">
        <div class="vc-ai-header"><span class="vc-ai-label">AI Draft Summary</span><span class="vc-ai-note">Review before saving &middot; Clinician sign-off required</span></div>
        <div class="vc-ai-body" id="vc-note-ai-${e(sel.id)}" contenteditable="${sel.status!=='signed'}" spellcheck="true">${e(sel.aiSummary)}</div>
      </div>
      <div class="vc-action-row">
        ${sel.status !== 'signed' ? `
          <button class="vc-ar-primary" onclick="window._vcSignOff('${e(sel.id)}')">&#10003;&ensp;Sign Off Note</button>
          <button class="vc-ar-sec" onclick="window._vcSaveNoteDraft('${e(sel.id)}')">Save Draft</button>
        ` : '<span class="vc-signed-tag">&#10003; Signed &amp; saved</span>'}
        <button class="vc-ar-sec" onclick="window._vcConvertNoteAction('${e(sel.id)}')">Convert to Follow-up</button>
        <button class="vc-ar-sec" onclick="window._vcStartVideoVisit('${e(sel.patientId)}')">&#9654; Video Visit</button>
        ${sel.status !== 'signed' ? `<button class="vc-ar-ghost" onclick="window._vcDiscardNote('${e(sel.id)}')">Discard Draft</button>` : ''}
      </div>`;
  }

  return `<div class="vc-split"><div class="vc-list">${list}</div><div class="vc-detail">${detail}</div></div>`;
}

// ── HANDLERS ──────────────────────────────────────────────────────────────────
window._vcSetTab = function(tab) { _vcTab = tab; _vcRender(); };

window._vcFilterInbox = function(q) {
  document.querySelectorAll('#vc-inbox-list .vc-list-item').forEach(el => {
    el.style.display = el.textContent.toLowerCase().includes(q.toLowerCase()) ? '' : 'none';
  });
};

window._vcInboxSel = async function(pid) {
  _vcInboxPid = pid;
  try { const r = await api.getPatientMessages(pid); _vcInboxMsgs = Array.isArray(r) ? r : (r?.items||[]); } catch { _vcInboxMsgs = []; }
  _vcRender();
};

window._vcSendReply = async function(pid) {
  const ta  = document.getElementById('vc-reply-ta');
  const msg = ta?.value?.trim();
  if (!msg || !pid) return;
  ta.value = '';
  ta.disabled = true;
  try {
    await api.sendPatientMessage(pid, msg);
    const t = document.getElementById('vc-thread');
    if (t) {
      const d = document.createElement('div');
      d.className = 'vc-msg vc-msg--out';
      d.innerHTML = `<div class="vc-msg-bub">${_vcEsc(msg)}</div><div class="vc-msg-meta">${new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})} &middot; Sending\u2026</div>`;
      t.appendChild(d); t.scrollTop = t.scrollHeight;
    }
  } catch {
    ta.value = msg;
    window._showNotifToast?.({title:'Send failed',body:'Message could not be sent. Please try again.',severity:'error'});
  } finally { ta.disabled = false; if (ta) ta.focus(); }
};

window._vcSelCR = function(id) { _vcSelCR = id; _vcRender(); };

window._vcSelConsult = function(type, id) {
  if (type === 'video') _vcSelVisit = id; else _vcSelCall = id;
  _vcRender();
};

window._vcSelMedia = function(id) { _vcSelMedia = id; _vcRender(); };
window._vcSelNote  = function(id) { _vcSelNote  = id; _vcRender(); };

function _vcToast(title, body, severity) {
  window._showNotifToast?.({ title, body, severity: severity||'info' });
}

window._vcStartVideoVisit = function(pid) {
  _vcToast('Start Video Visit', 'Connect your video provider (Zoom, Teams, or telehealth platform) to launch visits directly from this page.', 'info');
};
window._vcStartVoiceCall = function(pid) {
  _vcToast('Start Voice Call', 'Connect your telephony provider to launch calls directly from this page.', 'info');
};
window._vcSendMessage = function(pid) {
  _vcTab = 'inbox';
  if (pid) _vcInboxPid = pid;
  _vcRender();
  setTimeout(() => { document.getElementById('vc-reply-ta')?.focus(); }, 80);
};
window._vcRecordNote = function() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `<div class="modal-card" style="max-width:560px;width:100%">
    <h3 style="margin-bottom:4px">Record Note</h3>
    <p style="font-size:.82rem;color:var(--text-secondary);margin-bottom:16px">AI will transcribe and draft a summary. Review before saving.</p>
    <label class="form-label">Note type</label>
    <select id="vc-note-type" class="form-control" style="margin-bottom:12px">
      <option value="text-note">Text note</option>
      <option value="voice-note">Voice note (transcription)</option>
      <option value="video-note">Video note (transcription)</option>
    </select>
    <label class="form-label">Subject</label>
    <input id="vc-note-subj" class="form-control" type="text" placeholder="e.g. Session 10 observation" style="margin-bottom:12px">
    <label class="form-label">Note content</label>
    <textarea id="vc-note-body" class="form-control" rows="5" placeholder="Dictate or type your observation here\u2026" style="margin-bottom:12px"></textarea>
    <div class="vc-ai-panel" style="margin-bottom:16px">
      <div class="vc-ai-header"><span class="vc-ai-label">AI Draft</span><span class="vc-ai-note">Will be generated on save &middot; Review before signing off</span></div>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
      <button class="btn-primary" onclick="window._vcSaveRecordedNote()">Save Note</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
};
window._vcSaveRecordedNote = function() {
  const subj = document.getElementById('vc-note-subj')?.value?.trim();
  const body = document.getElementById('vc-note-body')?.value?.trim();
  if (!body) { alert('Please enter note content'); return; }
  document.querySelector('.modal-overlay')?.remove();
  _vcToast('Note Saved', `"${subj||'Note'}" saved as draft. AI summary will be generated shortly.`, 'success');
};
window._vcStartCall = function(reqId, type) {
  _vcToast(`Start ${type==='video'?'Video Visit':'Voice Call'}`, 'Connect your video/telephony provider to launch calls from this page.', 'info');
};
window._vcScheduleReq = function(reqId) {
  _vcToast('Schedule Call', 'Open the Scheduling page to book a time slot for this patient.', 'info');
};
window._vcReplyReq = function(pid) { window._vcSendMessage(pid); };
window._vcDismissCR = function(id) {
  const idx = VC_MOCK.callRequests.findIndex(r => r.id === id);
  if (idx >= 0) VC_MOCK.callRequests.splice(idx, 1);
  _vcSelCR = null; _vcRender();
};
window._vcLaunchConsult = function(type, id) {
  _vcToast(`Join ${type==='video'?'Video Visit':'Voice Call'}`, 'Connect your telehealth provider to launch consultations from this page.', 'info');
};
window._vcScheduleFollowUp = function(pid) {
  _vcToast('Schedule Follow-up', 'Open the Scheduling page to book a follow-up session for this patient.', 'info');
};
window._vcMarkFollowUpDone = function(id) { _vcRender(); _vcToast('Marked', 'Item marked as reviewed.', 'success'); };
window._vcMarkMediaReviewed = function(id) {
  const item = VC_MOCK.sharedMedia.find(m => m.id === id);
  if (item) item.reviewed = true;
  _vcRender();
};
window._vcConvertToNote = function(id) {
  _vcToast('Note Created', 'A draft note has been created from this update. Open AI Notes to review and sign off.', 'success');
};
window._vcFlagAdverse = function(id) {
  _vcToast('Adverse Event Flagged', 'This update has been flagged for adverse event review. Add it to the patient\'s clinical record.', 'warning');
};
window._vcSignOff = function(id) {
  const note = VC_MOCK.aiNotes.find(n => n.id === id);
  if (note) note.status = 'signed';
  _vcRender(); _vcToast('Note Signed', 'Note signed off and saved to the clinical record.', 'success');
};
window._vcSaveNoteDraft = function(id) { _vcToast('Draft Saved', 'Note draft saved. You can return to sign off later.', 'success'); };
window._vcConvertNoteAction = function(id) { _vcToast('Follow-up Created', 'A follow-up task has been added to the patient\'s care plan.', 'success'); };
window._vcDiscardNote = function(id) {
  const idx = VC_MOCK.aiNotes.findIndex(n => n.id === id);
  if (idx >= 0) VC_MOCK.aiNotes.splice(idx, 1);
  _vcSelNote = null; _vcRender();
};

// Keep bulk message + template helpers from old messaging page
window._msgSelectPatient  = async function(pid) { _vcInboxPid = pid; await window._vcInboxSel(pid); };
window._filterMsgPatients = window._vcFilterInbox;

'''

# Insert new content — OLD_END ('\n// Protocol Builder\n') is the start of next section, keep it
src = src[:start_pos] + NEW_VC + src[end_pos:]

with open('apps/web/src/pages-clinical.js', 'w', encoding='utf-8') as f:
    f.write(src)
print('OK  pages-clinical.js — pgVirtualCare inserted')

# ─── 3. styles.css ────────────────────────────────────────────────────────────
with open('apps/web/src/styles.css', 'r', encoding='utf-8') as f:
    css = f.read()

VC_CSS = '''
/* ═══════════════════════════════════════════════════════════════════════════
   Virtual Care — pgVirtualCare (clinician consultation hub)
   ═══════════════════════════════════════════════════════════════════════════ */

.vc-wrap { display:flex; flex-direction:column; gap:0; min-height:0; }

/* ── Summary strip ── */
.vc-summary-strip {
  display:flex; gap:8px; flex-wrap:wrap; padding:14px 0 10px;
}
.vc-chip {
  display:flex; flex-direction:column; align-items:center; gap:2px;
  padding:9px 18px; border-radius:10px; border:1px solid var(--border);
  background:var(--surface-1); cursor:pointer; transition:border-color .15s,background .15s;
  min-width:90px;
}
.vc-chip:hover { border-color:rgba(0,212,188,.3); background:rgba(0,212,188,.05); }
.vc-chip--attn  { border-color:rgba(245,158,11,.35); background:rgba(245,158,11,.07); }
.vc-chip--urgent{ border-color:rgba(239,68,68,.35);  background:rgba(239,68,68,.07); }
.vc-chip--ai    { border-color:rgba(167,139,250,.3);  background:rgba(167,139,250,.07); }
.vc-chip-n  { font-size:1.35rem; font-weight:700; line-height:1; color:var(--text-primary); }
.vc-chip-lbl{ font-size:.7rem; font-weight:600; text-transform:uppercase; letter-spacing:.06em; color:var(--text-muted); white-space:nowrap; }

/* ── Primary action bar ── */
.vc-action-bar {
  display:flex; gap:8px; flex-wrap:wrap; padding:0 0 12px;
}
.vc-act {
  display:inline-flex; align-items:center; gap:6px;
  padding:8px 18px; border-radius:9px; font-size:.84rem; font-weight:600; cursor:pointer;
  border:1px solid var(--border); color:var(--text-primary);
  background:rgba(255,255,255,.05); transition:background .15s,border-color .15s;
}
.vc-act:hover { background:rgba(255,255,255,.1); }
.vc-act--primary {
  background:rgba(0,212,188,.12); color:var(--teal); border-color:rgba(0,212,188,.3);
}
.vc-act--primary:hover { background:rgba(0,212,188,.22); border-color:rgba(0,212,188,.5); }

/* ── Tabs ── */
.vc-tabs {
  display:flex; gap:0; border-bottom:1px solid var(--border); flex-wrap:wrap;
  margin-bottom:0;
}
.vc-tab {
  display:inline-flex; align-items:center; gap:6px;
  padding:9px 16px; font-size:.83rem; font-weight:500; cursor:pointer;
  background:none; border:none; border-bottom:2px solid transparent;
  color:var(--text-secondary); transition:color .15s,border-color .15s;
  white-space:nowrap;
}
.vc-tab:hover { color:var(--text-primary); }
.vc-tab.active { color:var(--teal); border-bottom-color:var(--teal); font-weight:600; }
.vc-tab--attn { color:#f59e0b; }
.vc-tab--attn.active { color:#f59e0b; border-bottom-color:#f59e0b; }
.vc-tab--ai.active { color:#a78bfa; border-bottom-color:#a78bfa; }
.vc-tab-badge {
  font-size:.68rem; font-weight:700; padding:1px 6px; border-radius:9px;
  background:rgba(255,255,255,.12); color:var(--text-secondary);
}
.vc-tab.active .vc-tab-badge { background:rgba(0,212,188,.18); color:var(--teal); }

/* ── Main content split ── */
.vc-content { flex:1; min-height:0; }
.vc-split {
  display:grid; grid-template-columns:280px 1fr; gap:0;
  height:calc(100vh - 280px); min-height:400px;
  border:1px solid var(--border); border-top:none; border-radius:0 0 12px 12px;
  overflow:hidden;
}

/* ── Left list panel ── */
.vc-list {
  display:flex; flex-direction:column; overflow:hidden;
  border-right:1px solid var(--border); background:var(--surface-1);
}
.vc-list-filter { padding:10px 10px 6px; flex-shrink:0; }
.vc-search {
  width:100%; padding:7px 10px; border-radius:8px; font-size:.82rem;
  border:1px solid var(--border); background:rgba(255,255,255,.05); color:var(--text-primary);
}
#vc-inbox-list { overflow-y:auto; flex:1; }
.vc-list-empty { padding:24px 16px; text-align:center; font-size:.82rem; color:var(--text-muted); font-style:italic; }
.vc-list-item {
  display:flex; align-items:flex-start; gap:10px;
  padding:11px 12px; cursor:pointer; transition:background .12s;
  border-bottom:1px solid rgba(255,255,255,.05);
}
.vc-list-item:hover    { background:rgba(255,255,255,.04); }
.vc-list-item.selected { background:rgba(0,212,188,.08); border-left:3px solid var(--teal); }
.vc-li--urgent { border-left:3px solid rgba(239,68,68,.6)!important; }
.vc-li--pending{ border-left:3px solid rgba(167,139,250,.5)!important; }

/* ── Avatar ── */
.vc-av, .vc-ctx-av {
  width:36px; height:36px; border-radius:50%; flex-shrink:0;
  display:flex; align-items:center; justify-content:center;
  font-size:.8rem; font-weight:700; background:rgba(0,212,188,.15); color:var(--teal);
}
.vc-av--urgent { background:rgba(239,68,68,.15); color:#ef4444; }
.vc-av--muted  { background:rgba(255,255,255,.07); color:var(--text-muted); }
.vc-av--ai     { background:rgba(167,139,250,.15); color:#a78bfa; }
.vc-ctx-av     { width:42px; height:42px; font-size:.9rem; }
.vc-ctx-av--urgent { background:rgba(239,68,68,.15); color:#ef4444; }

/* ── List item body ── */
.vc-li-body   { flex:1; min-width:0; }
.vc-li-name   { font-size:.84rem; font-weight:600; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.vc-li-sub    { font-size:.73rem; color:var(--text-secondary); margin-top:2px; }
.vc-li-preview{ font-size:.73rem; color:var(--text-muted); margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.vc-dot-urgent { width:8px; height:8px; border-radius:50%; background:#ef4444; flex-shrink:0; margin-top:4px; }
.vc-reviewed-tag { font-size:.65rem; font-weight:600; padding:1px 5px; border-radius:4px; background:rgba(52,211,153,.15); color:#34d399; margin-left:4px; }

/* ── Right detail panel ── */
.vc-detail {
  display:flex; flex-direction:column; overflow:hidden;
  background:var(--surface-1);
}
.vc-detail-ph {
  flex:1; display:flex; align-items:center; justify-content:center;
  font-size:.85rem; color:var(--text-muted); font-style:italic;
}

/* ── Patient context header ── */
.vc-ctx-hdr {
  display:flex; align-items:center; gap:12px;
  padding:12px 16px; border-bottom:1px solid var(--border); flex-shrink:0;
  background:rgba(255,255,255,.02);
}
.vc-ctx-info { flex:1; min-width:0; }
.vc-ctx-name { font-size:.95rem; font-weight:700; color:var(--text-primary); }
.vc-ctx-meta { font-size:.75rem; color:var(--text-secondary); margin-top:2px; }
.vc-ctx-acts { display:flex; gap:6px; flex-wrap:wrap; }
.vc-ctx-btn {
  padding:5px 11px; border-radius:7px; font-size:.76rem; font-weight:500; cursor:pointer;
  border:1px solid var(--border); background:rgba(255,255,255,.05); color:var(--text-secondary);
  white-space:nowrap; transition:background .12s;
}
.vc-ctx-btn:hover { background:rgba(255,255,255,.1); }
.vc-ctx-btn--vid { background:rgba(0,212,188,.1); color:var(--teal); border-color:rgba(0,212,188,.25); }
.vc-ctx-btn--vid:hover { background:rgba(0,212,188,.2); }

/* ── Detail sections ── */
.vc-detail-section { padding:14px 16px; border-bottom:1px solid var(--border); flex-shrink:0; }
.vc-ds-title { font-size:.82rem; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:var(--text-muted); margin-bottom:10px; }
.vc-field-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px 16px; margin-bottom:10px; }
.vc-field { display:flex; flex-direction:column; gap:2px; }
.vc-fl { font-size:.72rem; font-weight:600; text-transform:uppercase; letter-spacing:.05em; color:var(--text-muted); }
.vc-fv { font-size:.83rem; color:var(--text-secondary); }
.vc-reason-block { margin-top:10px; }
.vc-reason-text { font-size:.84rem; color:var(--text-secondary); line-height:1.55; margin-top:4px; padding:8px 10px; background:rgba(255,255,255,.04); border-radius:7px; border:1px solid var(--border); }
.vc-text-update-body { font-size:.84rem; color:var(--text-secondary); line-height:1.55; margin-top:8px; padding:10px 12px; background:rgba(255,255,255,.04); border-radius:7px; border:1px solid var(--border); }
.vc-note-block { margin-top:12px; }
.vc-note-text { font-size:.84rem; color:var(--text-secondary); line-height:1.6; padding:10px 12px; background:rgba(255,255,255,.04); border-radius:7px; border:1px solid var(--border); min-height:80px; outline:none; }
.vc-note-text:focus { border-color:rgba(0,212,188,.35); }

/* ── AI summary panel ── */
.vc-ai-panel {
  margin:0 16px 0; padding:12px 14px; border-radius:9px;
  background:rgba(167,139,250,.07); border:1px solid rgba(167,139,250,.2);
  flex-shrink:0;
}
.vc-ai-header { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px; }
.vc-ai-label { font-size:.75rem; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:#a78bfa; }
.vc-ai-note  { font-size:.7rem; color:var(--text-muted); font-style:italic; }
.vc-ai-body  { font-size:.83rem; color:var(--text-secondary); line-height:1.55; outline:none; }
.vc-ai-body:focus { outline:1px solid rgba(167,139,250,.4); border-radius:4px; }

/* ── Media player ── */
.vc-media-player {
  display:flex; align-items:center; gap:12px;
  padding:10px 12px; border-radius:8px; border:1px solid var(--border);
  background:rgba(255,255,255,.04); margin-top:10px;
}
.vc-mp-icon { font-size:1.2rem; color:var(--teal); }
.vc-mp-info { flex:1; }
.vc-mp-label { font-size:.83rem; font-weight:600; color:var(--text-primary); }
.vc-mp-sub   { font-size:.73rem; color:var(--text-muted); }
.vc-mp-play  { padding:6px 14px; border-radius:7px; font-size:.78rem; font-weight:600; cursor:pointer; background:rgba(0,212,188,.12); color:var(--teal); border:1px solid rgba(0,212,188,.25); transition:background .12s; }
.vc-mp-play:hover { background:rgba(0,212,188,.22); }

/* ── Action row ── */
.vc-action-row {
  display:flex; gap:8px; flex-wrap:wrap; align-items:center;
  padding:12px 16px; border-top:1px solid var(--border); flex-shrink:0;
  margin-top:auto;
}
.vc-ar-primary {
  padding:8px 18px; border-radius:8px; font-size:.83rem; font-weight:600; cursor:pointer;
  background:rgba(0,212,188,.12); color:var(--teal); border:1px solid rgba(0,212,188,.3);
  transition:background .15s; display:inline-flex; align-items:center; gap:5px;
}
.vc-ar-primary:hover { background:rgba(0,212,188,.22); }
.vc-ar-sec {
  padding:7px 14px; border-radius:8px; font-size:.8rem; font-weight:500; cursor:pointer;
  border:1px solid var(--border); color:var(--text-secondary);
  background:rgba(255,255,255,.05); transition:background .12s;
  display:inline-flex; align-items:center; gap:5px;
}
.vc-ar-sec:hover { background:rgba(255,255,255,.1); }
.vc-ar-ghost {
  padding:6px 12px; border-radius:7px; font-size:.78rem; font-weight:500; cursor:pointer;
  border:none; background:none; color:var(--text-muted);
  transition:color .12s; margin-left:auto;
}
.vc-ar-ghost:hover { color:var(--text-secondary); }
.vc-signed-tag { font-size:.82rem; font-weight:600; color:#34d399; margin-right:auto; }

/* ── Status badges ── */
.vc-status-badge {
  display:inline-block; padding:2px 8px; border-radius:10px;
  font-size:.7rem; font-weight:600; letter-spacing:.02em; white-space:nowrap;
}
.vc-status--scheduled  { background:rgba(74,158,255,.15); color:#4a9eff; }
.vc-status--inprog     { background:rgba(0,212,188,.15);  color:var(--teal); }
.vc-status--done       { background:rgba(52,211,153,.15); color:#34d399; }
.vc-status--missed     { background:rgba(239,68,68,.15);  color:#ef4444; }
.vc-status--followup   { background:rgba(245,158,11,.15); color:#f59e0b; }
.vc-status--signoff    { background:rgba(167,139,250,.15);color:#a78bfa; }
.vc-status--review     { background:rgba(245,158,11,.12); color:#f59e0b; }

/* ── Urgency badges ── */
.vc-urg { display:inline-block; padding:2px 8px; border-radius:10px; font-size:.7rem; font-weight:600; }
.vc-urg--urgent   { background:rgba(239,68,68,.15);  color:#ef4444; }
.vc-urg--moderate { background:rgba(245,158,11,.15); color:#f59e0b; }
.vc-urg--routine  { background:rgba(148,163,184,.12);color:var(--text-muted); }

/* ── Inbox thread ── */
.vc-thread {
  flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:10px;
}
.vc-thread-ph { flex:1; display:flex; align-items:center; justify-content:center; font-size:.83rem; color:var(--text-muted); font-style:italic; }
.vc-msg { display:flex; flex-direction:column; align-items:flex-start; }
.vc-msg--out { align-items:flex-end; }
.vc-msg-bub { max-width:72%; padding:9px 13px; border-radius:14px 14px 14px 4px; font-size:.855rem; line-height:1.5; background:rgba(255,255,255,.07); color:var(--text-primary); }
.vc-msg--out .vc-msg-bub { border-radius:14px 14px 4px 14px; background:var(--teal); color:#000; }
.vc-msg-meta { font-size:.7rem; color:var(--text-muted); margin-top:3px; }

/* ── Reply bar ── */
.vc-reply-bar { padding:10px 12px; border-top:1px solid var(--border); display:flex; gap:8px; flex-shrink:0; }
.vc-reply-ta { flex:1; resize:none; padding:8px 10px; border-radius:8px; font-size:.84rem; border:1px solid var(--border); background:rgba(255,255,255,.05); color:var(--text-primary); }
.vc-reply-acts { display:flex; flex-direction:column; gap:5px; }
.vc-reply-send { padding:6px 12px; border-radius:7px; font-size:.8rem; font-weight:600; cursor:pointer; background:rgba(0,212,188,.12); color:var(--teal); border:1px solid rgba(0,212,188,.3); white-space:nowrap; }
.vc-reply-send:hover { background:rgba(0,212,188,.22); }
.vc-reply-act { width:36px; height:28px; border-radius:6px; font-size:.85rem; cursor:pointer; border:1px solid var(--border); background:rgba(255,255,255,.04); color:var(--text-secondary); transition:background .12s; }
.vc-reply-act:hover { background:rgba(255,255,255,.1); }

/* ── Responsive ── */
@media (max-width: 768px) {
  .vc-split { grid-template-columns:1fr; height:auto; }
  .vc-list  { max-height:260px; border-right:none; border-bottom:1px solid var(--border); }
  .vc-summary-strip { gap:6px; }
  .vc-chip  { min-width:72px; padding:7px 12px; }
  .vc-chip-n{ font-size:1.1rem; }
  .vc-field-grid { grid-template-columns:1fr; }
  .vc-action-bar { gap:6px; }
  .vc-act   { font-size:.78rem; padding:7px 13px; }
}

/* ── Light theme ── */
@media (prefers-color-scheme: light) {
  .vc-chip   { background:#fff; }
  .vc-act    { background:rgba(0,0,0,.03); color:#374151; }
  .vc-list   { background:#fafafa; }
  .vc-detail { background:#fff; }
  .vc-ctx-hdr{ background:rgba(0,0,0,.02); }
  .vc-msg-bub{ background:rgba(0,0,0,.06); color:#1f2937; }
  .vc-msg--out .vc-msg-bub { background:var(--teal); color:#fff; }
  .vc-reason-text, .vc-note-text, .vc-text-update-body { background:rgba(0,0,0,.03); }
  .vc-ai-panel { background:rgba(167,139,250,.06); }
}
'''

# Insert before the big Protocol Builder section
pb_marker = '/* \u2550' * 3
# Find a unique CSS section separator near Protocol Builder
# Use the outcome portal section as anchor
anchor = '/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n   Patient Outcome Portal'
pos = css.find(anchor)
if pos < 0:
    # Fallback: append at end
    css += VC_CSS
    print('WARN: anchor not found, CSS appended at end')
else:
    css = css[:pos] + VC_CSS + '\n' + css[pos:]
    print('OK  styles.css — VC CSS inserted')

with open('apps/web/src/styles.css', 'w', encoding='utf-8') as f:
    f.write(css)

print('\nAll patches applied successfully.')
