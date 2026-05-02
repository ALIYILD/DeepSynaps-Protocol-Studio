// Media pages — pgPatientMediaConsent + pgPatientMediaUpload +
// pgPatientMediaHistory. Extracted from `pages-patient.js` on 2026-05-02
// as part of the file-split refactor (see `pages-patient/_shared.js`). NO
// behavioural change: code below is the verbatim media block from the
// original file, with imports rewired.
//
// `_MEDIA_BASE` and `_mediaFetch` are local to this module — no other
// patient page references them.
import { api } from '../api.js';
import { currentUser } from '../auth.js';
import { t } from '../i18n.js';
import { setTopbar, spinner, fmtDate, _hdEsc } from './_shared.js';

// ── Shared fetch helper for media endpoints (not yet in api.js) ──────────────
// Mirrors the API_BASE logic from api.js
const _MEDIA_BASE = (import.meta.env && import.meta.env.VITE_API_BASE_URL) || 'http://127.0.0.1:8000';
async function _mediaFetch(path, opts = {}) {
  const isForm = opts.body instanceof FormData;

  function _buildHeaders(token) {
    const h = { ...(opts.headers || {}) };
    if (token) h['Authorization'] = `Bearer ${token}`;
    if (!isForm) h['Content-Type'] = 'application/json';
    return h;
  }

  async function _doFetch(token) {
    return fetch(`${_MEDIA_BASE}${path}`, { ...opts, headers: _buildHeaders(token) });
  }

  let res = await _doFetch(api.getToken());

  // Mirror apiFetch: on 401, attempt one token refresh then retry
  if (res.status === 401 && path !== '/api/v1/auth/refresh') {
    try {
      const storedRefresh = localStorage.getItem('ds_refresh_token');
      if (storedRefresh) {
        const refreshRes = await fetch(`${_MEDIA_BASE}/api/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: storedRefresh }),
        });
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          if (refreshData.access_token) {
            api.setToken(refreshData.access_token);
            if (refreshData.refresh_token) localStorage.setItem('ds_refresh_token', refreshData.refresh_token);
            res = await _doFetch(refreshData.access_token);
          }
        }
      }
    } catch (_refreshErr) { /* fall through to original 401 error */ }
  }

  if (res.status === 204) return null;
  if (!res.ok) {
    let msg = `API error ${res.status}`;
    try { const e = await res.json(); msg = e.detail || msg; } catch (_e2) { /* ignore */ }
    throw new Error(msg);
  }
  return res.json();
}

// ── Media & AI Analysis Consent ───────────────────────────────────────────────
export async function pgPatientMediaConsent() {
  setTopbar(t('patient.nav.consent'));
  const user = currentUser;
  const patientId = user?.patient_id || user?.id;

  const el = document.getElementById('patient-content');
  el.innerHTML = spinner();

  // Load current consent state — 3s timeout so a hung Fly backend can never
  // wedge the consent page on a spinner. On timeout consentData is null and
  // we fall through to the "no consents yet" path.
  const _timeout = (ms) => new Promise(r => setTimeout(() => r(null), ms));
  const _raceNull = (p) => Promise.race([
    Promise.resolve(p).catch(() => null),
    _timeout(3000),
  ]);
  const consentData = await _raceNull(_mediaFetch(`/api/v1/media/consent/${patientId}`));

  const consents = Array.isArray(consentData) ? consentData : (consentData?.consents || []);

  function consentFor(type) {
    return consents.find(c => c.consent_type === type) || null;
  }

  // consent_type strings MUST match backend validation in media_router.py:
  // "upload_voice" | "upload_text" | "ai_analysis"
  const CONSENT_TYPES = [
    {
      type:        'upload_voice',
      icon:        '🎙',
      title:       'Upload Voice Notes',
      description: 'Record short voice updates about how you\'re feeling, side effects, or treatment questions.',
    },
    {
      type:        'upload_text',
      icon:        '📝',
      title:       'Upload Text Updates',
      description: 'Send written updates — symptom notes, daily check-ins, or questions for your care team.',
    },
    {
      type:        'ai_analysis',
      icon:        '🤖',
      title:       'AI-Assisted Analysis',
      description: 'Allow your voice and text uploads to be analyzed by AI to help your care team understand your reports. AI output is always reviewed by your clinician before it affects your care.',
    },
  ];

  const retentionDays = consentData?.retention_days ?? 365;

  function renderConsentCards() {
    return CONSENT_TYPES.map(ct => {
      const existing = consentFor(ct.type);
      const granted  = existing?.granted === true;
      return `
        <div class="card" style="margin-bottom:14px" id="consent-card-${ct.type}">
          <div class="card-body" style="display:flex;align-items:flex-start;gap:16px;padding:18px 20px">
            <div style="font-size:26px;flex-shrink:0;margin-top:2px">${ct.icon}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:13.5px;font-weight:600;color:var(--text-primary);margin-bottom:4px">${ct.title}</div>
              <div style="font-size:12px;color:var(--text-secondary);line-height:1.6;margin-bottom:12px">${ct.description}</div>
              <div style="display:flex;align-items:center;gap:10px">
                <span id="consent-status-${ct.type}" style="font-size:11.5px;font-weight:600;color:${granted ? 'var(--teal)' : 'var(--text-tertiary)'}">
                  ${granted ? '✓ Consent given' : '○ Not consented'}
                </span>
                <button class="btn ${granted ? 'btn-ghost' : 'btn-primary'} btn-sm"
                        id="consent-btn-${ct.type}"
                        onclick="window._ptToggleConsent('${ct.type}', ${!granted})">
                  ${granted ? 'Revoke' : 'Give Consent'}
                </button>
              </div>
              <div id="consent-msg-${ct.type}" style="display:none;margin-top:8px;font-size:12px"></div>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  el.innerHTML = `
    <div style="margin-bottom:20px">
      <div style="font-size:17px;font-weight:600;color:var(--text-primary);margin-bottom:4px">Media &amp; AI Analysis Consent</div>
      <div style="font-size:12.5px;color:var(--text-secondary)">Control what you share with your care team and how it's used.</div>
    </div>

    ${renderConsentCards()}

    <div class="notice notice-info" style="margin-bottom:20px">
      Your uploads are retained for <strong>${retentionDays} days</strong> after your treatment ends, then deleted.
      You can delete individual uploads at any time before they are used in your clinical record.
    </div>

    <div id="pt-consent-revoke-all-msg" style="display:none;margin-bottom:12px;font-size:12.5px"></div>
    <button class="btn btn-ghost btn-sm" style="color:var(--red,#ef4444);border-color:rgba(239,68,68,0.3)"
            onclick="window._ptRevokeAllConsent()">
      Withdraw All Consent
    </button>
  `;

  window._ptToggleConsent = async function(consentType, grantedValue) {
    const btn    = document.getElementById(`consent-btn-${consentType}`);
    const msgEl  = document.getElementById(`consent-msg-${consentType}`);
    const statEl = document.getElementById(`consent-status-${consentType}`);
    if (btn) { btn.disabled = true; btn.textContent = '…'; }

    try {
      await _mediaFetch('/api/v1/media/consent', {
        method: 'POST',
        body: JSON.stringify({ consent_type: consentType, granted: grantedValue, retention_days: 365 }),
      });

      // Update local cache
      const existing = consents.findIndex(c => c.consent_type === consentType);
      if (existing >= 0) { consents[existing].granted = grantedValue; }
      else { consents.push({ consent_type: consentType, granted: grantedValue }); }

      if (statEl) {
        statEl.textContent = grantedValue ? '✓ Consent given' : '○ Not consented';
        statEl.style.color = grantedValue ? 'var(--teal)' : 'var(--text-tertiary)';
      }
      if (btn) {
        btn.disabled = false;
        btn.className = `btn ${grantedValue ? 'btn-ghost' : 'btn-primary'} btn-sm`;
        btn.textContent = grantedValue ? 'Revoke' : 'Give Consent';
        btn.setAttribute('onclick', `window._ptToggleConsent('${consentType}', ${!grantedValue})`);
      }
      if (msgEl) {
        msgEl.className = 'notice notice-success';
        msgEl.style.display = '';
        msgEl.textContent = grantedValue ? 'Consent marked granted in this portal view.' : 'Consent marked revoked in this portal view.';
        setTimeout(() => { if (msgEl) msgEl.style.display = 'none'; }, 2500);
      }
    } catch (err) {
      if (btn) { btn.disabled = false; btn.textContent = grantedValue ? 'Give Consent' : 'Revoke'; }
      if (msgEl) {
        msgEl.className = 'notice notice-error';
        msgEl.style.display = '';
        msgEl.textContent = `Could not update consent: ${err.message || 'Unknown error'}`;
      }
    }
  };

  window._ptRevokeAllConsent = async function() {
    if (!confirm('Withdraw all consent? This will revoke permission for all upload types.')) return;
    const msgEl = document.getElementById('pt-consent-revoke-all-msg');
    try {
      await Promise.all(CONSENT_TYPES.map(ct =>
        _mediaFetch('/api/v1/media/consent', {
          method: 'POST',
          body: JSON.stringify({ consent_type: ct.type, granted: false, retention_days: 365 }),
        }).catch(() => null)
      ));
      // Reload page to reflect state
      await pgPatientMediaConsent();
    } catch (err) {
      if (msgEl) {
        msgEl.className = 'notice notice-error';
        msgEl.style.display = '';
        msgEl.textContent = `Could not revoke all consent: ${err.message || 'Unknown error'}`;
      }
    }
  };
}

// ── Media Upload ──────────────────────────────────────────────────────────────
export async function pgPatientMediaUpload() {
  setTopbar(t('patient.nav.updates'));
  const user = currentUser;
  const patientId = user?.patient_id || user?.id;

  const el = document.getElementById('patient-content');
  el.innerHTML = spinner();

  // Load consent state and courses in parallel — 3s timeout so a hung Fly
  // backend can never wedge the upload page on a spinner.
  const _timeout = (ms) => new Promise(r => setTimeout(() => r(null), ms));
  const _raceNull = (p) => Promise.race([
    Promise.resolve(p).catch(() => null),
    _timeout(3000),
  ]);
  let consentData = null;
  let coursesRaw  = null;
  try {
    [consentData, coursesRaw] = await Promise.all([
      _raceNull(_mediaFetch(`/api/v1/media/consent/${patientId}`)),
      _raceNull(api.patientPortalCourses()),
    ]);
  } catch (_e) { /* non-fatal */ }

  const consents  = Array.isArray(consentData) ? consentData : (consentData?.consents || []);
  const courses   = Array.isArray(coursesRaw) ? coursesRaw : [];

  function isConsentGranted(type) {
    const c = consents.find(x => x.consent_type === type);
    return c?.granted === true;
  }

  // consent_type strings match backend: "upload_text" | "upload_voice"
  const hasAnyConsent = isConsentGranted('upload_voice') || isConsentGranted('upload_text');

  const courseOptions = courses.length > 0
    ? `<option value="">— Not linked to a course —</option>` +
      courses.map(c => `<option value="${_hdEsc(c.id)}">${_hdEsc(c.condition_slug) || 'Course'} (${_hdEsc(c.status) || 'active'})</option>`).join('')
    : `<option value="">No courses found</option>`;

  // Media recorder state
  let _mediaRecorder   = null;
  let _recordedChunks  = [];
  let _recordingTimer  = null;
  let _recordingSeconds = 0;
  let _recordedBlob    = null;
  let _selectedType    = 'text';

  el.innerHTML = `
    <div style="margin-bottom:20px">
      <div style="font-size:17px;font-weight:600;color:var(--text-primary);margin-bottom:4px">Send an Update to Your Care Team</div>
      <div style="font-size:12.5px;color:var(--text-secondary)">Clinical review timing depends on portal workflow before your update is used in your record.</div>
    </div>

    <div style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2);border-radius:8px;padding:10px 14px;margin-bottom:16px;display:flex;align-items:flex-start;gap:10px">
      <span style="font-size:15px;flex-shrink:0">🚨</span>
      <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.6">
        <strong style="color:var(--text-primary)">Not for emergencies.</strong>
        If you are in immediate danger or experiencing a medical emergency, call <strong>000 / 911 / 999</strong> or go to your nearest emergency department. This portal is not monitored in real time.
      </div>
    </div>

    ${!hasAnyConsent ? `
    <div class="card" style="margin-bottom:20px;border-color:rgba(245,158,11,0.4);background:rgba(245,158,11,0.04)">
      <div class="card-body" style="display:flex;align-items:center;gap:14px;padding:18px 20px">
        <div style="font-size:22px">⚠</div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:3px">Media uploads not enabled</div>
          <div style="font-size:12px;color:var(--text-secondary)">You haven't enabled media uploads yet.</div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="window._navPatient('pt-media-consent')">Enable Consent →</button>
      </div>
    </div>` : ''}

    <!-- Upload type selector -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
      <div class="card" id="upload-type-text" style="cursor:pointer;border-color:var(--teal);background:rgba(0,212,188,0.04)"
           onclick="window._ptSelectUploadType('text')" role="button" tabindex="0">
        <div class="card-body" style="display:flex;align-items:center;gap:12px;padding:14px 16px">
          <span style="font-size:22px">📝</span>
          <div>
            <div style="font-size:13px;font-weight:600;color:var(--text-primary)">Text Update</div>
            <div style="font-size:11.5px;color:var(--text-tertiary)">Written note</div>
          </div>
        </div>
      </div>
      <div class="card" id="upload-type-voice" style="cursor:pointer"
           onclick="window._ptSelectUploadType('voice')" role="button" tabindex="0">
        <div class="card-body" style="display:flex;align-items:center;gap:12px;padding:14px 16px">
          <span style="font-size:22px">🎙</span>
          <div>
            <div style="font-size:13px;font-weight:600;color:var(--text-primary)">Voice Note</div>
            <div style="font-size:11.5px;color:var(--text-tertiary)">Audio recording</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Text upload form -->
    <div id="upload-form-text" class="card" style="margin-bottom:16px">
      <div class="card-body" style="padding:20px">
        <div class="form-group" style="margin-bottom:14px">
          <label class="form-label">Link to a treatment course (optional)</label>
          <select id="upload-text-course" class="form-control" style="font-size:13px">
            ${courseOptions}
          </select>
        </div>
        <div class="form-group" style="margin-bottom:14px">
          <label class="form-label">Your update</label>
          <textarea id="upload-text-content" class="form-control" rows="5"
                    maxlength="2000" placeholder="How are you feeling? Note any symptoms, side effects, or questions."
                    style="resize:vertical;font-size:13px"
                    oninput="document.getElementById('upload-text-counter').textContent=this.value.length+'/2000'"></textarea>
          <div id="upload-text-counter" style="font-size:11px;color:var(--text-tertiary);text-align:right;margin-top:4px">0/2000</div>
        </div>
        <div class="form-group" style="margin-bottom:6px">
          <label class="form-label">What's this about? (optional)</label>
          <input type="text" id="upload-text-note" class="form-control" placeholder="e.g. After session 5, Side effect question"
                 style="font-size:13px">
        </div>
      </div>
    </div>

    <!-- Voice upload form -->
    <div id="upload-form-voice" class="card" style="margin-bottom:16px;display:none">
      <div class="card-body" style="padding:20px">
        <div class="form-group" style="margin-bottom:14px">
          <label class="form-label">Link to a treatment course (optional)</label>
          <select id="upload-voice-course" class="form-control" style="font-size:13px">
            ${courseOptions}
          </select>
        </div>
        <div style="margin-bottom:16px">
          <label class="form-label">Record a voice note</label>
          <div style="display:flex;align-items:center;gap:12px;margin-top:8px">
            <button class="btn btn-primary btn-sm" id="pt-record-btn" onclick="window._ptToggleRecording()">
              🎙 Record
            </button>
            <span id="pt-record-timer" style="font-size:13px;font-weight:600;color:var(--teal);display:none">0:00</span>
            <span id="pt-record-ready" style="font-size:12.5px;color:var(--teal);display:none"></span>
          </div>
        </div>
        <div style="margin-bottom:14px">
          <label class="form-label" style="font-size:12px;color:var(--text-tertiary)">Or upload a file instead</label>
          <input type="file" id="upload-voice-file" accept="audio/*" class="form-control"
                 style="font-size:12.5px;margin-top:6px"
                 onchange="window._ptVoiceFileSelected(this)">
        </div>
        <div class="form-group" style="margin-bottom:6px">
          <label class="form-label">What's this about? (optional)</label>
          <input type="text" id="upload-voice-note" class="form-control" placeholder="e.g. After session 5, Side effect question"
                 style="font-size:13px">
        </div>
      </div>
    </div>

    <!-- Consent reminder -->
    <div class="notice notice-info" style="margin-bottom:16px;font-size:12px">
      By uploading, you confirm you have given consent for this upload type. Clinical review timing depends on portal workflow before your update is used in your record.
    </div>

    <!-- Consent warning (shown when submitting without consent) -->
    <div id="pt-upload-consent-warn" style="display:none;margin-bottom:12px"></div>

    <!-- Submit result -->
    <div id="pt-upload-result" style="display:none;margin-bottom:16px"></div>

    <button class="btn btn-primary" style="width:100%;padding:12px" id="pt-upload-submit-btn"
            onclick="window._ptSubmitUpload()">
      Send Update
    </button>
  `;

  window._ptSelectUploadType = function(type) {
    _selectedType = type;
    const textCard  = document.getElementById('upload-type-text');
    const voiceCard = document.getElementById('upload-type-voice');
    const textForm  = document.getElementById('upload-form-text');
    const voiceForm = document.getElementById('upload-form-voice');
    const warnEl    = document.getElementById('pt-upload-consent-warn');

    const activeBorder  = 'border-color:var(--teal);background:rgba(0,212,188,0.04)';
    const inactiveBorder = '';

    if (textCard)  textCard.style.cssText  = `cursor:pointer;${type === 'text'  ? activeBorder : inactiveBorder}`;
    if (voiceCard) voiceCard.style.cssText = `cursor:pointer;${type === 'voice' ? activeBorder : inactiveBorder}`;
    if (textForm)  textForm.style.display  = type === 'text'  ? '' : 'none';
    if (voiceForm) voiceForm.style.display = type === 'voice' ? '' : 'none';

    // Immediate consent check — surface the issue before submit, not on submit
    // consent_type strings match backend: "upload_text" | "upload_voice"
    const consentNeeded = type === 'text' ? 'upload_text' : 'upload_voice';
    if (warnEl) {
      if (!isConsentGranted(consentNeeded)) {
        warnEl.className = 'notice notice-warn';
        warnEl.style.display = '';
        warnEl.innerHTML = `${t(type === 'text' ? 'patient.media.consent_warn_text' : 'patient.media.consent_warn_voice')} <a href="#" onclick="window._navPatient('pt-media-consent');return false" style="color:var(--teal)">${t('patient.media.consent_enable')}</a>`;
      } else {
        warnEl.style.display = 'none';
      }
    }
  };

  window._ptToggleRecording = async function() {
    const btn   = document.getElementById('pt-record-btn');
    const timer = document.getElementById('pt-record-timer');
    const ready = document.getElementById('pt-record-ready');

    if (_mediaRecorder && _mediaRecorder.state === 'recording') {
      // Stop recording
      _mediaRecorder.stop();
      clearInterval(_recordingTimer);
      if (btn)   { btn.textContent = '🎙 Record'; btn.className = 'btn btn-primary btn-sm'; }
      if (timer) timer.style.display = 'none';
      return;
    }

    // Start recording
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      _recordedChunks = [];
      _mediaRecorder = new MediaRecorder(stream);
      _mediaRecorder.ondataavailable = e => { if (e.data.size > 0) _recordedChunks.push(e.data); };
      _mediaRecorder.onstop = () => {
        _recordedBlob = new Blob(_recordedChunks, { type: 'audio/webm' });
        stream.getTracks().forEach(t => t.stop());
        const dur = _recordingSeconds;
        if (ready) { ready.style.display = ''; ready.textContent = t('patient.media.recording_ready', { dur }); }
      };
      _recordedChunks = [];
      _recordingSeconds = 0;
      _mediaRecorder.start();

      if (btn)   { btn.textContent = '⏹ Stop'; btn.className = 'btn btn-ghost btn-sm'; }
      if (timer) { timer.style.display = ''; timer.textContent = '0:00'; }
      if (ready) ready.style.display = 'none';

      _recordingTimer = setInterval(() => {
        const timerLive = document.getElementById('pt-record-timer');
        if (!timerLive) { clearInterval(_recordingTimer); _recordingTimer = null; return; }
        _recordingSeconds++;
        const m = Math.floor(_recordingSeconds / 60);
        const s = _recordingSeconds % 60;
        timerLive.textContent = `${m}:${String(s).padStart(2, '0')}`;
      }, 1000);
    } catch (_e) {
      const warnEl = document.getElementById('pt-upload-consent-warn');
      if (warnEl) {
        warnEl.className = 'notice notice-error';
        warnEl.style.display = '';
        warnEl.textContent = t('patient.media.err_mic_denied');
      }
    }
  };

  window._ptVoiceFileSelected = function(input) {
    const ready  = document.getElementById('pt-record-ready');
    const warnEl = document.getElementById('pt-upload-consent-warn');
    if (!input.files || !input.files[0]) return;
    const MAX_BYTES = 52428800; // 50 MB — mirrors backend limit
    if (input.files[0].size > MAX_BYTES) {
      input.value = '';
      _recordedBlob = null;
      if (warnEl) { warnEl.className = 'notice notice-error'; warnEl.style.display = ''; warnEl.textContent = t('patient.media.err_file_size'); }
      if (ready) ready.style.display = 'none';
      return;
    }
    _recordedBlob = input.files[0];
    if (warnEl) warnEl.style.display = 'none';
    if (ready) { ready.style.display = ''; ready.textContent = t('patient.media.file_selected', { name: input.files[0].name, size: (input.files[0].size / 1048576).toFixed(1) }); }
  };

  window._ptSubmitUpload = async function() {
    const resultEl = document.getElementById('pt-upload-result');
    const warnEl   = document.getElementById('pt-upload-consent-warn');
    const submitBtn = document.getElementById('pt-upload-submit-btn');

    // Check consent for selected type; strings match backend: "upload_text" | "upload_voice"
    const consentType = _selectedType === 'text' ? 'upload_text' : 'upload_voice';
    if (!isConsentGranted(consentType)) {
      if (warnEl) {
        warnEl.className = 'notice notice-warn';
        warnEl.style.display = '';
        warnEl.innerHTML = `${t(_selectedType === 'text' ? 'patient.media.consent_submit_text' : 'patient.media.consent_submit_voice')} <a href="#" onclick="window._navPatient('pt-media-consent');return false" style="color:var(--teal)">${t('patient.media.consent_enable')}</a>`;
      }
      return;
    }
    if (warnEl) warnEl.style.display = 'none';

    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Sending…'; }

    try {
      if (_selectedType === 'text') {
        const content   = document.getElementById('upload-text-content')?.value?.trim() || '';
        const courseId  = document.getElementById('upload-text-course')?.value || null;
        const noteLabel = document.getElementById('upload-text-note')?.value?.trim() || '';
        if (!content) {
          if (warnEl) { warnEl.className = 'notice notice-warn'; warnEl.style.display = ''; warnEl.textContent = t('patient.media.err_no_text'); }
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Send Update'; }
          return;
        }
        // consent_type "upload_text" matches backend validation in media_router.py
        const textConsent = consents.find(c => c.consent_type === 'upload_text');
        if (!textConsent?.id) {
          if (warnEl) { warnEl.className = 'notice notice-warn'; warnEl.style.display = ''; warnEl.innerHTML = `${t('patient.media.consent_submit_text')} <a href="#" onclick="window._navPatient('pt-media-consent');return false" style="color:var(--teal)">${t('patient.media.consent_enable')}</a>`; }
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Send Update'; }
          return;
        }
        await _mediaFetch('/api/v1/media/patient/upload/text', {
          method: 'POST',
          body: JSON.stringify({
            text_content:  content,
            course_id:     courseId || undefined,
            patient_note:  noteLabel || undefined,
            consent_id:    textConsent.id,
          }),
        });
      } else {
        // Voice upload via FormData
        if (!_recordedBlob) {
          if (warnEl) { warnEl.className = 'notice notice-warn'; warnEl.style.display = ''; warnEl.textContent = t('patient.media.err_no_audio'); }
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Send Update'; }
          return;
        }
        const courseId  = document.getElementById('upload-voice-course')?.value || null;
        const noteLabel = document.getElementById('upload-voice-note')?.value?.trim() || '';
        // consent_type "upload_voice" matches backend validation in media_router.py
        const voiceConsent = consents.find(c => c.consent_type === 'upload_voice');
        if (!voiceConsent?.id) {
          if (warnEl) { warnEl.className = 'notice notice-warn'; warnEl.style.display = ''; warnEl.innerHTML = `${t('patient.media.consent_submit_voice')} <a href="#" onclick="window._navPatient('pt-media-consent');return false" style="color:var(--teal)">${t('patient.media.consent_enable')}</a>`; }
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Send Update'; }
          return;
        }
        const formData = new FormData();
        formData.append('file', _recordedBlob, 'voice-note.webm');
        if (courseId)  formData.append('course_id',    courseId);
        if (noteLabel) formData.append('patient_note', noteLabel);
        formData.append('consent_id', voiceConsent.id);

        await _mediaFetch('/api/v1/media/patient/upload/audio', {
          method: 'POST',
          body:   formData,
        });
      }

      // Success
      if (resultEl) {
        resultEl.className = 'notice notice-success';
        resultEl.style.display = '';
        resultEl.innerHTML = `
          <div style="font-weight:600;margin-bottom:8px">&#x2713; Update uploaded.</div>
          <div style="font-size:11.5px;line-height:1.7;margin-bottom:10px">
            <strong>What happens next:</strong><br>
            1. Your upload was accepted by the portal.<br>
            2. Care-team review timing depends on clinic workflow and is not guaranteed from this page.<br>
            3. Any returned feedback will appear in your <a href="#" onclick="window._navPatient('pt-media-history');return false" style="color:var(--teal)">Media History</a> when available.
          </div>
          <a href="#" onclick="window._navPatient('pt-media-history');return false" style="color:var(--teal);font-size:12px">View Media History →</a>`;
      }
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Sent ✓'; }
    } catch (err) {
      if (resultEl) {
        resultEl.className = 'notice notice-error';
        resultEl.style.display = '';
        resultEl.textContent = `Could not send update: ${err.message || 'Unknown error'}. Please try again.`;
      }
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Send Update'; }
    }
  };
}

// ── Media History ─────────────────────────────────────────────────────────────
export async function pgPatientMediaHistory() {
  setTopbar(t('patient.nav.feedback'));

  const el = document.getElementById('patient-content');
  el.innerHTML = spinner();

  // 3s timeout so a hung Fly backend can never wedge the page on a spinner.
  // On timeout uploadsRaw is null and we fall through to the empty-history
  // state instead of a hard "Could not load" card.
  const _timeout = (ms) => new Promise(r => setTimeout(() => r(null), ms));
  const _raceNull = (p) => Promise.race([
    Promise.resolve(p).catch(() => null),
    _timeout(3000),
  ]);
  const uploadsRaw = await _raceNull(_mediaFetch('/api/v1/media/patient/uploads'));

  let uploads = Array.isArray(uploadsRaw) ? uploadsRaw : (uploadsRaw?.uploads || []);

  // Sort newest first
  uploads = uploads.slice().sort((a, b) =>
    new Date(b.created_at || 0) - new Date(a.created_at || 0)
  );

  // Check for undismissed red flags
  const hasRedFlag = uploads.some(u => u.has_undismissed_flag === true || u.flag_pending === true);

  // Filter state
  let _typeFilter   = 'all';
  let _statusFilter = 'all';

  const STATUS_META = {
    uploaded:               { label: 'Uploaded',            color: 'var(--text-tertiary)', bg: 'rgba(255,255,255,0.06)' },
    pending_review:         { label: 'Waiting for Review',   color: '#f59e0b',              bg: 'rgba(245,158,11,0.1)'  },
    approved_for_analysis:  { label: 'Approved — In Queue',  color: 'var(--blue)',          bg: 'rgba(74,158,255,0.1)' },
    analyzing:              { label: 'AI Analysis Running',  color: 'var(--blue)',          bg: 'rgba(74,158,255,0.1)' },
    analyzed:               { label: 'Analyzed',             color: 'var(--teal)',          bg: 'rgba(0,212,188,0.08)' },
    clinician_reviewed:     { label: 'Reviewed by Care Team', color: 'var(--green,#22c55e)', bg: 'rgba(34,197,94,0.08)' },
    rejected:               { label: 'Not Progressed',       color: '#94a3b8',              bg: 'rgba(148,163,184,0.08)' },
    reupload_requested:     { label: 'New Upload Requested',  color: '#f97316',              bg: 'rgba(249,115,22,0.08)' },
  };

  // approved_for_analysis added: upload is already in the AI queue, deleting mid-flight
  // causes an orphaned analysis job. Backend also blocks deletes at clinician_reviewed.
  const NON_DELETABLE = new Set(['clinician_reviewed', 'analyzing', 'approved_for_analysis']);

  function statusChip(status) {
    const meta = STATUS_META[status] || { label: status || 'Unknown', color: 'var(--text-tertiary)', bg: 'rgba(255,255,255,0.06)' };
    return `<span style="font-size:10.5px;font-weight:600;padding:2px 9px;border-radius:99px;color:${meta.color};background:${meta.bg};border:1px solid ${meta.color};opacity:0.85">
      ${meta.label}
    </span>`;
  }

  function uploadCardHTML(u, idx) {
    const isVoice     = (u.upload_type || u.media_type || '').toLowerCase().includes('voice') ||
                        (u.upload_type || u.media_type || '').toLowerCase().includes('audio');
    const typeIcon    = isVoice ? '🎙' : '📝';
    const dateStr     = fmtDate(u.created_at || u.uploaded_at);
    const courseName  = u.course_name || u.course_slug || null;
    const notePrev    = (u.patient_note || u.text_content || '').slice(0, 100);
    const status      = u.status || 'uploaded';
    const canDelete   = !NON_DELETABLE.has(status);
    const feedbackReason = u.review_reason || u.feedback || null;
    const durationSec = u.duration_seconds || null;

    return `
      <div class="card" style="margin-bottom:12px" id="media-card-${idx}">
        <div class="card-body" style="padding:16px 18px">
          <div style="display:flex;align-items:flex-start;gap:12px">
            <div style="font-size:20px;flex-shrink:0;margin-top:2px">${typeIcon}</div>
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:5px">
                <span style="font-size:12.5px;font-weight:600;color:var(--text-primary)">${dateStr}</span>
                ${courseName ? `<span style="font-size:11px;color:var(--blue)">· ${_hdEsc(courseName)}</span>` : ''}
                ${durationSec != null ? `<span style="font-size:11px;color:var(--text-tertiary)">${durationSec}s</span>` : ''}
                ${statusChip(status)}
              </div>
              ${notePrev ? `<div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;line-height:1.5">${_hdEsc(notePrev)}</div>` : ''}
              ${feedbackReason ? `
              <div style="font-size:12px;color:var(--teal);background:rgba(0,212,188,0.06);border-left:2px solid var(--teal);padding:8px 10px;border-radius:0 6px 6px 0;margin-bottom:8px;line-height:1.55">
                <strong>Feedback from your care team:</strong> ${_hdEsc(feedbackReason)}
              </div>` : ''}
              <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                ${canDelete ? `<button class="btn btn-ghost btn-sm" id="delete-btn-${idx}" style="color:var(--red,#ef4444);border-color:rgba(239,68,68,0.25);font-size:11px"
                        onclick="window._ptDeleteUpload(${idx}, '${u.id || ''}', this)">Delete</button>` : ''}
              </div>
            </div>
          </div>
        </div>
      </div>`;
  }

  function filteredUploads() {
    return uploads.filter(u => {
      const isVoice = (u.upload_type || u.media_type || '').toLowerCase().includes('voice') ||
                     (u.upload_type || u.media_type || '').toLowerCase().includes('audio');
      const typeOk = _typeFilter === 'all'
        || (_typeFilter === 'text'  && !isVoice)
        || (_typeFilter === 'voice' && isVoice);
      const statusOk = _statusFilter === 'all' || u.status === _statusFilter;
      return typeOk && statusOk;
    });
  }

  function renderList() {
    const listEl = document.getElementById('pt-media-list');
    if (!listEl) return;
    const items = filteredUploads();
    if (items.length === 0) {
      listEl.innerHTML = `
        <div style="text-align:center;padding:48px;color:var(--text-tertiary)">
          <div style="font-size:24px;margin-bottom:12px;opacity:.4">📋</div>
          ${t('patient.media.no_updates')}<br>
          <button class="btn btn-ghost btn-sm" style="margin-top:14px" onclick="window._navPatient('pt-media-upload')">${t('patient.media.send_first')}</button>
        </div>`;
      return;
    }
    listEl.innerHTML = items.map((u, i) => uploadCardHTML(u, i)).join('');
  }

  el.innerHTML = `
    <div style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2);border-radius:8px;padding:9px 14px;margin-bottom:14px;display:flex;align-items:flex-start;gap:10px">
      <span style="font-size:13px;flex-shrink:0">🚨</span>
      <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.5">
        <strong style="color:var(--text-primary)">Not for emergencies.</strong>
        If you are in immediate danger or experiencing a medical emergency, call <strong>000 / 911 / 999</strong> or go to your nearest emergency department. This portal is not monitored in real time.
      </div>
    </div>

    ${hasRedFlag ? `
    <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.35);border-radius:var(--radius-md);padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;gap:12px">
      <span style="font-size:18px">⚠</span>
      <div style="font-size:12.5px;color:var(--text-primary);line-height:1.55">
        <strong>Your care team has flagged an item for follow-up.</strong>
        Please contact your clinic — this is not urgent unless your clinician has called you.
      </div>
      <button class="btn btn-ghost btn-sm" style="flex-shrink:0" onclick="window._navPatient('patient-messages')">Message clinic →</button>
    </div>` : ''}

    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px">
      <div style="display:flex;gap:6px">
        ${['all','text','voice'].map(f => `
          <button class="btn btn-ghost btn-sm" id="pt-type-filter-${f}" style="font-size:11.5px;${_typeFilter === f ? 'background:rgba(0,212,188,0.12);color:var(--teal);border-color:rgba(0,212,188,0.3)' : ''}"
                  onclick="window._ptMediaTypeFilter('${f}')">${f === 'all' ? 'All' : f === 'text' ? '📝 Text' : '🎙 Voice'}</button>
        `).join('')}
      </div>
      <div style="width:1px;height:20px;background:var(--border)"></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${['all','pending_review','clinician_reviewed','rejected'].map(f => `
          <button class="btn btn-ghost btn-sm" id="pt-status-filter-${f}" style="font-size:11.5px;${_statusFilter === f ? 'background:rgba(0,212,188,0.12);color:var(--teal);border-color:rgba(0,212,188,0.3)' : ''}"
                  onclick="window._ptMediaStatusFilter('${f}')">${f === 'all' ? 'All' : (STATUS_META[f]?.label || f)}</button>
        `).join('')}
      </div>
      <div style="margin-left:auto">
        <button class="btn btn-primary btn-sm" onclick="window._navPatient('pt-media-upload')">+ Send Update</button>
      </div>
    </div>

    <div id="pt-media-list"></div>
  `;

  renderList();

  window._ptMediaTypeFilter = function(filter) {
    _typeFilter = filter;
    ['all','text','voice'].forEach(f => {
      const btn = document.getElementById(`pt-type-filter-${f}`);
      if (btn) btn.style.cssText = `font-size:11.5px;${f === filter ? 'background:rgba(0,212,188,0.12);color:var(--teal);border-color:rgba(0,212,188,0.3)' : ''}`;
    });
    renderList();
  };

  window._ptMediaStatusFilter = function(filter) {
    _statusFilter = filter;
    ['all','pending_review','clinician_reviewed','rejected'].forEach(f => {
      const btn = document.getElementById(`pt-status-filter-${f}`);
      if (btn) btn.style.cssText = `font-size:11.5px;${f === filter ? 'background:rgba(0,212,188,0.12);color:var(--teal);border-color:rgba(0,212,188,0.3)' : ''}`;
    });
    renderList();
  };

  window._ptDeleteUpload = async function(idx, uploadId, btnEl) {
    if (!confirm('Delete this upload? This cannot be undone.')) return;
    const id = uploadId || uploads[idx]?.id;
    if (!id) return;
    const card = document.getElementById(`media-card-${idx}`);
    const btn  = btnEl || document.getElementById(`delete-btn-${idx}`);
    if (btn) { btn.disabled = true; btn.textContent = 'Deleting…'; }
    try {
      await _mediaFetch(`/api/v1/media/patient/upload/${id}`, { method: 'DELETE' });
      uploads = uploads.filter(u => u.id !== id);
      renderList();
    } catch (err) {
      if (btn) { btn.disabled = false; btn.textContent = 'Delete'; }
      if (card) {
        const errMsg = document.createElement('div');
        errMsg.className = 'notice notice-error';
        errMsg.style.cssText = 'font-size:11.5px;margin-top:8px';
        errMsg.textContent = `Could not delete: ${err.message || 'Unknown error'}`;
        card.querySelector('.card-body')?.appendChild(errMsg);
        setTimeout(() => errMsg.remove(), 4000);
      }
    }
  };
}

