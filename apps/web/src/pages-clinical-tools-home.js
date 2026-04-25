// ─────────────────────────────────────────────────────────────────────────────
// pages-clinical-tools-home.js — Home Programs & Task Assignment workflow
// (extracted from pages-clinical-tools.js for code-splitting).
// ─────────────────────────────────────────────────────────────────────────────
import { api } from "./api.js";
import {
  CONDITION_HOME_TEMPLATES,
  buildRankedHomeSuggestions,
  confidenceTierFromScore,
  resolveConIdsFromCourse,
} from "./home-program-condition-templates.js";
import {
  mergePatientTasksFromServer,
  mergeParsedMutationIntoLocalTask,
  parseHomeProgramTaskMutationResponse,
  markSyncFailed,
  SYNC_STATUS,
} from "./home-program-task-sync.js";
import { _dsToast } from "./pages-clinical-tools-shared.js";

// ─────────────────────────────────────────────────────────────────────────────
// pgHomePrograms — Clinician Home Programs & Task Assignment Workflow
// ─────────────────────────────────────────────────────────────────────────────
export async function pgHomePrograms(setTopbar, navigate) {
  setTopbar('Home Programs', '<button class="btn btn-sm" onclick="window._hpShowPatientView?.()">Patient View</button>');

  const el = document.getElementById('content');
  if (!el) return;
  el.innerHTML = '<div class="hp-loading">Loading home programs\u2026</div>';

  // ── Storage helpers ──────────────────────────────────────────────────────
  const _ls    = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch { return d; } };
  const _lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const _esc   = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  const _clinKey  = pid => 'ds_clinician_tasks_' + pid;
  const _patKey   = pid => 'ds_homework_tasks_' + pid;
  const _compKey  = pid => 'ds_task_completions_' + pid;
  const _knownKey = 'ds_clinician_tasks_all_patients';
  const _tplKey   = 'ds_home_task_templates';

  const _registerPid = pid => {
    const known = _ls(_knownKey, []);
    if (!known.includes(pid)) { known.push(pid); _lsSet(_knownKey, known); }
  };
  const _getAllKnownPids = () => _ls(_knownKey, ['pt-001', 'pt-002', 'pt-003']);

  // Bridge: write task to patient-facing storage so portal sees it immediately
  const _bridgeToPatient = (pid, task) => {
    const patTasks = _ls(_patKey(pid), []);
    const idx = patTasks.findIndex(t => t.id === task.id);
    const patTask = {
      // Clinician fields
      id: task.id, title: task.title, type: task.type,
      instructions: task.instructions || '',
      dueDate: task.dueDate || '', frequency: task.frequency || 'once',
      courseId: task.courseId || '', status: task.status || 'active',
      assignedAt: task.assignedAt, reason: task.reason || '',
      homeProgramSelection: task.homeProgramSelection || undefined,
      // Patient-portal compatible aliases (pgPatientCourse reads these)
      description: task.instructions || task.reason || '',
      freq: task.frequency || 'once',
      done: idx >= 0 ? (patTasks[idx].done || false) : false,
      completedAt: idx >= 0 ? (patTasks[idx].completedAt || null) : null,
      completionNote: idx >= 0 ? (patTasks[idx].completionNote || '') : '',
    };
    if (idx >= 0) patTasks[idx] = { ...patTasks[idx], ...patTask };
    else patTasks.push(patTask);
    _lsSet(_patKey(pid), patTasks);
  };

  /** Parse mutation response + merge into local task; keeps transport fields out of persisted state. */
  const _hpApplyMutationSync = (localTask, resBody) => {
    const mutation = parseHomeProgramTaskMutationResponse(resBody);
    const merged = mergeParsedMutationIntoLocalTask(localTask, mutation);
    return { merged, mutation };
  };

  const _saveTask = (task, useCreate = false) => {
    const pid = task.patientId;
    const now = new Date().toISOString();
    const withMeta = {
      ...task,
      clientUpdatedAt: task.clientUpdatedAt || now,
      _syncStatus: SYNC_STATUS.SYNCING,
    };
    const tasks = _ls(_clinKey(pid), []);
    const idx = tasks.findIndex(t => t.id === withMeta.id);
    if (idx >= 0) tasks[idx] = withMeta; else tasks.push(withMeta);
    _lsSet(_clinKey(pid), tasks);
    _registerPid(pid);
    _bridgeToPatient(pid, withMeta);
    import('./api.js').then(({ api: sdk }) => {
      const canUpsert = typeof sdk.upsertHomeProgramTask === 'function';
      const canCreate = typeof sdk.createHomeProgramTask === 'function';
      const canMutate = typeof sdk.mutateHomeProgramTask === 'function';
      if (!canMutate && !canUpsert && !(useCreate && canCreate)) return null;
      const syncPromise = canMutate
        ? sdk.mutateHomeProgramTask(withMeta)
        : (useCreate && canCreate ? sdk.createHomeProgramTask(withMeta) : sdk.upsertHomeProgramTask(withMeta));
      return syncPromise.then(resOrMutation => {
        const merged = canMutate
          ? mergeParsedMutationIntoLocalTask(withMeta, resOrMutation)
          : _hpApplyMutationSync(withMeta, resOrMutation).merged;
        const arr = _ls(_clinKey(pid), []);
        const j = arr.findIndex(t => t.id === merged.id);
        if (j >= 0) arr[j] = merged; else arr.push(merged);
        _lsSet(_clinKey(pid), arr);
        _bridgeToPatient(pid, merged);
        _allTasks = _loadAllTasks();
        renderPage();
      }).catch((err) => {
        const body = err.body || {};
        if (err.status === 409 && body.code === 'sync_conflict') {
          const d = body.details || {};
          const serverTask = d.serverTask;
          const conflicted = {
            ...withMeta,
            _syncStatus: SYNC_STATUS.CONFLICT,
            _conflictServerTask: serverTask || null,
            _syncConflictReason: 'sync_conflict_response',
            serverTaskId: d.serverTaskId || (serverTask && serverTask.serverTaskId),
            lastSyncedServerRevision: d.serverRevision != null ? d.serverRevision : withMeta.lastSyncedServerRevision,
          };
          const arr = _ls(_clinKey(pid), []);
          const j = arr.findIndex(t => t.id === conflicted.id);
          if (j >= 0) arr[j] = conflicted; else arr.push(conflicted);
          _lsSet(_clinKey(pid), arr);
          _bridgeToPatient(pid, conflicted);
          _allTasks = _loadAllTasks();
          renderPage();
          window._showNotifToast?.({
            title: 'Sync conflict',
            body: 'This task was updated elsewhere. Open the row menu to keep your edits or the server copy.',
            severity: 'warn',
          });
          return;
        }
        const failed = markSyncFailed(withMeta);
        const arr = _ls(_clinKey(pid), []);
        const j = arr.findIndex(t => t.id === failed.id);
        if (j >= 0) arr[j] = failed; else arr.push(failed);
        _lsSet(_clinKey(pid), arr);
        _bridgeToPatient(pid, failed);
        _allTasks = _loadAllTasks();
        renderPage();
      });
    }).catch(() => {});
  };

  const _retryPendingSyncs = async () => {
    const { api: sdk } = await import('./api.js');
    if (
      typeof sdk.mutateHomeProgramTask !== 'function' &&
      typeof sdk.upsertHomeProgramTask !== 'function' &&
      typeof sdk.createHomeProgramTask !== 'function'
    ) return;
    const pids = _getAllKnownPids();
    let any = false;
    for (const pid of pids) {
      const arr = _ls(_clinKey(pid), []);
      let changed = false;
      for (let i = 0; i < arr.length; i++) {
        const t = arr[i];
        if (t._syncStatus !== SYNC_STATUS.PENDING) continue;
        try {
          const mutation = typeof sdk.mutateHomeProgramTask === 'function'
            ? await sdk.mutateHomeProgramTask(t)
            : _hpApplyMutationSync(
                t,
                (!t.serverTaskId && typeof sdk.createHomeProgramTask === 'function')
                  ? await sdk.createHomeProgramTask(t)
                  : await sdk.upsertHomeProgramTask(t)
              ).mutation;
          arr[i] = mergeParsedMutationIntoLocalTask(t, mutation);
          changed = true;
          any = true;
          _bridgeToPatient(pid, arr[i]);
          if (typeof sdk.postHomeProgramAuditAction === 'function') {
            sdk.postHomeProgramAuditAction({
              external_task_id: t.id,
              action: 'retry_success',
              server_revision: mutation.revision.serverRevision,
            }).catch(() => {});
          }
        } catch (_) { /* stay pending */ }
      }
      if (changed) _lsSet(_clinKey(pid), arr);
    }
    if (any) {
      _allTasks = _loadAllTasks();
      renderPage();
    }
  };

  const _loadAllTasks = () => {
    const pids = _getAllKnownPids();
    const all = [];
    pids.forEach(pid => {
      const tasks = _ls(_clinKey(pid), []);
      tasks.forEach(t => { if (!t.patientId) t.patientId = pid; all.push(t); });
    });
    return all;
  };

  const _getCompletions = pid => _ls(_compKey(pid), {});

  const _refreshServerCompletionsForPid = async (pid) => {
    try {
      const { api: sdk } = await import('./api.js');
      if (typeof sdk.listHomeProgramTaskCompletions !== 'function') return;
      const rows = await sdk.listHomeProgramTaskCompletions({ patient_id: pid }).catch(() => null);
      if (!Array.isArray(rows) || rows.length === 0) return;

      const tasks = _ls(_clinKey(pid), []);
      const byServerId = Object.create(null);
      rows.forEach((r) => {
        if (r && typeof r === 'object' && r.server_task_id) byServerId[r.server_task_id] = r;
      });
      const comps = _ls(_compKey(pid), {});
      let changed = false;
      tasks.forEach((t) => {
        const sid = t?.serverTaskId;
        if (!sid) return;
        const row = byServerId[sid];
        if (!row) return;
        comps[t.id] = {
          done: !!row.completed,
          completedAt: row.completed_at,
          rating: row.rating ?? undefined,
          difficulty: row.difficulty ?? undefined,
          notes: row.feedback_text ?? undefined,
          media_upload_id: row.media_upload_id ?? undefined,
          _server: true,
        };
        changed = true;
      });
      if (changed) _lsSet(_compKey(pid), comps);
    } catch { /* non-fatal */ }
  };

  const _refreshServerCompletions = async () => {
    const pids = _getAllKnownPids();
    await Promise.allSettled(pids.map((pid) => _refreshServerCompletionsForPid(pid)));
  };

  // ── Task type config ─────────────────────────────────────────────────────
  const TASK_TYPES = [
    { id: 'breathing',    icon: '\uD83D\uDCA8', label: 'Breathing / Relaxation' },
    { id: 'sleep',        icon: '\uD83C\uDF19', label: 'Sleep Routine' },
    { id: 'mood-journal', icon: '\uD83D\uDCD3', label: 'Mood Journal' },
    { id: 'activity',     icon: '\uD83C\uDFC3', label: 'Walking / Activity' },
    { id: 'assessment',   icon: '\uD83D\uDCCB', label: 'Assessment / Check-in' },
    { id: 'media',        icon: '\uD83C\uDFAC', label: 'Watch Video / Audio Guide' },
    { id: 'home-device',  icon: '\uD83E\uDDE0', label: 'Home Device Session' },
    { id: 'caregiver',    icon: '\uD83E\uDD1D', label: 'Caregiver Task' },
    { id: 'pre-session',  icon: '\u26A1',       label: 'Pre-Session Preparation' },
    { id: 'post-session', icon: '\uD83C\uDF3F', label: 'Post-Session Aftercare' },
  ];
  const _typeIcon = id => TASK_TYPES.find(t => t.id === id)?.icon || '\uD83D\uDCDD';
  const _typeName = id => TASK_TYPES.find(t => t.id === id)?.label || id;

  // ── Default templates ────────────────────────────────────────────────────
  const DEFAULT_TEMPLATES = [
    { id: 'tpl-1', title: 'Daily Mood Journal',        type: 'mood-journal',  frequency: 'daily',          instructions: 'Record your mood, energy, and any notable thoughts each morning.',       reason: 'Treatment monitoring' },
    { id: 'tpl-2', title: 'Diaphragmatic Breathing',   type: 'breathing',     frequency: 'daily',          instructions: '10 minutes of slow diaphragmatic breathing. Inhale 4s, hold 2s, exhale 6s.', reason: 'Anxiety/stress regulation' },
    { id: 'tpl-3', title: 'Sleep Hygiene Routine',     type: 'sleep',         frequency: 'daily',          instructions: 'No screens 1h before bed. Same sleep/wake time. Keep room cool and dark.', reason: 'Sleep quality improvement' },
    { id: 'tpl-4', title: '20-Minute Walk',            type: 'activity',      frequency: '3x-week',        instructions: 'Brisk 20-minute walk. Note how you feel before and after.',                reason: 'Mood and neuroplasticity support' },
    { id: 'tpl-5', title: 'Weekly PHQ-9 Check-in',     type: 'assessment',    frequency: 'weekly',         instructions: 'Complete the PHQ-9 questionnaire in your portal.',                        reason: 'Outcome tracking' },
    { id: 'tpl-6', title: 'Home TMS Session',          type: 'home-device',   frequency: 'daily',          instructions: 'Follow device protocol. 20 minutes. Log session in portal after.',         reason: 'Home neuromodulation protocol' },
    { id: 'tpl-7', title: 'Pre-Session Relaxation',    type: 'pre-session',   frequency: 'before-session', instructions: 'Arrive 10 min early. Avoid caffeine 2h before. Complete relaxation exercise.', reason: 'Session preparation' },
    { id: 'tpl-8', title: 'Post-Session Rest',         type: 'post-session',  frequency: 'after-session',  instructions: 'Rest 30 min. Avoid strenuous activity. Note any sensations in journal.',   reason: 'Post-session aftercare' },
  ];
  const _getTemplates = () => {
    const saved = _ls(_tplKey, []);
    const savedById = Object.fromEntries(saved.map(t => [t.id, t]));
    const merged = [];
    const seen = new Set();
    for (const t of [...CONDITION_HOME_TEMPLATES, ...DEFAULT_TEMPLATES]) {
      const u = savedById[t.id] ? { ...t, ...savedById[t.id] } : t;
      if (!seen.has(u.id)) { merged.push(u); seen.add(u.id); }
    }
    for (const t of saved) {
      if (!seen.has(t.id)) { merged.push(t); seen.add(t.id); }
    }
    return merged;
  };

  // ── Template persistence (backend-backed; localStorage = write-through cache) ──
  // Backend is source of truth via /api/v1/home-task-templates.
  // Server row → cached template shape: { id (local), serverTemplateId, ...payload }.
  // The local `id` is preserved across save so default-template overrides keep
  // their well-known id (e.g. 'tpl-1') and bundled defaults remain replaced.
  const _serverRowToCacheItem = row => {
    const payload = (row && typeof row.payload === 'object' && row.payload) || {};
    const localId = payload.id || row.id;
    return {
      ...payload,
      id: localId,
      serverTemplateId: row.id,
      _syncedAt: row.updated_at || new Date().toISOString(),
    };
  };

  const _hydrateTemplatesFromServer = async () => {
    try {
      const { api: sdk } = await import('./api.js');
      if (typeof sdk.listHomeTaskTemplates !== 'function') return;
      const res = await sdk.listHomeTaskTemplates().catch(() => null);
      const items = res && Array.isArray(res.items) ? res.items : [];
      // Server wins on conflicts. Local-only rows (no serverTemplateId) are
      // kept so an offline-saved template is preserved until it can sync.
      const serverItems = items.map(_serverRowToCacheItem);
      const serverIds = new Set(serverItems.map(t => t.id));
      const local = _ls(_tplKey, []);
      const localOnly = local.filter(t => !t.serverTemplateId && !serverIds.has(t.id));
      _lsSet(_tplKey, [...serverItems, ...localOnly]);
    } catch (_) { /* offline or no token — bundled + cached templates still render */ }
  };

  /**
   * Save (create or update) a clinician template. Optimistically writes to
   * localStorage, fires the backend call, and rolls back on failure with a toast.
   *
   * `tpl` shape: { id, title, type, frequency, instructions, reason, conditionId?, conditionName?, category? }
   * If `tpl.serverTemplateId` is set, the server row is PATCHed; otherwise POSTed.
   */
  window._hpSaveTemplate = async (tpl) => {
    if (!tpl || !tpl.id || !tpl.title) return;
    const before = _ls(_tplKey, []);
    const optimistic = { ...tpl };
    const next = before.slice();
    const idx = next.findIndex(t => t.id === optimistic.id);
    if (idx >= 0) next[idx] = { ...next[idx], ...optimistic };
    else next.push(optimistic);
    _lsSet(_tplKey, next);
    renderPage();

    try {
      const { api: sdk } = await import('./api.js');
      if (typeof sdk.createHomeTaskTemplate !== 'function') return; // no backend wired (legacy bundle)
      const { id: _localId, serverTemplateId, _syncedAt, ...rest } = optimistic;
      const payload = { ...rest, id: _localId };
      let row;
      if (serverTemplateId && typeof sdk.updateHomeTaskTemplate === 'function') {
        row = await sdk.updateHomeTaskTemplate(serverTemplateId, { name: optimistic.title, payload });
      } else {
        row = await sdk.createHomeTaskTemplate({ name: optimistic.title, payload });
      }
      const synced = _serverRowToCacheItem(row);
      const arr = _ls(_tplKey, []);
      const j = arr.findIndex(t => t.id === synced.id);
      if (j >= 0) arr[j] = synced; else arr.push(synced);
      _lsSet(_tplKey, arr);
      renderPage();
    } catch (err) {
      // Rollback to pre-save snapshot.
      _lsSet(_tplKey, before);
      renderPage();
      window._showNotifToast?.({
        title: 'Template not saved',
        body: 'Could not save the template to the server. Please try again.',
        severity: 'warn',
      });
    }
  };

  /**
   * Delete a clinician-saved template. Optimistically removes from localStorage,
   * fires the backend DELETE, restores on failure.
   */
  window._hpDeleteTemplate = async (tplId) => {
    if (!tplId) return;
    const before = _ls(_tplKey, []);
    const target = before.find(t => t.id === tplId);
    if (!target) return;
    _lsSet(_tplKey, before.filter(t => t.id !== tplId));
    renderPage();

    try {
      const { api: sdk } = await import('./api.js');
      if (typeof sdk.deleteHomeTaskTemplate !== 'function') return;
      if (target.serverTemplateId) {
        await sdk.deleteHomeTaskTemplate(target.serverTemplateId);
      }
    } catch (err) {
      _lsSet(_tplKey, before);
      renderPage();
      window._showNotifToast?.({
        title: 'Template not deleted',
        body: 'Could not delete the template on the server. Please try again.',
        severity: 'warn',
      });
    }
  };

  let _tplFilter = { cond: 'all', q: '' };
  const _filteredTemplates = () => {
    let list = _getTemplates();
    if (_tplFilter.cond === 'general') list = list.filter(t => !t.conditionId);
    else if (_tplFilter.cond !== 'all') list = list.filter(t => t.conditionId === _tplFilter.cond);
    if (_tplFilter.q) {
      const q = _tplFilter.q.toLowerCase();
      list = list.filter(t =>
        (t.title || '').toLowerCase().includes(q) ||
        (t.conditionName || '').toLowerCase().includes(q) ||
        (t.conditionId || '').toLowerCase().includes(q) ||
        (t.instructions || '').toLowerCase().includes(q) ||
        (t.category || '').toLowerCase().includes(q)
      );
    }
    return list;
  };

  // ── API ──────────────────────────────────────────────────────────────────
  const api = window._api || {};
  const [apiPatients, apiCourses] = await Promise.all([
    api.listPatients?.().catch(() => []) ?? [],
    api.listCourses?.().catch(() => []) ?? [],
  ]);
  const patientMap = {};
  (apiPatients || []).forEach(p => { patientMap[p.id] = p; });
  const coursesByPatient = {};
  (apiCourses || []).forEach(c => {
    if (!coursesByPatient[c.patient_id]) coursesByPatient[c.patient_id] = [];
    coursesByPatient[c.patient_id].push(c);
  });

  // ── Migrate legacy global key to per-patient keys ─────────────────────────
  const _migrateIfNeeded = () => {
    const legacy = _ls('ds_clinician_tasks', []);
    if (!legacy.length) return;
    const byPid = {};
    legacy.forEach(t => { const pid = t.patientId || 'pt-001'; (byPid[pid] = byPid[pid] || []).push({ ...t, patientId: pid }); });
    Object.entries(byPid).forEach(([pid, tasks]) => {
      if (!_ls(_clinKey(pid), []).length) { _lsSet(_clinKey(pid), tasks); _registerPid(pid); tasks.forEach(t => _bridgeToPatient(pid, t)); }
    });
  };
  _migrateIfNeeded();

  // Merge server-backed tasks into localStorage when authenticated (reload / multi-device).
  try {
    const { api: sdk } = await import('./api.js');
    if (typeof sdk.listHomeProgramTasks === 'function') {
      const res = await sdk.listHomeProgramTasks().catch(() => null);
      const items = res && Array.isArray(res.items) ? res.items : [];
      const byPid = {};
      items.forEach(task => {
        const pid = task.patientId;
        if (!pid || !task.id) return;
        if (!byPid[pid]) byPid[pid] = [];
        byPid[pid].push(task);
      });
      const pids = new Set([..._getAllKnownPids(), ...Object.keys(byPid)]);
      pids.forEach(pid => {
        const local = _ls(_clinKey(pid), []);
        const remote = byPid[pid] || [];
        const merged = mergePatientTasksFromServer(local, remote);
        _lsSet(_clinKey(pid), merged);
        _registerPid(pid);
        merged.forEach(t => _bridgeToPatient(pid, t));
      });
      await _retryPendingSyncs();
    }
  } catch (_) { /* offline or no token */ }

  // Hydrate clinician-saved task templates from the backend (server wins on
  // conflicts; localStorage stays as a write-through cache for offline UX).
  await _hydrateTemplatesFromServer();

  // ── State ────────────────────────────────────────────────────────────────
  let _allTasks = _loadAllTasks();
  let _view = 'queue'; // 'queue' | 'adherence' | 'templates'
  let _filter = { search: '', status: 'all', type: 'all', pid: 'all' };
  let _editingTask = null;
  let _showModal = false;
  let _hpSuggestionRowByTplId = new Map();
  let _hpModalProvenance = null;
  let _hpSuggestExpanded = false;
  let _tplEditorOpen = false;
  let _tplEditing = null; // null = new; otherwise a template object being edited

  // Default templates (bundled) cannot be edited or deleted. Detect by id prefix.
  const _isDefaultTemplate = id => /^tpl-\d+$/.test(id || '') || /^chp-CON-\d+$/.test(id || '');

  // ── Date helpers ─────────────────────────────────────────────────────────
  const _today    = () => new Date().toISOString().slice(0, 10);
  const _isToday   = d => d === _today();
  const _isOverdue = d => d && d < _today();
  const _fmtDate   = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '\u2014';

  // ── Stats ────────────────────────────────────────────────────────────────
  const _stats = () => {
    const tasks = _allTasks.filter(t => t.status !== 'archived');
    let totalComp = 0, totalActive = 0;
    _getAllKnownPids().forEach(pid => {
      const ptTasks = tasks.filter(t => t.patientId === pid);
      if (!ptTasks.length) return;
      const comps = _getCompletions(pid);
      totalActive += ptTasks.length;
      totalComp += ptTasks.filter(t => comps[t.id] || t.status === 'completed').length;
    });
    return {
      active:      tasks.filter(t => t.status === 'active').length,
      dueToday:    tasks.filter(t => _isToday(t.dueDate)).length,
      overdue:     tasks.filter(t => _isOverdue(t.dueDate) && t.status !== 'completed').length,
      rate:        totalActive ? Math.round((totalComp / totalActive) * 100) : 0,
      needFollowUp: new Set(tasks.filter(t => _isOverdue(t.dueDate)).map(t => t.patientId)).size,
    };
  };

  // ── Filter ───────────────────────────────────────────────────────────────
  const _filtered = () => {
    let list = _allTasks;
    if (_filter.pid !== 'all')          list = list.filter(t => t.patientId === _filter.pid);
    if (_filter.type !== 'all')         list = list.filter(t => t.type === _filter.type);
    if (_filter.status === 'active')    list = list.filter(t => t.status === 'active');
    if (_filter.status === 'completed') list = list.filter(t => t.status === 'completed');
    if (_filter.status === 'overdue')   list = list.filter(t => _isOverdue(t.dueDate) && t.status !== 'completed');
    if (_filter.status === 'due-today') list = list.filter(t => _isToday(t.dueDate));
    if (_filter.status === 'archived')  list = list.filter(t => t.status === 'archived');
    if (_filter.search) {
      const q = _filter.search.toLowerCase();
      list = list.filter(t => {
        const pt = patientMap[t.patientId];
        const name = pt ? [pt.first_name, pt.last_name, pt.name].filter(Boolean).join(' ').toLowerCase() : '';
        return (t.title || '').toLowerCase().includes(q) || name.includes(q);
      });
    }
    return list;
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const _ptName = pid => {
    const pt = patientMap[pid];
    return pt ? [pt.first_name, pt.last_name].filter(Boolean).join(' ') || pt.name || pid : pid;
  };

  const _statusBadge = task => {
    const comps = _getCompletions(task.patientId);
    if (comps[task.id] || task.status === 'completed') return '<span class="hp-badge hp-badge-green">Completed</span>';
    if (task.status === 'archived')  return '<span class="hp-badge hp-badge-grey">Archived</span>';
    if (_isOverdue(task.dueDate))    return '<span class="hp-badge hp-badge-red">Overdue</span>';
    if (_isToday(task.dueDate))      return '<span class="hp-badge hp-badge-amber">Due Today</span>';
    return '<span class="hp-badge hp-badge-blue">Active</span>';
  };

  // ── Task row ─────────────────────────────────────────────────────────────
  const _taskRow = task => {
    const course = (coursesByPatient[task.patientId] || []).find(c => c.id === task.courseId);
    const comps  = _getCompletions(task.patientId);
    const isDone = comps[task.id] || task.status === 'completed';
    const ptName = _ptName(task.patientId);
    return `
      <div class="hp-task-row${isDone ? ' hp-task-done' : ''}" data-tid="${task.id}">
        <div class="hp-task-type" title="${_typeName(task.type)}">${_typeIcon(task.type)}</div>
          <div class="hp-task-main">
          <div class="hp-task-title">${task.title || 'Untitled'}</div>
          <div class="hp-task-meta">
            <span class="hp-task-pt" onclick="event.stopPropagation();window.openPatient('${task.patientId}');window._nav('patient-profile')">${ptName}</span>
            ${task.reason ? `<span class="hp-task-reason">${task.reason}</span>` : ''}
            ${course ? `<span class="hp-task-course">\uD83D\uDCCE ${course.condition || course.protocol_name || 'Course'}</span>` : ''}
            ${task.homeProgramSelection?.conditionId ? `<span class="hp-task-prov" title="Home program selection on file">${_esc(task.homeProgramSelection.conditionId)} · ${_esc(confidenceTierFromScore(task.homeProgramSelection.confidenceScore))}</span>` : ''}
            ${task._syncStatus === SYNC_STATUS.PENDING ? '<span class="hp-sync-badge hp-sync-pending" title="Will retry sync">Sync pending</span>' : ''}
            ${task._syncStatus === SYNC_STATUS.CONFLICT ? '<span class="hp-sync-badge hp-sync-conflict" title="Server and local edits disagree">Sync conflict</span>' : ''}
          </div>
        </div>
        <div class="hp-task-freq">${task.frequency || '\u2014'}</div>
        <div class="hp-task-due">${_fmtDate(task.dueDate)}</div>
        <div class="hp-task-status">${_statusBadge(task)}</div>
        <div class="hp-task-actions" onclick="event.stopPropagation()">
          <button class="hp-act-btn hp-act-primary" onclick="window._hpEditTask('${task.id}','${task.patientId}')">Edit</button>
          <button class="hp-act-btn" onclick="window.openPatient('${task.patientId}');window._nav('messaging')">Virtual Care</button>
          <div class="hp-act-more" onclick="this.nextElementSibling.classList.toggle('hp-drop-open')">\u22EF</div>
          <div class="hp-act-dropdown">
            ${task._syncStatus === SYNC_STATUS.CONFLICT ? `<div onclick="window._hpConflictTakeServer('${task.id}','${task.patientId}')">Use server version</div><div onclick="window._hpConflictForceLocal('${task.id}','${task.patientId}')">Keep my edits (overwrite)</div>` : ''}
            ${task._syncStatus === SYNC_STATUS.PENDING ? `<div onclick="window._hpRetrySyncOne('${task.id}','${task.patientId}')">Retry sync now</div>` : ''}
            ${!isDone ? `<div onclick="window._hpMarkDone('${task.id}','${task.patientId}')">Mark Complete</div>` : ''}
            <div onclick="window._hpEditTask('${task.id}','${task.patientId}')">Reassign</div>
            <div onclick="window.openPatient('${task.patientId}');window._nav('patient-profile')">Open Patient</div>
            <div onclick="window._hpArchive('${task.id}','${task.patientId}')">Archive</div>
          </div>
        </div>
      </div>`;
  };

  const _section = (title, badge, tasks, cls) => {
    if (!tasks.length) return '';
    return `<div class="hp-section${cls ? ' ' + cls : ''}">
      <div class="hp-section-header">
        <span class="hp-section-title">${title}</span>
        ${badge ? `<span class="hp-section-badge">${badge}</span>` : ''}
      </div>
      <div class="hp-section-rows">${tasks.map(_taskRow).join('')}</div>
    </div>`;
  };

  // ── Template card ────────────────────────────────────────────────────────
  const _tplCard = tpl => {
    const editable = !_isDefaultTemplate(tpl.id);
    return `
    <div class="hp-tpl-card">
      <div class="hp-tpl-icon">${_typeIcon(tpl.type)}</div>
      <div class="hp-tpl-body">
        ${tpl.conditionId ? `<div class="hp-tpl-cond"><span class="hp-tpl-cid">${tpl.conditionId}</span> <span class="hp-tpl-cname">${_esc(tpl.conditionName || '')}</span>${tpl.category ? ` <span class="hp-tpl-ccat">${_esc(tpl.category)}</span>` : ''}</div>` : ''}
        <div class="hp-tpl-title">${_esc(tpl.title)}</div>
        <div class="hp-tpl-meta">${_typeName(tpl.type)} \u00B7 ${tpl.frequency || 'once'}</div>
        <div class="hp-tpl-desc">${_esc(tpl.instructions || '')}</div>
        ${tpl.reason ? `<div class="hp-tpl-reason">${_esc(tpl.reason)}</div>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;align-items:stretch">
        <button class="hp-act-btn hp-act-primary" onclick="window._hpUseTemplate('${tpl.id}')">Use</button>
        ${editable ? `<button class="hp-act-btn" title="Edit template" onclick="window._hpOpenTplEditor('${tpl.id}')">\u270E Edit</button>` : ''}
        ${editable ? `<button class="hp-act-btn" title="Delete template" onclick="window._hpDeleteTplPrompt('${tpl.id}')">\uD83D\uDDD1 Delete</button>` : ''}
      </div>
    </div>`;
  };

  // ── Template editor modal (small inline form) ────────────────────────────
  const _tplEditorHtml = () => {
    const isEdit = !!_tplEditing?.id;
    const t = _tplEditing || {};
    const notes = (t.payload && typeof t.payload === 'object' && t.payload.notes) || t.instructions || '';
    return `
      <div class="hp-modal-overlay" onclick="window._hpCloseTplEditor()">
        <div class="hp-modal" onclick="event.stopPropagation()" style="max-width:520px">
          <div class="hp-modal-header">
            <span>${isEdit ? 'Edit Template' : 'New Template'}</span>
            <button class="hp-modal-close" onclick="window._hpCloseTplEditor()">\u2715</button>
          </div>
          <div class="hp-modal-body">
            <label class="hp-lbl">Name</label>
            <input id="hp-tple-name" class="hp-input" type="text" placeholder="e.g. Evening wind-down routine" value="${_esc(t.title || '')}">
            <label class="hp-lbl">Payload notes</label>
            <textarea id="hp-tple-notes" class="hp-input hp-textarea" placeholder="Notes / instructions stored on the template payload\u2026">${_esc(notes)}</textarea>
          </div>
          <div class="hp-modal-footer">
            <button class="hp-act-btn" onclick="window._hpCloseTplEditor()">Cancel</button>
            <button class="hp-act-btn hp-act-primary" onclick="window._hpSubmitTplEditor()">Save</button>
          </div>
        </div>
      </div>`;
  };

  // ── Adherence view ───────────────────────────────────────────────────────
  const _adherenceView = () => {
    const pids = [...new Set(_allTasks.map(t => t.patientId))];
    if (!pids.length) return '<div class="hp-empty">No tasks assigned yet.</div>';
    return `<div class="hp-adh-grid">${pids.map(pid => {
      const ptTasks = _allTasks.filter(t => t.patientId === pid && t.status !== 'archived');
      const comps   = _getCompletions(pid);
      const done    = ptTasks.filter(t => comps[t.id] || t.status === 'completed').length;
      const overdue = ptTasks.filter(t => _isOverdue(t.dueDate) && !comps[t.id] && t.status !== 'completed').length;
      const rate    = ptTasks.length ? Math.round((done / ptTasks.length) * 100) : 0;
      const rColor  = rate >= 75 ? '#22c55e' : rate >= 40 ? '#f59e0b' : '#ef4444';

      // Build per-task detail rows with completion data
      const today = new Date().toISOString().slice(0, 10);
      const taskRows = ptTasks.map(t => {
        // Find most recent completion key for this task
        const compKeys = Object.keys(comps).filter(k => k.startsWith(t.id + '_')).sort().reverse();
        const compKey  = compKeys[0];
        const compVal  = compKey ? comps[compKey] : null;
        const isDone   = compVal === true || (compVal && compVal.done);
        const compDate = compKey ? compKey.replace(t.id + '_', '') : null;
        const compData = (compVal && typeof compVal === 'object') ? compVal : null;
        const isOvd    = _isOverdue(t.dueDate) && !isDone;

        // Extract notes from completion data based on task type
        let noteSnippet = '';
        if (compData) {
          const notes = compData.notes || compData.thoughts || compData.observations || compData.flag || '';
          const mood  = compData.mood != null ? `Mood ${compData.mood}/10` : '';
          const energy = compData.energy != null ? `Energy ${compData.energy}/10` : '';
          const rating = compData.rating != null ? `Rating ${compData.rating}/10` : '';
          const se    = (compData.sideEffects && compData.sideEffects !== 'none') ? `SE: ${compData.sideEffects}` : '';
          const flagBits = [mood, energy, rating, se].filter(Boolean).join(' · ');
          noteSnippet = [flagBits, notes.slice(0, 100)].filter(Boolean).join(' — ');
        }

        const detailId = `hp-adh-detail-${pid.replace(/[^a-z0-9]/gi,'-')}-${t.id.replace(/[^a-z0-9]/gi,'-')}`;
        return `<div class="hp-adh-task-row">
          <span class="hp-adh-task-icon">${_typeIcon(t.type)}</span>
          <span class="hp-adh-task-name" style="color:${isDone ? 'var(--text-secondary)' : isOvd ? '#ef4444' : 'var(--text-primary)'}">${_esc(t.title)}</span>
          ${isDone
            ? `<span class="hp-adh-task-badge" style="background:rgba(34,197,94,.15);color:#22c55e">\u2713 ${compDate || 'done'}</span>`
            : isOvd
              ? `<span class="hp-adh-task-badge" style="background:rgba(239,68,68,.12);color:#ef4444">Overdue</span>`
              : `<span class="hp-adh-task-badge" style="background:rgba(148,163,184,.1);color:var(--text-tertiary)">Pending</span>`
          }
          ${compData ? `<button class="hp-adh-expand-btn" onclick="(function(){var d=document.getElementById('${detailId}');d.style.display=d.style.display==='none'?'block':'none';})()" title="View completion data">\u25BC</button>` : ''}
          ${compData ? `<div class="hp-adh-task-detail" id="${detailId}" style="display:none">${noteSnippet ? _esc(noteSnippet) : 'No notes recorded.'}</div>` : ''}
        </div>`;
      }).join('');

      const cardId = `hp-adh-tasks-${pid.replace(/[^a-z0-9]/gi,'-')}`;
      return `<div class="hp-adh-card">
        <div class="hp-adh-name" onclick="window.openPatient('${pid}');window._nav('patient-profile')">${_ptName(pid)}</div>
        <div class="hp-adh-bar-wrap"><div class="hp-adh-bar" style="width:${rate}%;background:${rColor}"></div></div>
        <div class="hp-adh-stats">
          <span>${done}/${ptTasks.length} tasks</span>
          <span style="color:${rColor};font-weight:700">${rate}%</span>
          ${overdue ? `<span class="hp-adh-overdue">${overdue} overdue</span>` : ''}
          <button class="hp-adh-expand-btn" onclick="(function(){var d=document.getElementById('${cardId}');d.style.display=d.style.display==='none'?'block':'none';})()" title="Task detail">\u25BC</button>
        </div>
        <div id="${cardId}" style="display:none;margin-top:8px;border-top:1px solid rgba(148,163,184,.1);padding-top:8px">
          ${taskRows}
        </div>
        <div class="hp-adh-actions">
          <button class="hp-act-btn hp-act-primary" onclick="window._hpOpenAssign('${pid}')">+ Add Task</button>
          <button class="hp-act-btn" onclick="window.openPatient('${pid}');window._nav('messaging')">Virtual Care</button>
        </div>
      </div>`;
    }).join('')}</div>`;
  };

  // ── Modal ────────────────────────────────────────────────────────────────
  const _courseLabel = c =>
    c.condition || c.condition_name || (c.condition_slug && String(c.condition_slug).replace(/-/g, ' ')) || c.protocol_name || c.name || c.id;

  const _modalProvHtml = task => {
    const p = task?.homeProgramSelection;
    if (!p || !task?.id) return '';
    const tier = confidenceTierFromScore(p.confidenceScore);
    return `
      <div class="hp-modal-prov" role="region" aria-label="Recorded home program selection">
        <div class="hp-modal-prov-title">Recorded selection (read-only)</div>
        <dl class="hp-modal-prov-dl">
          ${p.conditionId ? `<dt>Bundle</dt><dd>${_esc(p.conditionId)}</dd>` : ''}
          <dt>Confidence</dt><dd>${p.confidenceScore != null ? _esc(String(p.confidenceScore)) : '—'} · ${_esc(tier)}</dd>
          <dt>Match method</dt><dd>${_esc(p.matchMethod || '—')}</dd>
          ${p.matchedField ? `<dt>Matched field</dt><dd>${_esc(p.matchedField)}</dd>` : ''}
          ${p.sourceCourseLabel ? `<dt>Source course</dt><dd>${_esc(String(p.sourceCourseLabel))}</dd>` : ''}
          <dt>Course auto-linked</dt><dd>${p.courseLinkAutoSet ? 'Yes' : 'No'}</dd>
          ${p.appliedAt ? `<dt>Applied at</dt><dd>${_esc(p.appliedAt)}</dd>` : ''}
        </dl>
        <p class="hp-modal-prov-note">Applying a suggestion below replaces this record when you save.</p>
      </div>`;
  };

  const _modalHtml = (task, prefillPid) => {
    const pid = task?.patientId || prefillPid || '';
    const patOpts = (apiPatients || []).map(p => {
      const n = [p.first_name, p.last_name].filter(Boolean).join(' ') || p.name || p.id;
      return `<option value="${p.id}" ${p.id === pid ? 'selected' : ''}>${n}</option>`;
    }).join('');
    const courseOpts = pid
      ? (coursesByPatient[pid] || []).map(c =>
          `<option value="${c.id}" ${task?.courseId === c.id ? 'selected' : ''}>${_esc(_courseLabel(c))}</option>`
        ).join('')
      : '';
    const typeOpts = TASK_TYPES.map(t =>
      `<option value="${t.id}" ${task?.type === t.id ? 'selected' : ''}>${t.icon} ${t.label}</option>`).join('');
    const freqOpts = ['once','daily','weekly','3x-week','before-session','after-session'].map(f =>
      `<option value="${f}" ${(task?.frequency||'once') === f ? 'selected' : ''}>${f}</option>`).join('');
    return `
      <div class="hp-modal-overlay" onclick="window._hpCloseModal()">
        <div class="hp-modal" onclick="event.stopPropagation()">
          <div class="hp-modal-header">
            <span>${task?.id ? 'Edit Task' : 'Assign Home Task'}</span>
            <button class="hp-modal-close" onclick="window._hpCloseModal()">\u2715</button>
          </div>
          <div class="hp-modal-body">
            ${_modalProvHtml(task)}
            <label class="hp-lbl">Patient</label>
            <select id="hp-m-pid" class="hp-input" onchange="window._hpModalPatient(this.value)">
              <option value="">Select patient\u2026</option>${patOpts}
            </select>
            <div id="hp-modal-suggest-wrap" class="hp-modal-suggest-wrap" style="display:none">
              <label class="hp-lbl">Suggested from course (confidence-scored)</label>
              <p class="hp-modal-suggest-hint">Ranked by match strength: explicit CON ids, then field tokens, slug, display name, then bounded text inference. Scoped course gets a sort bonus.</p>
              <div id="hp-modal-suggest" class="hp-modal-suggest"></div>
            </div>
            <label class="hp-lbl">Task Title</label>
            <input id="hp-m-title" class="hp-input" type="text" placeholder="e.g. Daily Mood Journal" value="${task?.title || ''}">
            <label class="hp-lbl">Task Type</label>
            <select id="hp-m-type" class="hp-input">${typeOpts}</select>
            <label class="hp-lbl">Reason / Clinical Rationale</label>
            <input id="hp-m-reason" class="hp-input" type="text" placeholder="Why this task?" value="${task?.reason || ''}">
            <label class="hp-lbl">Link to Course</label>
            <select id="hp-m-course" class="hp-input" onchange="window._hpModalCourseChange()">
              <option value="">None</option>${courseOpts}
            </select>
            <div class="hp-modal-row">
              <div>
                <label class="hp-lbl">Due Date</label>
                <input id="hp-m-due" class="hp-input" type="date" value="${task?.dueDate || ''}">
              </div>
              <div>
                <label class="hp-lbl">Frequency</label>
                <select id="hp-m-freq" class="hp-input">${freqOpts}</select>
              </div>
            </div>
            <label class="hp-lbl">Instructions for Patient</label>
            <textarea id="hp-m-instr" class="hp-input hp-textarea" placeholder="Step-by-step instructions shown to patient\u2026">${task?.instructions || ''}</textarea>
            ${task?.id ? `<input type="hidden" id="hp-m-taskid" value="${task.id}">` : ''}
          </div>
          <div class="hp-modal-footer">
            <button class="hp-act-btn" onclick="window._hpCloseModal()">Cancel</button>
            <button class="hp-act-btn hp-act-primary" onclick="window._hpSubmitTask()">${task?.id ? 'Save Changes' : 'Assign Task'}</button>
          </div>
        </div>
      </div>`;
  };

  // ── Main render ──────────────────────────────────────────────────────────
  const renderPage = () => {
    const s = _stats();
    const filtered = _filtered();

    const summaryStrip = `
      <div class="hp-summary-strip">
        <div class="hp-chip dv2-kpi-card"><span class="hp-chip-val dv2-kpi-val">${s.active}</span><span class="hp-chip-lbl dv2-kpi-label">Active Programs</span></div>
        <div class="hp-chip hp-chip-amber"><span class="hp-chip-val">${s.dueToday}</span><span class="hp-chip-lbl">Due Today</span></div>
        <div class="hp-chip hp-chip-red"><span class="hp-chip-val">${s.overdue}</span><span class="hp-chip-lbl">Overdue</span></div>
        <div class="hp-chip hp-chip-green"><span class="hp-chip-val">${s.rate}%</span><span class="hp-chip-lbl">Completion Rate</span></div>
        <div class="hp-chip hp-chip-purple"><span class="hp-chip-val">${s.needFollowUp}</span><span class="hp-chip-lbl">Need Follow-Up</span></div>
      </div>`;

    const topActions = `
      <div class="hp-top-actions">
        <button class="hp-act-btn hp-act-primary" onclick="window._hpOpenAssign()">+ Assign Task</button>
        <button class="hp-act-btn${_view==='queue'?' hp-act-active':''}" onclick="window._hpSetView('queue')">☰ Queue</button>
        <button class="hp-act-btn${_view==='adherence'?' hp-act-active':''}" onclick="window._hpSetView('adherence')">📊 Adherence</button>
        <button class="hp-act-btn${_view==='templates'?' hp-act-active':''}" onclick="window._hpSetView('templates')">📚 Templates</button>
        <button class="hp-act-btn${_view==='patient-view'?' hp-act-active':''}" onclick="window._hpSetView('patient-view')" style="border-color:var(--teal);color:var(--teal)">👁 Patient View</button>
      </div>`;

    const filterBar = `
      <div class="hp-filter-bar">
        <input class="hp-search" type="text" placeholder="Search patient, task\u2026" value="${_filter.search}" oninput="window._hpSearch(this.value)">
        <select class="hp-filter-sel" onchange="window._hpFilterPid(this.value)">
          <option value="all">All Patients</option>
          ${(apiPatients||[]).map(p => { const n=[p.first_name,p.last_name].filter(Boolean).join(' ')||p.name||p.id; return `<option value="${p.id}"${_filter.pid===p.id?' selected':''}>${n}</option>`; }).join('')}
        </select>
        <select class="hp-filter-sel" onchange="window._hpFilterType(this.value)">
          <option value="all">All Types</option>
          ${TASK_TYPES.map(t=>`<option value="${t.id}"${_filter.type===t.id?' selected':''}>${t.icon} ${t.label}</option>`).join('')}
        </select>
        <select class="hp-filter-sel" onchange="window._hpFilterStatus(this.value)">
          <option value="all"${_filter.status==='all'?' selected':''}>All Status</option>
          <option value="active"${_filter.status==='active'?' selected':''}>Active</option>
          <option value="due-today"${_filter.status==='due-today'?' selected':''}>Due Today</option>
          <option value="overdue"${_filter.status==='overdue'?' selected':''}>Overdue</option>
          <option value="completed"${_filter.status==='completed'?' selected':''}>Completed</option>
          <option value="archived"${_filter.status==='archived'?' selected':''}>Archived</option>
        </select>
      </div>`;

    const queueHeader = `
      <div class="hp-queue-header">
        <span></span><span>Task</span><span>Frequency</span><span>Due</span><span>Status</span><span>Actions</span>
      </div>`;

    let mainContent = '';
    if (_view === 'patient-view') {
      // ── Patient View — shows exactly what a patient sees for their tasks ──
      const allPids = _getAllKnownPids();
      const patNames = {};
      (apiPatients||[]).forEach(p => { patNames[p.id] = ((p.first_name||'')+' '+(p.last_name||'')).trim()||p.id; });
      const selectedPid = window._hpPatViewPid || allPids[0];
      const patTasks = _ls(_patKey(selectedPid), []);
      const patOpts = allPids.map(pid => '<option value="'+pid+'"'+(pid===selectedPid?' selected':'')+'>'+( patNames[pid]||pid)+'</option>').join('');
      const taskTypeIcons = { journal:'📔', breathing:'🌬', exercise:'🏃', assessment:'📋', sleep:'🌙', device:'📱', mindfulness:'🧘', other:'✓' };

      const completions = _ls(_compKey(selectedPid), {});
      window._hpPatViewPid = selectedPid;
      window._hpSelectPatView = pid => { window._hpPatViewPid = pid; renderPage(); };
      window._hpPatCompleteTask = (pid, tid) => {
        const comps = _ls(_compKey(pid), {}); comps[tid] = { completedAt: new Date().toISOString(), source: 'clinician-demo' };
        _lsSet(_compKey(pid), comps);
        // Also update the patient bridge
        const ptTasks = _ls(_patKey(pid), []); const idx = ptTasks.findIndex(t=>t.id===tid); if(idx>=0){ptTasks[idx].done=true;ptTasks[idx].completedAt=new Date().toISOString(); _lsSet(_patKey(pid),ptTasks);}
        renderPage(); window._dsToast?.({title:'Task completed',body:'Marked as done in patient view.',severity:'success'});
      };
      window._hpPatUncompleteTask = (pid, tid) => {
        const comps = _ls(_compKey(pid), {}); delete comps[tid]; _lsSet(_compKey(pid), comps);
        const ptTasks = _ls(_patKey(pid), []); const idx = ptTasks.findIndex(t=>t.id===tid); if(idx>=0){ptTasks[idx].done=false;ptTasks[idx].completedAt=null; _lsSet(_patKey(pid),ptTasks);}
        renderPage();
      };

      const patTaskCards = patTasks.length ? patTasks.map(t => {
        const done = !!(completions[t.id] || t.done);
        const icon = taskTypeIcons[t.type] || taskTypeIcons.other;
        const overdueFlag = !done && t.dueDate && t.dueDate < new Date().toISOString().slice(0,10);
        return '<div class="hp-pv-task'+(done?' hp-pv-task--done':overdueFlag?' hp-pv-task--overdue':'')+'">' +
          '<div class="hp-pv-task-top">' +
            '<span class="hp-pv-task-icon">'+icon+'</span>' +
            '<div class="hp-pv-task-body">' +
              '<div class="hp-pv-task-title">'+_esc(t.title)+'</div>' +
              (t.description||t.instructions?'<div class="hp-pv-task-desc">'+_esc(t.description||t.instructions)+'</div>':'') +
              '<div class="hp-pv-task-meta">' +
                '<span class="hp-pv-task-freq">'+_esc(t.freq||t.frequency||'once')+'</span>' +
                (t.dueDate?'<span class="hp-pv-task-due'+(overdueFlag?' hp-pv-overdue':'')+'">Due: '+t.dueDate+'</span>':'') +
                (done?'<span class="hp-pv-task-done-badge">✓ Done</span>':'') +
              '</div>' +
            '</div>' +
            '<div class="hp-pv-task-actions">' +
              (!done?'<button class="ch-btn-sm ch-btn-teal" onclick="window._hpPatCompleteTask(\''+selectedPid+'\',\''+t.id+'\')">Mark Done</button>':'<button class="ch-btn-sm" onclick="window._hpPatUncompleteTask(\''+selectedPid+'\',\''+t.id+'\')">Undo</button>') +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('') : '<div class="hp-pv-empty"><div style="font-size:28px;opacity:0.3">📋</div><div>No tasks assigned to this patient yet.</div><button class="ch-btn-sm ch-btn-teal" style="margin-top:8px" onclick="window._hpOpenAssign()">+ Assign First Task</button></div>';

      const done = patTasks.filter(t=>completions[t.id]||t.done).length;
      const total = patTasks.length;
      const pct = total>0?Math.round((done/total)*100):0;

      mainContent = `<div class="hp-pv-shell">
        <div class="hp-pv-header">
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
            <div style="font-size:13px;font-weight:600;color:var(--text-secondary)">Viewing as patient:</div>
            <select class="ch-select" onchange="window._hpSelectPatView(this.value)">${patOpts}</select>
            <div class="hp-pv-progress-pill" style="--pct:${pct}">
              <div class="hp-pv-prog-bar"><div class="hp-pv-prog-fill" style="width:${pct}%"></div></div>
              <span>${done}/${total} tasks completed (${pct}%)</span>
            </div>
          </div>
          <div style="font-size:11.5px;color:var(--text-tertiary)">This is exactly what the patient sees on their portal. Changes here sync to the patient view.</div>
        </div>
        <div class="hp-pv-tasks">${patTaskCards}</div>
      </div>`;
    } else if (_view === 'adherence') {
      mainContent = `<div class="hp-card"><div class="hp-card-title">Patient Adherence Overview</div>${_adherenceView()}</div>`;
    } else if (_view === 'templates') {
      const ft = _filteredTemplates();
      const condOpts = CONDITION_HOME_TEMPLATES.slice()
        .sort((a, b) => a.conditionId.localeCompare(b.conditionId))
        .map(c => `<option value="${c.conditionId}"${_tplFilter.cond === c.conditionId ? ' selected' : ''}>${c.conditionId} — ${_esc(c.conditionName)}</option>`)
        .join('');
      const tplToolbar = `
        <div class="hp-tpl-toolbar">
          <p class="hp-tpl-hint">One suggested home task per condition (CON-001–CON-053), aligned with the Assessments Hub bundles. Use as a starting point and adapt to the individual.</p>
          <div class="hp-tpl-filters">
            <select class="hp-filter-sel" onchange="window._hpTplFilterCond(this.value)">
              <option value="all"${_tplFilter.cond === 'all' ? ' selected' : ''}>All templates</option>
              <option value="general"${_tplFilter.cond === 'general' ? ' selected' : ''}>General library only</option>
              ${condOpts}
            </select>
            <input class="hp-search" type="text" placeholder="Search title, condition, instructions\u2026" value="${_esc(_tplFilter.q)}" oninput="window._hpTplSearch(this.value)">
          </div>
        </div>`;
      mainContent = `<div class="hp-card hp-tpl-card-wrap">
        <div class="hp-card-title" style="display:flex;align-items:center;justify-content:space-between;gap:12px">
          <span>Task Templates &amp; Library <span class="hp-tpl-count">${ft.length}</span></span>
          <button class="hp-act-btn hp-act-primary" onclick="window._hpOpenTplEditor()">+ New Template</button>
        </div>
        ${tplToolbar}
        <div class="hp-tpl-grid">${ft.length ? ft.map(_tplCard).join('') : '<div class="hp-empty">No templates match filters.</div>'}</div>
      </div>`;
    } else {
      const todayTasks   = filtered.filter(t => _isToday(t.dueDate) && t.status !== 'archived' && t.status !== 'completed');
      const overdueTasks = filtered.filter(t => _isOverdue(t.dueDate) && t.status !== 'archived' && t.status !== 'completed');
      const activeTasks  = filtered.filter(t => t.status === 'active' && !_isToday(t.dueDate) && !_isOverdue(t.dueDate));
      const doneTasks    = filtered.filter(t => t.status === 'completed' || _getCompletions(t.patientId)[t.id]).slice(0, 10);
      mainContent = `
        <div class="hp-card hp-queue-card">
          <div class="hp-card-title">Task Queue <span class="hp-queue-count">${filtered.filter(t=>t.status!=='archived').length}</span></div>
          ${filterBar}
          ${queueHeader}
          ${_section('Due Today', todayTasks.length || null, todayTasks, 'hp-section-today')}
          ${_section('Overdue / Not Completed', overdueTasks.length || null, overdueTasks, 'hp-section-overdue')}
          ${_section('Active Home Programs', activeTasks.length || null, activeTasks, '')}
          ${_section('Completed Recently', doneTasks.length || null, doneTasks, 'hp-section-done')}
          ${!filtered.filter(t=>t.status!=='archived').length ? '<div class="hp-empty">No tasks match current filters. Use + Add Task to assign the first task.</div>' : ''}
        </div>`;
    }

    el.innerHTML = `
      <div class="dv2-hub-shell" style="padding:20px;display:flex;flex-direction:column;gap:16px">
      <div class="hp-page">
        ${summaryStrip}
        ${topActions}
        ${mainContent}
        ${_showModal ? _modalHtml(_editingTask, '') : ''}
        ${_tplEditorOpen ? _tplEditorHtml() : ''}
      </div>
      </div>`;
    if (_showModal) queueMicrotask(() => window._hpSyncSuggestPanel?.());
  };

  // ── Window handlers ──────────────────────────────────────────────────────
  window._hpOpenAssign = prefillPid => {
    _hpModalProvenance = null;
    _hpSuggestExpanded = false;
    _editingTask = null; _showModal = true; renderPage();
    if (prefillPid) { const s = document.getElementById('hp-m-pid'); if (s) { s.value = prefillPid; window._hpModalPatient(prefillPid); } }
  };
  window._hpCloseModal  = () => { _showModal = false; _editingTask = null; _hpModalProvenance = null; _hpSuggestExpanded = false; renderPage(); };
  window._hpSetView     = v  => { _view = v; renderPage(); };
  window._hpShowPatientView = () => { _view = 'patient-view'; renderPage(); };
  window._hpSearch      = v  => { _filter.search = v; renderPage(); };
  window._hpFilterPid   = v  => { _filter.pid = v; renderPage(); };
  window._hpFilterType  = v  => { _filter.type = v; renderPage(); };
  window._hpFilterStatus = v => { _filter.status = v; renderPage(); };
  window._hpTplFilterCond = v => { _tplFilter.cond = v; renderPage(); };
  window._hpTplSearch     = v => { _tplFilter.q = v; renderPage(); };

  window._hpSyncSuggestPanel = () => {
    const host = document.getElementById('hp-modal-suggest');
    const wrap = document.getElementById('hp-modal-suggest-wrap');
    if (!host || !wrap) return;
    const pid = document.getElementById('hp-m-pid')?.value;
    const cid = document.getElementById('hp-m-course')?.value || '';
    _hpSuggestionRowByTplId = new Map();
    if (!pid) {
      wrap.style.display = 'none';
      host.innerHTML = '';
      return;
    }
    const allCourses = coursesByPatient[pid] || [];
    const active = allCourses.filter(c => c.status !== 'completed' && c.status !== 'discontinued');
    const pool = active.length ? active : allCourses;
    const rankedFull = buildRankedHomeSuggestions(pool, {
      selectedCourseId: cid || undefined,
      courseLabel: _courseLabel,
    });
    const MAX_CHIPS = 8;
    const ranked = _hpSuggestExpanded ? rankedFull : rankedFull.slice(0, MAX_CHIPS);
    ranked.forEach(row => { _hpSuggestionRowByTplId.set(row.template.id, row); });
    if (!rankedFull.length) {
      wrap.style.display = 'none';
      host.innerHTML = '';
      return;
    }
    wrap.style.display = 'block';
    const moreBtn = !_hpSuggestExpanded && rankedFull.length > MAX_CHIPS
      ? `<button type="button" class="hp-suggest-more" onclick="window._hpExpandSuggestChips()">Show all (${rankedFull.length})</button>`
      : '';
    host.innerHTML = '<div class="hp-suggest-chips">' + ranked.map(row => {
      const t = row.template;
      const short = t.title.length > 56 ? t.title.slice(0, 56) + '\u2026' : t.title;
      const src = row.sourceCourseLabel ? _esc(String(row.sourceCourseLabel)) : '';
      const method = _esc(row.match.matchMethod);
      const tier = _esc(confidenceTierFromScore(row.match.confidenceScore));
      return `<button type="button" class="hp-suggest-chip" onclick="window._hpApplySuggestTemplate('${t.id}')">`
        + `<span class="hp-suggest-cid">${t.conditionId}</span>`
        + `<span class="hp-suggest-txt">${_esc(short)}</span>`
        + `<span class="hp-suggest-meta">`
        + `<span class="hp-suggest-conf" title="Confidence score">${row.match.confidenceScore}</span>`
        + `<span class="hp-suggest-tier hp-suggest-tier--${confidenceTierFromScore(row.match.confidenceScore)}" title="Band">${tier}</span>`
        + `<span class="hp-suggest-method" title="Match method">${method}</span>`
        + (src ? `<span class="hp-suggest-src" title="Source course">${src}</span>` : '')
        + `</span></button>`;
    }).join('') + '</div>' + moreBtn;
  };

  window._hpExpandSuggestChips = () => { _hpSuggestExpanded = true; window._hpSyncSuggestPanel(); };

  window._hpApplySuggestTemplate = tplId => {
    const row = _hpSuggestionRowByTplId.get(tplId);
    const tpl = _getTemplates().find(t => t.id === tplId);
    if (!tpl) return;
    const pid = document.getElementById('hp-m-pid')?.value;
    if (!pid) {
      window._showNotifToast?.({ title: 'Select a patient', body: 'Choose a patient before applying a template.', severity: 'warn' });
      return;
    }
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    setVal('hp-m-title', tpl.title);
    setVal('hp-m-type', tpl.type);
    setVal('hp-m-reason', tpl.reason || (tpl.conditionName ? `Home program — ${tpl.conditionName}` : ''));
    setVal('hp-m-freq', tpl.frequency || 'once');
    setVal('hp-m-instr', tpl.instructions || '');
    let courseLinkAutoSet = false;
    if (tpl.conditionId) {
      const courses = coursesByPatient[pid] || [];
      let pick = null;
      if (row?.sourceCourseId) {
        const sc = courses.find(c => c.id === row.sourceCourseId);
        if (sc && resolveConIdsFromCourse(sc).includes(tpl.conditionId)) pick = sc;
      }
      if (!pick) pick = courses.find(c => resolveConIdsFromCourse(c).includes(tpl.conditionId));
      if (pick) {
        setVal('hp-m-course', pick.id);
        courseLinkAutoSet = true;
      }
    }
    _hpModalProvenance = {
      templateId: tpl.id,
      conditionId: tpl.conditionId || null,
      matchMethod: row ? row.match.matchMethod : null,
      confidenceScore: row ? row.match.confidenceScore : null,
      matchedField: row ? row.match.matchedField : null,
      matchedValue: row ? row.match.matchedValue : null,
      sourceCourseId: row ? row.sourceCourseId : null,
      sourceCourseLabel: row ? row.sourceCourseLabel : null,
      courseLinkAutoSet,
      sortScore: row ? row.sortScore : null,
      appliedAt: new Date().toISOString(),
    };
    window._showNotifToast?.({ title: 'Template applied', body: tpl.title, severity: 'success' });
  };

  window._hpModalCourseChange = () => { window._hpSyncSuggestPanel(); };

  window._hpModalPatient = pid => {
    _hpSuggestExpanded = false;
    const el2 = document.getElementById('hp-m-course');
    if (!el2) return;
    el2.innerHTML = '<option value="">None</option>' +
      (coursesByPatient[pid] || []).map(c => `<option value="${c.id}">${_esc(_courseLabel(c))}</option>`).join('');
    window._hpSyncSuggestPanel();
  };

  window._hpSubmitTask = () => {
    const pid   = document.getElementById('hp-m-pid')?.value;
    const title = document.getElementById('hp-m-title')?.value?.trim();
    const type  = document.getElementById('hp-m-type')?.value;
    const reason= document.getElementById('hp-m-reason')?.value?.trim();
    const course= document.getElementById('hp-m-course')?.value;
    const due   = document.getElementById('hp-m-due')?.value;
    const freq  = document.getElementById('hp-m-freq')?.value;
    const instr = document.getElementById('hp-m-instr')?.value?.trim();
    const existId = document.getElementById('hp-m-taskid')?.value;
    if (!pid || !title) { window._showNotifToast?.({ title:'Required', body:'Patient and task title required.', severity:'warn' }); return; }
    const prev = existId ? (_ls(_clinKey(pid), []).find(t => t.id === existId) || null) : null;
    const useCreate = !prev?.serverTaskId;
    const task = {
      id: existId || ('htask-' + Date.now()),
      patientId: pid, title, type, reason, courseId: course, dueDate: due, frequency: freq, instructions: instr,
      assignedBy: prev?.assignedBy || window._currentUser?.name || 'Clinician',
      assignedAt: existId ? (prev?.assignedAt || new Date().toISOString()) : new Date().toISOString(),
      status: prev?.status || 'active',
      homeProgramSelection: (_hpModalProvenance ?? prev?.homeProgramSelection) || undefined,
      clientUpdatedAt: new Date().toISOString(),
      lastSyncedServerRevision: prev?.lastSyncedServerRevision,
    };
    _hpModalProvenance = null;
    _saveTask(task, useCreate);
    _allTasks = _loadAllTasks();
    _showModal = false; _editingTask = null;
    renderPage();
    window._showNotifToast?.({
      title: existId ? 'Task updated' : 'Task assigned',
      body: existId ? `Saved changes to "${title}".` : `"${title}" sent to patient.`,
      severity: 'success',
    });
  };

  window._hpEditTask = (tid, pid) => {
    _hpModalProvenance = null;
    const tasks = _ls(_clinKey(pid), []);
    _editingTask = tasks.find(t => t.id === tid) || null;
    _showModal = true; renderPage();
  };

  window._hpMarkDone = (tid, pid) => {
    const comps = _getCompletions(pid);
    comps[tid] = new Date().toISOString();
    _lsSet(_compKey(pid), comps);
    _allTasks = _loadAllTasks(); renderPage();
    window._showNotifToast?.({ title:'Marked Complete', body:'Task marked as completed.', severity:'success' });
  };

  window._hpArchive = (tid, pid) => {
    if (!confirm('Archive this task?')) return;
    const tasks = _ls(_clinKey(pid), []);
    const idx = tasks.findIndex(t => t.id === tid);
    if (idx >= 0) { tasks[idx].status = 'archived'; _lsSet(_clinKey(pid), tasks); }
    const patTasks = _ls(_patKey(pid), []);
    const pidx = patTasks.findIndex(t => t.id === tid);
    if (pidx >= 0) { patTasks[pidx].status = 'archived'; _lsSet(_patKey(pid), patTasks); }
    _allTasks = _loadAllTasks(); renderPage();
  };

  window._hpUseTemplate = tplId => {
    _hpModalProvenance = null;
    _hpSuggestExpanded = false;
    const tpl = _getTemplates().find(t => t.id === tplId);
    if (!tpl) return;
    _editingTask = {
      title: tpl.title,
      type: tpl.type,
      frequency: tpl.frequency || 'once',
      instructions: tpl.instructions || '',
      reason: tpl.reason || (tpl.conditionName ? `Home program — ${tpl.conditionName}` : ''),
      courseId: '',
      dueDate: '',
      id: null,
      patientId: '',
    };
    _showModal = true; _view = 'queue'; renderPage();
  };

  // ── Template editor handlers (CRUD UI) ───────────────────────────────────
  window._hpOpenTplEditor = (tplId) => {
    if (tplId) {
      const tpl = _getTemplates().find(t => t.id === tplId);
      if (!tpl || _isDefaultTemplate(tpl.id)) return;
      _tplEditing = { ...tpl, payload: { notes: tpl.instructions || '' } };
    } else {
      _tplEditing = null;
    }
    _tplEditorOpen = true;
    renderPage();
  };
  window._hpCloseTplEditor = () => { _tplEditorOpen = false; _tplEditing = null; renderPage(); };
  window._hpSubmitTplEditor = async () => {
    const name = document.getElementById('hp-tple-name')?.value?.trim();
    const notes = document.getElementById('hp-tple-notes')?.value || '';
    if (!name) {
      window._showNotifToast?.({ title: 'Name required', body: 'Template name cannot be empty.', severity: 'warn' });
      return;
    }
    const existing = _tplEditing && _tplEditing.id ? _tplEditing : null;
    const tpl = existing
      ? { ...existing, title: name, instructions: notes, payload: { notes } }
      : { id: 'tplc-' + Date.now(), title: name, instructions: notes, payload: { notes } };
    _tplEditorOpen = false;
    _tplEditing = null;
    await window._hpSaveTemplate(tpl);
  };
  window._hpDeleteTplPrompt = async (tplId) => {
    if (!tplId || _isDefaultTemplate(tplId)) return;
    if (!confirm('Delete this template? This cannot be undone.')) return;
    await window._hpDeleteTemplate(tplId);
  };

  window._hpConflictTakeServer = (tid, pid) => {
    const tasks = _ls(_clinKey(pid), []);
    const t = tasks.find(x => x.id === tid);
    if (!t || !t._conflictServerTask) return;
    const server = t._conflictServerTask;
    const cleaned = {
      ...server,
      _syncStatus: SYNC_STATUS.SYNCED,
      _conflictServerTask: undefined,
      _syncConflictReason: undefined,
      lastSyncedServerRevision: server.serverRevision,
      lastSyncedAt: server.serverUpdatedAt || server.lastSyncedAt,
    };
    const i = tasks.findIndex(x => x.id === tid);
    if (i >= 0) tasks[i] = cleaned;
    _lsSet(_clinKey(pid), tasks);
    _bridgeToPatient(pid, cleaned);
    _allTasks = _loadAllTasks();
    renderPage();
    import('./api.js').then(({ api: sdk }) => {
      if (typeof sdk.postHomeProgramAuditAction === 'function') {
        return sdk.postHomeProgramAuditAction({ external_task_id: tid, action: 'take_server' }).catch(() => {});
      }
    }).catch(() => {});
    window._showNotifToast?.({ title: 'Using server copy', body: 'Local list updated to match the server.', severity: 'success' });
  };

  window._hpConflictForceLocal = async (tid, pid) => {
    const tasks = _ls(_clinKey(pid), []);
    const t = tasks.find(x => x.id === tid);
    if (!t) return;
    const local = { ...t, _conflictServerTask: undefined, _syncConflictReason: undefined, _syncStatus: SYNC_STATUS.SYNCING };
    try {
      const { api: apiSdk } = await import('./api.js');
      if (typeof apiSdk.mutateHomeProgramTask !== 'function' && typeof apiSdk.upsertHomeProgramTask !== 'function') return;
      const mutation = typeof apiSdk.mutateHomeProgramTask === 'function'
        ? await apiSdk.mutateHomeProgramTask(local, { force: true })
        : _hpApplyMutationSync(local, await apiSdk.upsertHomeProgramTask(local, { force: true })).mutation;
      const merged = mergeParsedMutationIntoLocalTask(local, mutation);
      const i = tasks.findIndex(x => x.id === tid);
      if (i >= 0) tasks[i] = merged;
      _lsSet(_clinKey(pid), tasks);
      _bridgeToPatient(pid, merged);
      _allTasks = _loadAllTasks();
      renderPage();
      window._showNotifToast?.({ title: 'Saved', body: 'Server overwritten with your copy.', severity: 'success' });
    } catch (_) {
      window._showNotifToast?.({ title: 'Sync failed', body: 'Could not overwrite server.', severity: 'warn' });
    }
  };

  window._hpRetrySyncOne = async (tid, pid) => {
    const arr = _ls(_clinKey(pid), []);
    const t = arr.find(x => x.id === tid);
    if (!t) return;
    const { api: sdk } = await import('./api.js');
    if (
      typeof sdk.mutateHomeProgramTask !== 'function' &&
      typeof sdk.upsertHomeProgramTask !== 'function' &&
      typeof sdk.createHomeProgramTask !== 'function'
    ) return;
    try {
      const payload = { ...t, _syncStatus: SYNC_STATUS.SYNCING };
      const mutation = typeof sdk.mutateHomeProgramTask === 'function'
        ? await sdk.mutateHomeProgramTask(payload)
        : _hpApplyMutationSync(
            payload,
            (!payload.serverTaskId && typeof sdk.createHomeProgramTask === 'function')
              ? await sdk.createHomeProgramTask(payload)
              : await sdk.upsertHomeProgramTask(payload)
          ).mutation;
      const merged = mergeParsedMutationIntoLocalTask(t, mutation);
      const i = arr.findIndex(x => x.id === tid);
      if (i >= 0) arr[i] = merged;
      _lsSet(_clinKey(pid), arr);
      _bridgeToPatient(pid, merged);
      _allTasks = _loadAllTasks();
      renderPage();
      if (typeof sdk.postHomeProgramAuditAction === 'function') {
        sdk.postHomeProgramAuditAction({
          external_task_id: tid,
          action: 'retry_success',
          server_revision: mutation.revision.serverRevision,
        }).catch(() => {});
      }
    } catch (_) {
      const failed = markSyncFailed(t);
      const i = arr.findIndex(x => x.id === tid);
      if (i >= 0) arr[i] = failed;
      _lsSet(_clinKey(pid), arr);
      _allTasks = _loadAllTasks();
      renderPage();
      window._showNotifToast?.({ title: 'Still offline', body: 'Sync will retry on reload.', severity: 'warn' });
    }
  };

  renderPage();
}
