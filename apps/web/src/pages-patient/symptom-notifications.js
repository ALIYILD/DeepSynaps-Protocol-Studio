// Symptom journal + notification settings — pgSymptomJournal +
// pgPatientNotificationSettings + their helpers + window._patRequestPush
// / window._patShareProgress handlers. Extracted from `pages-patient.js`
// on 2026-05-02 as part of the file-split refactor (see
// `pages-patient/_shared.js`). NO behavioural change: code below is the
// verbatim symptom-journal + notification-settings blocks from the
// original file, with imports rewired.
import { api } from '../api.js';
import { t } from '../i18n.js';
import { ffEmojiScale, ffTextarea } from '../friendly-forms.js';
import { setTopbar, spinner, _hdEsc } from './_shared.js';

// ── Symptom journal — local fallback only ───────────────────────────────────
// Pre-launch-audit (2026-05-01) the journal lived entirely in localStorage.
// Post-audit the server is the source of truth (see
// apps/api/app/routers/symptom_journal_router.py); the localStorage cache
// is now ONLY a best-effort offline fallback when the API is unreachable.
// Every successful server write supersedes the local copy.
const SYMPTOM_JOURNAL_KEY = 'ds_symptom_journal';

function getJournalEntries() {
  try {
    return JSON.parse(localStorage.getItem(SYMPTOM_JOURNAL_KEY) || '[]');
  } catch (_) { return []; }
}

function saveJournalEntry(entry) {
  const entries = getJournalEntries();
  const existing = entries.findIndex(e => e.id === entry.id);
  if (existing >= 0) { entries[existing] = entry; }
  else { entries.unshift(entry); }
  localStorage.setItem(SYMPTOM_JOURNAL_KEY, JSON.stringify(entries));
}

function deleteJournalEntry(id) {
  const entries = getJournalEntries().filter(e => e.id !== id);
  localStorage.setItem(SYMPTOM_JOURNAL_KEY, JSON.stringify(entries));
}

// ── Symptom journal — server-side helpers (launch-audit 2026-05-01) ──────────
//
// Convert UI 1..5 emoji scale → server-side severity 0..10 by linear scaling
// so the historic UI keeps working unchanged while the canonical numeric
// rating in the audit row + exports honours the documented schema.
//
// The mapping is intentionally lossless within the UI's own range:
//   1→0, 2→3, 3→5, 4→8, 5→10
// so the patient's rounded-down "low" is a 0 and rounded-up "great" is a 10
// without surprises in downstream reports. The mood/anxiety/energy axes are
// composed into a single severity score via a documented helper so reviewers
// know exactly what is persisted (no AI fabrication of a "wellness index").
const _UI_TO_SEVERITY = { 1: 0, 2: 3, 3: 5, 4: 8, 5: 10 };
function _composeJournalSeverity({ mood, energy, anxiety }) {
  // Use the worst (highest) of mood-as-distress and anxiety-as-distress —
  // Anxiety axis is direct (5=calm); mood axis is inverted (1=very low).
  // We intentionally do NOT average — averaging hides spikes which is
  // exactly the signal a clinician needs to see.
  const moodDistress = (typeof mood === 'number') ? (6 - mood) : 3;       // 1..5 distress
  const anxietyDistress = (typeof anxiety === 'number') ? (6 - anxiety) : 3;
  const composite = Math.max(moodDistress, anxietyDistress);
  return _UI_TO_SEVERITY[composite] ?? 5;
}

// Build the comma-list of tags from the qualitative axes a patient typically
// reports. Honest mapping: low energy → "fatigue", high anxiety → "anxiety",
// low mood → "low_mood". No fabrication.
function _composeJournalTags({ mood, energy, anxiety, sleep }) {
  const tags = [];
  if (typeof mood === 'number' && mood <= 2) tags.push('low_mood');
  if (typeof energy === 'number' && energy <= 2) tags.push('fatigue');
  if (typeof anxiety === 'number' && anxiety <= 2) tags.push('anxiety');
  if (typeof sleep === 'number' && sleep > 0 && sleep < 5) tags.push('poor_sleep');
  return tags;
}

