
// ─────────────────────────────────────────────────────────────────────────────
// pgHomePrograms — Clinician Home Programs & Task Assignment Workflow
// ─────────────────────────────────────────────────────────────────────────────
export async function pgHomePrograms(setTopbar, navigate) {
  setTopbar({ title: 'Home Programs', subtitle: 'Assign · monitor · review between-session patient tasks' });

  const el = document.getElementById('main-content');
  if (!el) return;
  el.innerHTML = '<div class="hp-loading">Loading home programs\u2026</div>';

  // ── Storage helpers ──────────────────────────────────────────────────────
  const _ls    = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch { return d; } };
  const _lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

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
      id: task.id, title: task.title, type: task.type,
      instructions: task.instructions || '',
      dueDate: task.dueDate || '', frequency: task.frequency || 'once',
      courseId: task.courseId || '', status: task.status || 'active',
      assignedAt: task.assignedAt, reason: task.reason || '',
    };
    if (idx >= 0) patTasks[idx] = { ...patTasks[idx], ...patTask };
    else patTasks.push(patTask);
    _lsSet(_patKey(pid), patTasks);
  };

  const _saveTask = (task) => {
    const pid = task.patientId;
    const tasks = _ls(_clinKey(pid), []);
    const idx = tasks.findIndex(t => t.id === task.id);
    if (idx >= 0) tasks[idx] = task; else tasks.push(task);
    _lsSet(_clinKey(pid), tasks);
    _registerPid(pid);
    _bridgeToPatient(pid, task);
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
    const ids = new Set(saved.map(t => t.id));
    DEFAULT_TEMPLATES.forEach(t => { if (!ids.has(t.id)) saved.unshift(t); });
    return saved;
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

  // ── State ────────────────────────────────────────────────────────────────
  let _allTasks = _loadAllTasks();
  let _view = 'queue'; // 'queue' | 'adherence' | 'templates'
  let _filter = { search: '', status: 'all', type: 'all', pid: 'all' };
  let _editingTask = null;
  let _showModal = false;

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
          </div>
        </div>
        <div class="hp-task-freq">${task.frequency || '\u2014'}</div>
        <div class="hp-task-due">${_fmtDate(task.dueDate)}</div>
        <div class="hp-task-status">${_statusBadge(task)}</div>
        <div class="hp-task-actions" onclick="event.stopPropagation()">
          <button class="hp-act-btn hp-act-primary" onclick="window._hpEditTask('${task.id}','${task.patientId}')">Edit</button>
          <button class="hp-act-btn" onclick="window.openPatient('${task.patientId}');window._nav('messaging')">Message</button>
          <div class="hp-act-more" onclick="this.nextElementSibling.classList.toggle('hp-drop-open')">\u22EF</div>
          <div class="hp-act-dropdown">
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
  const _tplCard = tpl => `
    <div class="hp-tpl-card">
      <div class="hp-tpl-icon">${_typeIcon(tpl.type)}</div>
      <div class="hp-tpl-body">
        <div class="hp-tpl-title">${tpl.title}</div>
        <div class="hp-tpl-meta">${_typeName(tpl.type)} \u00B7 ${tpl.frequency || 'once'}</div>
        <div class="hp-tpl-desc">${tpl.instructions || ''}</div>
      </div>
      <button class="hp-act-btn hp-act-primary" onclick="window._hpUseTemplate('${tpl.id}')">Use</button>
    </div>`;

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
      return `<div class="hp-adh-card">
        <div class="hp-adh-name" onclick="window.openPatient('${pid}');window._nav('patient-profile')">${_ptName(pid)}</div>
        <div class="hp-adh-bar-wrap"><div class="hp-adh-bar" style="width:${rate}%;background:${rColor}"></div></div>
        <div class="hp-adh-stats">
          <span>${done}/${ptTasks.length} tasks</span>
          <span style="color:${rColor};font-weight:700">${rate}%</span>
          ${overdue ? `<span class="hp-adh-overdue">${overdue} overdue</span>` : ''}
        </div>
        <div class="hp-adh-actions">
          <button class="hp-act-btn hp-act-primary" onclick="window._hpOpenAssign('${pid}')">+ Add Task</button>
          <button class="hp-act-btn" onclick="window.openPatient('${pid}');window._nav('messaging')">Message</button>
        </div>
      </div>`;
    }).join('')}</div>`;
  };

  // ── Modal ────────────────────────────────────────────────────────────────
  const _modalHtml = (task, prefillPid) => {
    const pid = task?.patientId || prefillPid || '';
    const patOpts = (apiPatients || []).map(p => {
      const n = [p.first_name, p.last_name].filter(Boolean).join(' ') || p.name || p.id;
      return `<option value="${p.id}" ${p.id === pid ? 'selected' : ''}>${n}</option>`;
    }).join('');
    const courseOpts = pid
      ? (coursesByPatient[pid] || []).map(c =>
          `<option value="${c.id}" ${task?.courseId === c.id ? 'selected' : ''}>${c.condition || c.protocol_name || c.id}</option>`
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
            <label class="hp-lbl">Patient</label>
            <select id="hp-m-pid" class="hp-input" onchange="window._hpModalPatient(this.value)">
              <option value="">Select patient\u2026</option>${patOpts}
            </select>
            <label class="hp-lbl">Task Title</label>
            <input id="hp-m-title" class="hp-input" type="text" placeholder="e.g. Daily Mood Journal" value="${task?.title || ''}">
            <label class="hp-lbl">Task Type</label>
            <select id="hp-m-type" class="hp-input">${typeOpts}</select>
            <label class="hp-lbl">Reason / Clinical Rationale</label>
            <input id="hp-m-reason" class="hp-input" type="text" placeholder="Why this task?" value="${task?.reason || ''}">
            <label class="hp-lbl">Link to Course</label>
            <select id="hp-m-course" class="hp-input">
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
        <div class="hp-chip"><span class="hp-chip-val">${s.active}</span><span class="hp-chip-lbl">Active Programs</span></div>
        <div class="hp-chip hp-chip-amber"><span class="hp-chip-val">${s.dueToday}</span><span class="hp-chip-lbl">Due Today</span></div>
        <div class="hp-chip hp-chip-red"><span class="hp-chip-val">${s.overdue}</span><span class="hp-chip-lbl">Overdue</span></div>
        <div class="hp-chip hp-chip-green"><span class="hp-chip-val">${s.rate}%</span><span class="hp-chip-lbl">Completion Rate</span></div>
        <div class="hp-chip hp-chip-purple"><span class="hp-chip-val">${s.needFollowUp}</span><span class="hp-chip-lbl">Need Follow-Up</span></div>
      </div>`;

    const topActions = `
      <div class="hp-top-actions">
        <button class="hp-act-btn hp-act-primary" onclick="window._hpOpenAssign()">+ Add Task</button>
        <button class="hp-act-btn${_view==='templates'?' hp-act-active':''}" onclick="window._hpSetView('templates')">\uD83D\uDCDA Templates</button>
        <button class="hp-act-btn${_view==='adherence'?' hp-act-active':''}" onclick="window._hpSetView('adherence')">\uD83D\uDCCA Adherence</button>
        <button class="hp-act-btn${_view==='queue'?' hp-act-active':''}" onclick="window._hpSetView('queue')">\u2630 Task Queue</button>
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
    if (_view === 'adherence') {
      mainContent = `<div class="hp-card"><div class="hp-card-title">Patient Adherence Overview</div>${_adherenceView()}</div>`;
    } else if (_view === 'templates') {
      mainContent = `<div class="hp-card"><div class="hp-card-title">Task Templates &amp; Library</div><div class="hp-tpl-grid">${_getTemplates().map(_tplCard).join('')}</div></div>`;
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
      <div class="hp-page">
        ${summaryStrip}
        ${topActions}
        ${mainContent}
        ${_showModal ? _modalHtml(_editingTask, '') : ''}
      </div>`;
  };

  // ── Window handlers ──────────────────────────────────────────────────────
  window._hpOpenAssign = prefillPid => {
    _editingTask = null; _showModal = true; renderPage();
    if (prefillPid) { const s = document.getElementById('hp-m-pid'); if (s) { s.value = prefillPid; window._hpModalPatient(prefillPid); } }
  };
  window._hpCloseModal  = () => { _showModal = false; _editingTask = null; renderPage(); };
  window._hpSetView     = v  => { _view = v; renderPage(); };
  window._hpSearch      = v  => { _filter.search = v; renderPage(); };
  window._hpFilterPid   = v  => { _filter.pid = v; renderPage(); };
  window._hpFilterType  = v  => { _filter.type = v; renderPage(); };
  window._hpFilterStatus = v => { _filter.status = v; renderPage(); };

  window._hpModalPatient = pid => {
    const el2 = document.getElementById('hp-m-course');
    if (!el2) return;
    el2.innerHTML = '<option value="">None</option>' +
      (coursesByPatient[pid] || []).map(c => `<option value="${c.id}">${c.condition || c.protocol_name || c.id}</option>`).join('');
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
    const task = { id: existId || ('htask-' + Date.now()), patientId: pid, title, type, reason, courseId: course, dueDate: due, frequency: freq, instructions: instr, assignedBy: window._currentUser?.name || 'Clinician', assignedAt: new Date().toISOString(), status: 'active' };
    _saveTask(task);
    _allTasks = _loadAllTasks();
    _showModal = false; _editingTask = null;
    renderPage();
    window._showNotifToast?.({ title:'Task Assigned', body:`"${title}" sent to patient.`, severity:'success' });
  };

  window._hpEditTask = (tid, pid) => {
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
    const tpl = _getTemplates().find(t => t.id === tplId);
    if (!tpl) return;
    _editingTask = { ...tpl, id: null, patientId: '' };
    _showModal = true; _view = 'queue'; renderPage();
  };

  renderPage();
}