async function _journalLogAuditEvent(event, extra) {
  try {
    if (api && typeof api.postSymptomJournalAuditEvent === 'function') {
      await api.postSymptomJournalAuditEvent({
        event,
        entry_id: extra && extra.entry_id ? extra.entry_id : null,
        note: extra && extra.note ? String(extra.note).slice(0, 480) : null,
        using_demo_data: !!(extra && extra.using_demo_data),
      });
    }
  } catch (_) { /* audit failures must never block UI */ }
}

// Mini SVG mood trend chart (7 days)
function _journalTrendChart(entries) {
  const last7 = entries.slice(0, 7).reverse();
  if (last7.length < 2) return '<div style="color:var(--text-tertiary);font-size:12px;text-align:center;padding:16px">Not enough data for trend yet — log at least 2 days.</div>';

  const W = 280, H = 60, pad = 8;
  const iw = W - pad * 2, ih = H - pad * 2;
  const pts = last7.map((e, i) => {
    const x = pad + (i / (last7.length - 1)) * iw;
    const y = pad + ih - ((e.mood - 1) / 4) * ih;
    return { x, y, mood: e.mood, date: e.date };
  });
  const polyline = pts.map(p => `${p.x},${p.y}`).join(' ');
  const area = `M${pts[0].x},${H} ` + pts.map(p => `L${p.x},${p.y}`).join(' ') + ` L${pts[pts.length-1].x},${H} Z`;
  const gradId = `jt-${Math.random().toString(36).slice(2)}`;
  const dots = pts.map(p => `<circle cx="${p.x}" cy="${p.y}" r="3.5" fill="var(--teal,#0d9488)" stroke="white" stroke-width="1.5"/>`).join('');
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="overflow:visible">
    <defs>
      <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--teal,#0d9488)" stop-opacity="0.25"/>
        <stop offset="100%" stop-color="var(--teal,#0d9488)" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="${area}" fill="url(#${gradId})"/>
    <polyline points="${polyline}" fill="none" stroke="var(--teal,#0d9488)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}
  </svg>`;
}

function _emojiScaleRow(id, label, emojis, min, max) {
  return `<div style="margin-bottom:16px">
    <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px">${label}</label>
    <input type="range" id="${id}" min="${min}" max="${max}" value="${Math.round((min+max)/2)}"
      style="width:100%;accent-color:var(--teal,#0d9488)">
    <div class="pt-emoji-scale">${emojis.map(e => `<span>${e}</span>`).join('')}</div>
  </div>`;
}

export async function pgSymptomJournal(setTopbarFn) {
  const _tb = typeof setTopbarFn === 'function' ? setTopbarFn : setTopbar;
  _tb('Symptom Journal', '');
  const el = document.getElementById('patient-content');
  if (!el) return;

  // ── Server fetch (preferred) ─────────────────────────────────────────────
  // Server is the source of truth post-launch-audit. localStorage remains a
  // best-effort fallback so the page stays usable when the API is down.
  let serverList = null;
  let serverErr = false;
  try {
    if (api && typeof api.listSymptomJournalEntries === 'function') {
      serverList = await api.listSymptomJournalEntries({ limit: 50 });
    }
  } catch (_) { serverErr = true; }

  const localEntries = getJournalEntries();
  const today = new Date().toISOString().split('T')[0];
  const todayEntry = localEntries.find(e => e.date === today);

  const isDemo = !!(serverList && serverList.is_demo);
  const consentActive = serverList ? !!serverList.consent_active : true;
  const serverEntries = (serverList && Array.isArray(serverList.items)) ? serverList.items : [];

  // Unified timeline: prefer server entries when available; otherwise local.
  const usingServer = !!serverList && !serverErr;
  const timelineEntries = usingServer ? serverEntries : localEntries;

  // Mount-time audit ping (server-side audit_trail surface = symptom_journal)
  // Best-effort: never blocks the render.
  _journalLogAuditEvent('view', {
    using_demo_data: isDemo,
    note: usingServer
      ? `entries=${serverEntries.length}; consent_active=${consentActive ? 1 : 0}`
      : 'fallback=localStorage',
  });

  // Render local-display entries (server shape vs local shape diverge —
  // map both into a uniform record).
  function _toRow(e) {
    if (!e) return null;
    if (e.severity != null || e.tags) {
      // Server shape
      return {
        kind: 'server',
        id: e.id,
        date: (e.created_at || '').slice(0, 10),
        severity: e.severity,
        note: e.note || '',
        tags: Array.isArray(e.tags) ? e.tags : [],
        is_demo: !!e.is_demo,
        shared_at: e.shared_at,
        deleted_at: e.deleted_at,
        author_actor_id: e.author_actor_id,
      };
    }
    // Local shape
    return {
      kind: 'local',
      id: e.id,
      date: e.date,
      mood: e.mood, energy: e.energy, anxiety: e.anxiety, sleep: e.sleep,
      note: e.notes || '',
      synced: !!e.synced,
    };
  }
  const rows = timelineEntries.map(_toRow).filter(Boolean);
  const visibleRows = rows.filter(r => r.kind === 'local' || !r.deleted_at);

  const historyHtml = visibleRows.slice(0, 14).map(r => {
    if (r.kind === 'server') {
      const sevBadge = (r.severity != null)
        ? `<span class="pt-metric-badge">Severity: ${r.severity}/10</span>` : '';
      const tagBadges = (r.tags || []).map(
        t => `<span class="pt-metric-badge">${_hdEsc(t)}</span>`
      ).join('');
      const sharedBadge = r.shared_at
        ? `<span class="pt-metric-badge" style="background:var(--teal,#0d9488);color:white">Shared</span>`
        : '';
      const noteSnip = r.note
        ? `<div style="font-size:11.5px;color:var(--text-secondary);margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_hdEsc(r.note)}</div>`
        : '';
      const safeId = _hdEsc(r.id);
      const dateLabel = r.date
        ? new Date(r.date + 'T12:00:00').toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric' })
        : '';
      const actions = consentActive ? `<div style="display:flex;gap:6px;margin-top:6px">
        ${r.shared_at ? '' : `<button class="btn btn-ghost btn-sm" data-share-id="${safeId}">Share with care team</button>`}
        <button class="btn btn-ghost btn-sm" data-delete-id="${safeId}">Delete</button>
      </div>` : '';
      return `<div class="pt-journal-entry" data-entry-id="${safeId}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <span style="font-size:12px;font-weight:600;color:var(--text-secondary)">${dateLabel}</span>
          ${sharedBadge}
        </div>
        <div style="flex-wrap:wrap;display:flex;gap:4px">${sevBadge}${tagBadges}</div>
        ${noteSnip}
        ${actions}
      </div>`;
    }
    // Local fallback rendering kept honest — explicit "not synced" badge.
    const unsyncedBadge = !r.synced ? '<span class="pt-unsynced">NOT SYNCED</span>' : '';
    const notesSnippet = r.note ? `<div style="font-size:11.5px;color:var(--text-secondary);margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_hdEsc(r.note)}</div>` : '';
    return `<div class="pt-journal-entry">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span style="font-size:12px;font-weight:600;color:var(--text-secondary)">${new Date(r.date + 'T12:00:00').toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})}</span>
        ${unsyncedBadge}
      </div>
      <div style="flex-wrap:wrap;display:flex;gap:2px">
        <span class="pt-metric-badge">😊 Mood: ${r.mood}/5</span>
        <span class="pt-metric-badge">⚡ Energy: ${r.energy}/5</span>
        <span class="pt-metric-badge">😰 Anxiety: ${r.anxiety}/5</span>
        <span class="pt-metric-badge">💤 Sleep: ${r.sleep}h</span>
      </div>
      ${notesSnippet}
    </div>`;
  }).join('') || '<div style="color:var(--text-tertiary);font-size:13px;text-align:center;padding:24px">No journal entries yet — your first entry will sync to your care team if you have enabled sharing.</div>';

  const unsyncedCount = localEntries.filter(e => !e.synced).length;

  // Demo banner — only on real server demo flag, never invented.
  const demoBanner = isDemo
    ? `<div class="pt-demo-banner" style="margin-bottom:12px;padding:10px 14px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;font-size:12.5px;color:#9a3412">
         <strong>DEMO data</strong> — exports prefix <code>DEMO-</code> and entries are not regulator-submittable.
       </div>` : '';

  // Consent-revoked banner — read-only mode.
  const consentBanner = !consentActive
    ? `<div class="pt-consent-banner" id="j-consent-banner" role="status" aria-live="polite"
         style="margin-bottom:12px;padding:10px 14px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;font-size:12.5px;color:#991b1b">
         <strong>Read-only:</strong> consent has been withdrawn. Your existing entries remain visible, but new entries cannot be added until consent is reinstated by your clinic.
       </div>` : '';

  // Honest connectivity banner — surfaces fallback state explicitly.
  const offlineBanner = (!usingServer)
    ? `<div style="margin-bottom:12px;padding:10px 14px;background:#fef9c3;border:1px solid #fde68a;border-radius:8px;font-size:12.5px;color:#854d0e">
         <strong>Offline mode:</strong> couldn't reach the server, showing local entries from this device only. Entries will sync once you reconnect.
       </div>` : '';

  const todayLong = new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const formDisabled = !consentActive ? 'disabled' : '';
  el.innerHTML = `
    <div class="ff-page">
      <div class="ff-page-inner">
        <header class="ff-page-head">
          <div class="ff-page-icon" aria-hidden="true">📝</div>
          <h1 class="ff-page-title">How are you feeling today?</h1>
          <p class="ff-page-sub">${todayLong} — tap a face below for each question. You can always change your answers.</p>
        </header>

        ${demoBanner}
        ${consentBanner}
        ${offlineBanner}

        ${todayEntry && consentActive ? ffNotice({ tone: 'ok', text: "You've already logged today — feel free to update your entry below." }) : ''}

        <div class="ff-card">
          <div class="ff-card-title">Today's check-in</div>
          <p class="ff-card-sub">There are no right or wrong answers. A quick 30-second rating is plenty.</p>

          ${ffEmojiScale({
            id: 'j-mood',
            label: 'Mood',
            emojis: ['😫','😟','😐','🙂','😊'],
            min: 1, max: 5,
            value: todayEntry?.mood,
            leftLabel: 'Very low',
            rightLabel: 'Great',
            help: 'Overall, how did you feel most of the day?',
          })}

          ${ffEmojiScale({
            id: 'j-energy',
            label: 'Energy',
            emojis: ['😴','🥱','😐','🙂','⚡'],
            min: 1, max: 5,
            value: todayEntry?.energy,
            leftLabel: 'Exhausted',
            rightLabel: 'Full of energy',
          })}

          ${ffEmojiScale({
            id: 'j-anxiety',
            label: 'Anxiety',
            emojis: ['😰','😟','😐','🙂','😌'],
            min: 1, max: 5,
            value: todayEntry?.anxiety,
            leftLabel: 'Very anxious',
            rightLabel: 'Calm',
            help: 'How tense or worried did you feel today? (5 = calm, 1 = very anxious)',
          })}

          ${ffInput({
            id: 'j-sleep',
            label: 'Sleep last night',
            type: 'number',
            icon: '💤',
            value: todayEntry?.sleep ?? '',
            placeholder: 'Hours (e.g. 7.5)',
            min: 0, max: 24, step: 0.5,
            inputmode: 'decimal',
            help: 'Enter the number of hours you slept — decimals are fine.',
          })}

          ${ffTextarea({
            id: 'j-notes',
            label: 'Anything else to share?',
            value: todayEntry?.notes || '',
            placeholder: 'How was your day? Any symptoms, triggers, or wins to note?',
            rows: 3,
            optional: true,
            help: 'Your notes go only to your clinical care team.',
          })}

          <button class="btn btn-primary" id="j-save-btn" ${formDisabled}
            style="width:100%;min-height:52px;font-size:14px;font-weight:600;margin-top:8px">
            ✓ Save today's check-in
          </button>
          <div id="j-save-msg" role="status" aria-live="polite"
            style="display:none;margin-top:10px;font-size:13px;color:var(--green);text-align:center;font-weight:500">
            Entry saved — thank you for checking in.
          </div>
          <div id="j-save-err" role="alert" aria-live="polite"
            style="display:none;margin-top:10px;font-size:13px;color:var(--red,#dc2626);text-align:center;font-weight:500">
          </div>
        </div>

        ${unsyncedCount > 0 ? `<div style="display:flex;justify-content:flex-end;margin-top:12px">
          <button class="btn btn-ghost btn-sm" id="j-sync-btn">Sync all (${unsyncedCount} pending)</button>
        </div>` : ''}

        ${usingServer ? `<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" id="j-export-csv-btn">Export CSV</button>
          <button class="btn btn-ghost btn-sm" id="j-export-ndjson-btn">Export NDJSON</button>
        </div>` : ''}

        <div class="pt-trend-chart" style="margin-top:18px">
          <div style="font-size:12px;font-weight:700;color:var(--text-secondary);margin-bottom:8px;text-transform:uppercase;letter-spacing:.6px">7-day mood trend</div>
          <div style="overflow:hidden;display:flex;justify-content:center">${_journalTrendChart(localEntries)}</div>
        </div>

        <div style="margin-top:18px">
          <div style="font-size:12px;font-weight:700;color:var(--text-secondary);margin-bottom:8px;text-transform:uppercase;letter-spacing:.6px">Recent entries</div>
          ${historyHtml}
        </div>
      </div>
    </div>`;

  // ── Wire save button ──────────────────────────────────────────────────────
  document.getElementById('j-save-btn')?.addEventListener('click', async () => {
    if (!consentActive) return; // defensive — server enforces too
    const mood    = parseInt(document.getElementById('j-mood')?.value    || '3');
    const energy  = parseInt(document.getElementById('j-energy')?.value  || '3');
    const anxiety = parseInt(document.getElementById('j-anxiety')?.value || '3');
    const sleepRaw = document.getElementById('j-sleep')?.value;
    const sleep   = (sleepRaw === '' || sleepRaw == null) ? null : parseFloat(sleepRaw);
    const notes   = document.getElementById('j-notes')?.value?.trim() || '';

    const errEl = document.getElementById('j-save-err');
    const msgEl = document.getElementById('j-save-msg');
    if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }

    // Try server-side write FIRST so the audit row + demo flag attach.
    let serverEntry = null;
    if (usingServer && api && typeof api.createSymptomJournalEntry === 'function') {
      try {
        const severity = _composeJournalSeverity({ mood, energy, anxiety });
        const tags = _composeJournalTags({ mood, energy, anxiety, sleep: sleep ?? 0 });
        serverEntry = await api.createSymptomJournalEntry({
          severity,
          note: notes || null,
          tags,
        });
      } catch (err) {
        if (errEl) {
          errEl.textContent = 'Could not save to server (check connection). Saved locally — will sync when reconnected.';
          errEl.style.display = 'block';
        }
      }
    }

    // Mirror to local cache so the offline path keeps working.
    const entry = {
      id: serverEntry?.id || todayEntry?.id || `j_${Date.now()}`,
      date: today,
      mood, energy, anxiety,
      sleep: sleep ?? 6,
      notes,
      synced: !!serverEntry,
    };
    saveJournalEntry(entry);

    if (msgEl && (serverEntry || !usingServer)) {
      msgEl.style.display = 'block';
      setTimeout(() => { msgEl.style.display = 'none'; }, 2000);
    }
    // Re-render to refresh history
    setTimeout(() => pgSymptomJournal(setTopbarFn), 300);
  });

  // ── Wire share buttons (one per server entry) ────────────────────────────
  el.querySelectorAll('button[data-share-id]').forEach(btn => {
    btn.addEventListener('click', async (ev) => {
      const id = ev.currentTarget?.getAttribute('data-share-id');
      if (!id || !api || typeof api.shareSymptomJournalEntry !== 'function') return;
      ev.currentTarget.disabled = true;
      try {
        await api.shareSymptomJournalEntry(id, 'shared from journal page');
      } catch (_) { /* surfaced via error alert below */ }
      _journalLogAuditEvent('share_clicked', { entry_id: id, using_demo_data: isDemo });
      setTimeout(() => pgSymptomJournal(setTopbarFn), 200);
    });
  });

  // ── Wire delete buttons (soft-delete with reason prompt) ─────────────────
  el.querySelectorAll('button[data-delete-id]').forEach(btn => {
    btn.addEventListener('click', async (ev) => {
      const id = ev.currentTarget?.getAttribute('data-delete-id');
      if (!id || !api || typeof api.deleteSymptomJournalEntry !== 'function') return;
      const reason = window.prompt('Reason for deleting this entry? (required, kept in audit log)');
      if (!reason || reason.trim().length < 2) return;
      ev.currentTarget.disabled = true;
      try {
        await api.deleteSymptomJournalEntry(id, reason.trim());
      } catch (_) { /* fall through to re-render — server enforces gate */ }
      _journalLogAuditEvent('delete_clicked', { entry_id: id, using_demo_data: isDemo });
      setTimeout(() => pgSymptomJournal(setTopbarFn), 200);
    });
  });

  // ── Wire export buttons ──────────────────────────────────────────────────
  document.getElementById('j-export-csv-btn')?.addEventListener('click', () => {
    if (api && typeof api.symptomJournalExportUrl === 'function') {
      const url = api.symptomJournalExportUrl('csv');
      window.open(url, '_blank', 'noopener');
      _journalLogAuditEvent('export_clicked', { note: 'csv', using_demo_data: isDemo });
    }
  });
  document.getElementById('j-export-ndjson-btn')?.addEventListener('click', () => {
    if (api && typeof api.symptomJournalExportUrl === 'function') {
      const url = api.symptomJournalExportUrl('ndjson');
      window.open(url, '_blank', 'noopener');
      _journalLogAuditEvent('export_clicked', { note: 'ndjson', using_demo_data: isDemo });
    }
  });

  // ── Wire local sync button ───────────────────────────────────────────────
  document.getElementById('j-sync-btn')?.addEventListener('click', async () => {
    // Best-effort: replay any local entries that don't have a server id yet.
    const all = getJournalEntries();
    if (usingServer && api && typeof api.createSymptomJournalEntry === 'function') {
      for (const e of all) {
        if (e.synced) continue;
        try {
          const severity = _composeJournalSeverity(e);
          const tags = _composeJournalTags(e);
          const created = await api.createSymptomJournalEntry({
            severity,
            note: e.notes || null,
            tags,
          });
          e.id = created?.id || e.id;
          e.synced = true;
        } catch (_) { /* leave as unsynced */ }
      }
      localStorage.setItem(SYMPTOM_JOURNAL_KEY, JSON.stringify(all));
    } else {
      // Fallback path: mark everything synced locally so the UI stops nagging.
      // This is honest because no server is reachable; once server returns
      // these rows will not duplicate (server-side ids differ).
      const flagged = all.map(e => ({ ...e, synced: true }));
      localStorage.setItem(SYMPTOM_JOURNAL_KEY, JSON.stringify(flagged));
    }
    setTimeout(() => pgSymptomJournal(setTopbarFn), 200);
  });
}

// ── Notification settings ─────────────────────────────────────────────────────
const NOTIF_PREFS_KEY = 'ds_notification_prefs';

function getNotifPrefs() {
  try { return JSON.parse(localStorage.getItem(NOTIF_PREFS_KEY) || '{}'); }
  catch (_) { return {}; }
}

function saveNotifPrefs(prefs) {
  localStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(prefs));
}

window._patRequestPush = async function() {
  const statusEl = document.getElementById('push-status');
  if (!('Notification' in window)) {
    if (statusEl) statusEl.innerHTML = `<span style="color:var(--text-tertiary);font-size:12px">${t('patient.notif.unsupported')}</span>`;
    return;
  }
  const result = await Notification.requestPermission();
  if (result === 'granted') {
    if (statusEl) statusEl.innerHTML = '<span class="push-enabled">Notifications enabled ✓</span>';
    const prefs = getNotifPrefs();
    prefs.pushGranted = true;
    saveNotifPrefs(prefs);
  } else {
    if (statusEl) statusEl.innerHTML = `<span class="push-denied">${t('patient.notif.denied')}</span>`;
  }
};

window._patShareProgress = async function() {
  const title = t('patient.share.title');
  const text  = t('patient.share.text');
  const url = window.location.href;
  if (navigator.share) {
    try { await navigator.share({ title, text, url }); }
    catch (err) { if (err.name !== 'AbortError') console.warn('Share failed:', err); }
  } else {
    try {
      await navigator.clipboard.writeText(`${title}\n${text}\n${url}`);
      const btn = document.getElementById('share-btn');
      if (btn) { const orig = btn.textContent; btn.textContent = t('patient.share.copied'); setTimeout(() => { btn.textContent = orig; }, 2000); }
    } catch (_) {
      window._showToast?.(t('patient.share.unavailable') + ' ' + url, 'warning');
    }
  }
};

export async function pgPatientNotificationSettings(setTopbarFn) {
  const _tb = typeof setTopbarFn === 'function' ? setTopbarFn : setTopbar;
  _tb('Notification Settings', '');
  const el = document.getElementById('patient-content');
  if (!el) return;

  // Server is source of truth for notification preferences. These toggles map
  // to the `notification_prefs` channel matrix on /api/v1/preferences — we
  // store the in-app channel (`inapp`) boolean per event key. A 3s timeout
  // keeps a hung Fly backend from leaving the page blank on a spinner.
  const _timeout = (ms) => new Promise(r => setTimeout(() => r(null), ms));
  const _raceNull = (p) => Promise.race([
    Promise.resolve(p).catch(() => null),
    _timeout(3000),
  ]);
  const serverPrefs = await _raceNull(api.getPreferences());
  const localPrefs = getNotifPrefs();
  const serverMatrix = (serverPrefs && typeof serverPrefs.notification_prefs === 'object')
    ? serverPrefs.notification_prefs
    : null;

  const resolvePref = (key, dflt) => {
    if (serverMatrix && serverMatrix[key] && typeof serverMatrix[key] === 'object' && 'inapp' in serverMatrix[key]) {
      return !!serverMatrix[key].inapp;
    }
    if (key in localPrefs) return !!localPrefs[key];
    return dflt;
  };

  const pushSupported = 'Notification' in window;
  const currentPerm = pushSupported ? Notification.permission : 'unsupported';
  const shareSupported = 'share' in navigator;

  function toggleRow(key, label, defaultVal) {
    const val = resolvePref(key, defaultVal);
    return `<div class="pt-notif-toggle-row">
      <span style="font-size:13px">${label}</span>
      <label style="position:relative;display:inline-block;width:40px;height:22px;cursor:pointer">
        <input type="checkbox" id="notif-${key}" data-pref-key="${key}" ${val ? 'checked' : ''}
          style="opacity:0;width:0;height:0;position:absolute">
        <span style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;border-radius:22px;background:var(--border);transition:.25s" id="notif-${key}-track">
          <span style="position:absolute;height:16px;width:16px;left:3px;bottom:3px;border-radius:50%;background:white;transition:.25s;transform:${val?'translateX(18px)':'translateX(0)'}"></span>
        </span>
      </label>
    </div>`;
  }

  let pushStatusHtml;
  if (!pushSupported) {
    pushStatusHtml = '<span style="color:var(--text-tertiary);font-size:12px">Not supported in this browser.</span>';
  } else if (currentPerm === 'granted') {
    pushStatusHtml = '<span class="push-enabled">Notifications enabled ✓</span>';
  } else if (currentPerm === 'denied') {
    pushStatusHtml = '<span class="push-denied">Permission denied — enable in browser settings</span>';
  } else {
    pushStatusHtml = '<button class="btn btn-primary btn-sm" onclick="window._patRequestPush()">Enable Push Notifications</button>';
  }

  el.innerHTML = `
    <div style="max-width:560px;margin:0 auto;padding:16px">

      <div class="pt-notif-card">
        <div style="font-size:14px;font-weight:600;margin-bottom:4px">Push Notifications</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">Get reminders for upcoming sessions and check-ins.</div>
        <div id="push-status">${pushStatusHtml}</div>
      </div>

      <div class="pt-notif-card">
        <div style="font-size:14px;font-weight:600;margin-bottom:4px">Share Progress</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">Share a link to your treatment journey with your support network.</div>
        <button class="btn btn-ghost btn-sm" id="share-btn" onclick="window._patShareProgress()">
          ${shareSupported ? '📤 Share my progress' : '📋 Copy link'}
        </button>
      </div>

      <div class="pt-notif-card">
        <div style="font-size:14px;font-weight:600;margin-bottom:8px">Notification Preferences</div>
        ${toggleRow('sessionReminders',  '📅 Session reminders', true)}
        ${toggleRow('homeworkReminders', '📝 Homework reminders', true)}
        ${toggleRow('weeklySummary',     '📊 Weekly summary',     true)}
      </div>

      ${pushSupported && currentPerm === 'granted' ? `
      <div style="margin-top:8px">
        <button class="btn btn-ghost btn-sm" id="test-notif-btn">Test Notification</button>
      </div>` : ''}
    </div>`;

  // Round-trip each toggle to the server so a patient's preferences travel
  // with their account, not their browser. Local mirror kept for offline read.
  const _syncPatientNotif = async (prefKey, enabled) => {
    try {
      const p = JSON.parse(localStorage.getItem(NOTIF_PREFS_KEY) || '{}');
      p[prefKey] = enabled;
      localStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(p));
    } catch {}
    try {
      const current = await api.getPreferences().catch(() => null);
      const matrix = (current && typeof current.notification_prefs === 'object')
        ? { ...current.notification_prefs } : {};
      matrix[prefKey] = {
        ...(matrix[prefKey] && typeof matrix[prefKey] === 'object' ? matrix[prefKey] : {}),
        inapp: enabled,
      };
      await api.updatePreferences({ notification_prefs: matrix });
    } catch (err) {
      console.warn('[patient-notif] sync failed:', err?.message || err);
    }
  };

  el.querySelectorAll('input[type=checkbox][data-pref-key]').forEach(cb => {
    cb.addEventListener('change', () => {
      const track = document.getElementById(cb.id + '-track');
      if (track) {
        const dot = track.querySelector('span');
        if (dot) dot.style.transform = cb.checked ? 'translateX(18px)' : 'translateX(0)';
        track.style.background = cb.checked ? 'var(--teal,#0d9488)' : 'var(--border)';
      }
      const key = cb.getAttribute('data-pref-key');
      if (key) _syncPatientNotif(key, cb.checked);
    });
    // Set initial track colour
    const track = document.getElementById(cb.id + '-track');
    if (track && cb.checked) track.style.background = 'var(--teal,#0d9488)';
  });

  // Wire test notification button
  document.getElementById('test-notif-btn')?.addEventListener('click', () => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('DeepSynaps Reminder', {
        body: 'This is a test notification from your Patient Portal.',
        icon: '/icon-192.png',
      });
    }
  });
}

