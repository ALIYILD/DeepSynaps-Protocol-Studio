// pgPatientSessions
// Extracted from `pages-patient.js` on 2026-05-02 as part of the file-split
// refactor (continuation of #403; see `pages-patient/_shared.js`). NO
// behavioural change: the page body below is the verbatim Sessions block
// from the original file with imports rewired.
import { api } from '../api.js';
import { t, getLocale } from '../i18n.js';
import { setTopbar, spinner, fmtDate } from './_shared.js';

// ── Sessions ──────────────────────────────────────────────────────────────────
export async function pgPatientSessions() {
  setTopbar(t('patient.nav.sessions'));

  const el = document.getElementById('patient-content');
  el.innerHTML = spinner();

  // Local timeout helpers — a half-open Fly backend can leave fetch() hanging
  // forever, which shows as a stuck spinner. Race every call against a 3s
  // timeout; a null result falls through to empty / demo handling below.
  const _timeout = (ms) => new Promise(r => setTimeout(() => r(null), ms));
  const _raceNull = (p) => Promise.race([
    Promise.resolve(p).catch(() => null),
    _timeout(3000),
  ]);

  let sessionsRaw, coursesRaw, outcomesRaw, assessmentsRaw;
  try {
    [sessionsRaw, coursesRaw, outcomesRaw, assessmentsRaw] = await Promise.all([
      _raceNull(api.patientPortalSessions()),
      _raceNull(api.patientPortalCourses()),
      _raceNull(api.patientPortalOutcomes()),
      _raceNull(api.patientPortalAssessments()),
    ]);
  } catch (_e) {
    sessionsRaw = coursesRaw = outcomesRaw = assessmentsRaw = null;
  }

  const sessions     = Array.isArray(sessionsRaw)     ? sessionsRaw     : [];
  const outcomes     = Array.isArray(outcomesRaw)     ? outcomesRaw     : [];
  const coursesArr   = Array.isArray(coursesRaw)      ? coursesRaw      : [];
  const assessments  = Array.isArray(assessmentsRaw)  ? assessmentsRaw  : [];

  // ── Seed demo data (used when backend returns empty, e.g. first-time users
  //    hitting the preview deploy with VITE_ENABLE_DEMO=1). Tells a 20-session
  //    tDCS course story: 12 done (mix clinic/home) + 1 live + 7 upcoming, so
  //    every slot of the ps-* design renders with believable numbers. ───────
  const _SEED = sessions.length === 0 && coursesArr.length === 0;
  const _feedbackItems = [];
  if (_SEED) {
    coursesArr.push({
      id: 'demo-crs-001', name: 'Left DLPFC tDCS \u2014 Depression',
      condition_slug: 'depression-mdd', modality_slug: 'tdcs', status: 'active',
      phase: 'Active Treatment', total_sessions_planned: 20, session_count: 12,
      next_review_date: '2026-04-24', primary_clinician_name: 'Dr. Amelia Kolmar',
    });

    // Common protocol parameters reused across every seeded session so the
    // detail card's parameter grid renders (amplitude, frequency, target,
    // ramp-up). Frequency for tDCS is 0 Hz (DC current) — we leave it out.
    const _P = {
      stimulation_mA: 2.0,
      target_site: 'F3 / FP2 (10–20)',
      ramp_up_sec: 30,
      duration_minutes: 20,
      modality_slug: 'tdcs',
      clinician_name: 'Dr. Amelia Kolmar',
    };

    // 12 completed sessions spread from Feb 22 → Apr 18 (2026), 2–3/week.
    // Mix of in-clinic (9) and at-home Synaps One (3). Comfort trends upward
    // as the patient gets used to it; impedance stays in normal range.
    const _done = [
      { n:1,  date:'2026-02-22T10:00:00', home:false, comfort:7.0, imp:5.1, note:'Baseline session. Mild scalp tingling as expected during ramp-up. Tolerated well.' },
      { n:2,  date:'2026-02-25T10:00:00', home:false, comfort:7.5, imp:4.9, note:null },
      { n:3,  date:'2026-02-27T10:00:00', home:false, comfort:8.0, imp:4.7, note:'Patient reports feeling more alert post-session.' },
      { n:4,  date:'2026-03-03T10:00:00', home:false, comfort:7.5, imp:4.8, note:null },
      { n:5,  date:'2026-03-06T09:30:00', home:true,  comfort:7.0, imp:5.6, note:'First at-home session. Mild headache post-session, resolved in 2 hours. Discussed hydration.' },
      { n:6,  date:'2026-03-10T10:00:00', home:false, comfort:8.5, imp:4.6, note:null },
      { n:7,  date:'2026-03-13T10:00:00', home:false, comfort:8.5, imp:4.5, note:'Half-way check-in. PHQ-9 down 4 points from baseline — response criteria met.' },
      { n:8,  date:'2026-03-17T09:30:00', home:true,  comfort:8.0, imp:5.3, note:null },
      { n:9,  date:'2026-03-20T10:00:00', home:false, comfort:8.5, imp:4.4, note:null },
      { n:10, date:'2026-04-03T10:00:00', home:false, comfort:9.0, imp:4.3, note:'Patient reports noticeable mood improvement over past week.' },
      { n:11, date:'2026-04-10T09:30:00', home:true,  comfort:8.5, imp:5.1, note:null },
      { n:12, date:'2026-04-15T10:00:00', home:false, comfort:9.0, imp:4.2, note:'Excellent adherence. Continuing full 20-session plan.' },
    ];
    _done.forEach(d => sessions.push({
      ..._P,
      id: 'dm-s' + d.n,
      session_number: d.n,
      delivered_at: d.date,
      scheduled_at: d.date,
      status: 'completed',
      location: d.home ? 'Home' : 'Clinic · Room A',
      is_home: d.home,
      comfort_rating: d.comfort,
      impedance_kohm: d.imp,
      tolerance_rating: d.comfort >= 8.5 ? 'excellent' : d.comfort >= 7.5 ? 'good' : 'mild',
      ...(d.note ? { post_session_notes: d.note } : {}),
    }));

    // One intentionally-skipped session between #8 and #9 — surfaces the
    // amber dot in the trend chart and the "Skipped" pill in the list.
    sessions.push({
      ..._P,
      id: 'dm-s-skip',
      delivered_at: '2026-03-22T10:00:00',
      scheduled_at: '2026-03-22T10:00:00',
      status: 'missed',
      location: 'Clinic · Room A',
      is_home: false,
      comfort_rating: 4.5,
      impedance_kohm: null,
      post_session_notes: 'Session cut short after 5 min — patient reported feeling lightheaded. Rescheduled.',
    });

    // Session 13 — LIVE RIGHT NOW (ramping up). Triggers the ps-live banner.
    sessions.push({
      ..._P,
      id: 'dm-s13',
      session_number: 13,
      scheduled_at: new Date(Date.now() - 3 * 60 * 1000).toISOString(),   // started 3 min ago
      status: 'live',
      location: 'Clinic · Room A',
      is_home: false,
    });

    // 7 upcoming sessions — weekday 10am clinic / weekend 9:30 home, spaced
    // every 2–3 days across the next ~3 weeks.
    const _upcoming = [
      { n:14, date:'2026-04-22T10:00:00', home:false },
      { n:15, date:'2026-04-25T09:30:00', home:true  },
      { n:16, date:'2026-04-28T10:00:00', home:false },
      { n:17, date:'2026-05-01T10:00:00', home:false },
      { n:18, date:'2026-05-04T09:30:00', home:true  },
      { n:19, date:'2026-05-07T10:00:00', home:false },
      { n:20, date:'2026-05-11T10:00:00', home:false },
    ];
    _upcoming.forEach(u => sessions.push({
      ..._P,
      id: 'dm-u' + u.n,
      session_number: u.n,
      scheduled_at: u.date,
      status: 'scheduled',
      location: u.home ? 'Home' : 'Clinic · Room A',
      is_home: u.home,
      confirmed: true,
    }));

    // Feedback timeline — surfaces in the existing feedbackFromSessionsHTML
    // section (collected from post_session_notes above plus a couple extras).
    _feedbackItems.push(
      { date:'2026-04-15', text:'Excellent adherence. Continuing full 20-session plan.',                                               clinician:'Dr. Amelia Kolmar', session_number:12 },
      { date:'2026-04-03', text:'Patient reports noticeable mood improvement over past week.',                                         clinician:'Dr. Amelia Kolmar', session_number:10 },
      { date:'2026-03-13', text:'Half-way check-in. PHQ-9 down 4 points from baseline — response criteria met.',                       clinician:'Dr. Amelia Kolmar', session_number:7  },
      { date:'2026-03-06', text:'First at-home session. Mild headache post-session, resolved in 2 hours. Discussed hydration.',        clinician:'Care Team',          session_number:5  },
    );

    // Seed a couple of PHQ-9 outcomes so the comparison-chart PHQ-9 tab has
    // data to plot (lower is better — demonstrates a drop over 8 weeks).
    outcomes.push(
      { id:'dm-o1', template_slug:'phq-9', template_name:'PHQ-9', score_numeric:16, administered_at:'2026-02-22T09:30:00' },
      { id:'dm-o2', template_slug:'phq-9', template_name:'PHQ-9', score_numeric:14, administered_at:'2026-03-01T09:30:00' },
      { id:'dm-o3', template_slug:'phq-9', template_name:'PHQ-9', score_numeric:12, administered_at:'2026-03-13T09:30:00' },
      { id:'dm-o4', template_slug:'phq-9', template_name:'PHQ-9', score_numeric:10, administered_at:'2026-03-27T09:30:00' },
      { id:'dm-o5', template_slug:'phq-9', template_name:'PHQ-9', score_numeric:9,  administered_at:'2026-04-15T09:30:00' },
    );
  }

  const activeCourse = coursesArr.find(c => c.status === 'active') || coursesArr[0] || null;

  // ── Safe HTML escaper ────────────────────────────────────────────────────────
  function esc(v) {
    if (v == null) return '';
    return String(v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  // ── Status helpers ───────────────────────────────────────────────────────────
  function statusInfo(rawStatus) {
    const s = (rawStatus || '').toLowerCase().trim();
    switch (s) {
      case 'cancelled':             return { label: t('patient.sess.status.cancelled'),    pillClass: 'pt-pill-cancelled',   iconChar: '\u2715', iconClass: 'cancelled'    };
      case 'missed':
      case 'no-show':
      case 'no_show':               return { label: t('patient.sess.status.missed'),       pillClass: 'pt-pill-missed',      iconChar: '\u25a1', iconClass: 'missed'       };
      case 'rescheduled':           return { label: t('patient.sess.status.rescheduled'),  pillClass: 'pt-pill-rescheduled', iconChar: '\u21bb', iconClass: 'rescheduled'  };
      case 'interrupted':           return { label: t('patient.sess.status.interrupted'),  pillClass: 'pt-pill-interrupted', iconChar: '\u25d0', iconClass: 'interrupted'  };
      case 'completed':
      case 'done':                  return { label: t('patient.sess.status.completed'),    pillClass: 'pill-active',         iconChar: '\u2713', iconClass: 'done'         };
      default:                      return { label: t('patient.sess.status.done'),         pillClass: 'pill-active',         iconChar: '\u2713', iconClass: 'done'         };
    }
  }

  // ── Modality label ───────────────────────────────────────────────────────────
  function modalityLabel(slug) {
    if (!slug) return null;
    const key = slug.toLowerCase().replace(/[-_\s]/g, '');
    const MAP = {
      tms:'TMS', rtms:'rTMS', dtms:'Deep TMS', tdcs:'tDCS', tacs:'tACS', trns:'tRNS',
      neurofeedback:'Neurofeedback', nfb:'Neurofeedback', hegnfb:'HEG Neurofeedback',
      heg:'HEG Neurofeedback', lensnfb:'LENS Neurofeedback', lens:'LENS Neurofeedback',
      qeeg:'qEEG Assessment', pemf:'PEMF Therapy', biofeedback:'Biofeedback',
      hrvbiofeedback:'HRV Biofeedback', hrv:'HRV Biofeedback', hrvb:'HRV Biofeedback',
      pbm:'Photobiomodulation', nirs:'fNIRS Session', assessment:'Assessment',
    };
    if (MAP[key]) return MAP[key];
    return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  // ── Tolerance → patient-friendly ─────────────────────────────────────────────
  function toleranceLabel(val) {
    if (val == null || val === '') return null;
    const v = String(val).toLowerCase().trim();
    if (!v) return null;
    if (['excellent', 'good', '1', '2'].includes(v))       return t('patient.sess.tol.well');
    if (['mild', 'moderate', '3', '4', '5'].includes(v))   return t('patient.sess.tol.mild');
    if (['poor', '6', '7'].includes(v))                     return t('patient.sess.tol.discomfort');
    if (['high', 'very high', '8', '9', '10'].includes(v)) return t('patient.sess.tol.significant');
    return v.charAt(0).toUpperCase() + v.slice(1);
  }

  // ── Session classification ───────────────────────────────────────────────────
  const PAST_STATUSES = new Set([
    'completed', 'done', 'cancelled', 'missed', 'no-show', 'no_show',
    'interrupted', 'rescheduled',
  ]);
  const now = Date.now();

  const upcoming = sessions
    .filter(s => {
      if (!s.scheduled_at) return false;
      if (new Date(s.scheduled_at).getTime() <= now) return false;
      return !PAST_STATUSES.has((s.status || '').toLowerCase().trim());
    })
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

  const pastSessions = sessions
    .filter(s => {
      if (s.delivered_at) return true;
      const st = (s.status || '').toLowerCase().trim();
      if (PAST_STATUSES.has(st)) return true;
      if (s.scheduled_at && new Date(s.scheduled_at).getTime() <= now) return true;
      return false;
    })
    .sort((a, b) => {
      const da = new Date(b.delivered_at || b.scheduled_at || b.created_at || 0).getTime();
      const db = new Date(a.delivered_at || a.scheduled_at || a.created_at || 0).getTime();
      return da - db;
    });

  // ── Collect feedback from real sessions (non-seed path) ──────────────────────
  if (!_SEED) {
    pastSessions.forEach(s => {
      const note = s.post_session_notes || s.clinician_notes || '';
      if (!note.trim()) return;
      _feedbackItems.push({
        date:           (s.delivered_at || s.scheduled_at || '').slice(0, 10),
        text:           note,
        clinician:      s.clinician_name || s.technician_name || 'Your care team',
        session_number: Number.isFinite(s.session_number) ? s.session_number : null,
      });
    });
  }

  // ── Stable session numbering ─────────────────────────────────────────────────
  const deliveredInOrder = sessions
    .filter(s => s.delivered_at || ['completed', 'done'].includes((s.status || '').toLowerCase().trim()))
    .sort((a, b) => new Date(a.delivered_at || 0) - new Date(b.delivered_at || 0));
  const deliveredNumMap = new Map();
  deliveredInOrder.forEach((s, i) => {
    deliveredNumMap.set(s, Number.isFinite(s.session_number) ? s.session_number : (i + 1));
  });
  function sessionNumFor(s) {
    if (deliveredNumMap.has(s)) return deliveredNumMap.get(s);
    return null;
  }

  // ── Outcomes by date ─────────────────────────────────────────────────────────
  const outcomesByDate = {};
  outcomes.forEach(o => {
    const d = (o.administered_at || '').slice(0, 10);
    if (!d) return;
    if (!outcomesByDate[d]) outcomesByDate[d] = [];
    outcomesByDate[d].push(o);
  });

  // ── Course metrics ───────────────────────────────────────────────────────────
  const totalPlanned   = activeCourse?.total_sessions_planned ?? null;
  const sessDelivered  = activeCourse?.session_count ?? deliveredInOrder.length;
  const sessRemaining  = (totalPlanned != null) ? Math.max(0, totalPlanned - sessDelivered) : null;
  const progressPct    = (totalPlanned && sessDelivered)
    ? Math.round((sessDelivered / totalPlanned) * 100) : null;

  const nextMilestoneDate  = activeCourse?.next_review_date || activeCourse?.milestone_date || null;
  const nextMilestoneLabel = nextMilestoneDate ? fmtDate(nextMilestoneDate) : 'Not yet scheduled';

  function phaseLabel(pct) {
    if (!pct)      return t('patient.phase.starting');
    if (pct <= 25) return t('patient.phase.initial');
    if (pct <= 50) return t('patient.phase.active');
    if (pct <= 75) return t('patient.phase.consolidation');
    if (pct < 100) return t('patient.phase.final');
    return t('patient.phase.complete');
  }

  // ── Prep content ─────────────────────────────────────────────────────────────
  function getDefaultPrepSteps() {
    return [
      { icon: '\ud83d\udebf', text: t('patient.sess.prep.wash') },
      { icon: '\ud83c\udf7d\ufe0f', text: t('patient.sess.prep.eat') },
      { icon: '\ud83d\udc8a', text: t('patient.sess.prep.meds') },
      { icon: '\ud83d\ude34', text: t('patient.sess.prep.sleep') },
      { icon: '\ud83d\udcdd', text: t('patient.sess.prep.note_symptoms') },
      { icon: '\ud83d\udcf5', text: t('patient.sess.prep.phone') },
    ];
  }
  function getDefaultBringList() {
    return [
      t('patient.sess.bring.meds'),
      t('patient.sess.bring.clothing'),
      t('patient.sess.bring.water'),
      t('patient.sess.bring.questions'),
      t('patient.sess.bring.snack'),
    ];
  }
  function getSessionPrep(s) {
    return {
      steps:          getDefaultPrepSteps(),
      bringList:      getDefaultBringList(),
      expectDuration: s.duration_minutes
        ? `${s.duration_minutes}\u00a0minutes`
        : 'approximately 20\u201345\u00a0minutes',
    };
  }

  // ── Countdown label ──────────────────────────────────────────────────────────
  function countdownLabel(daysAway) {
    if (daysAway === 0) return 'Today';
    if (daysAway === 1) return 'Tomorrow';
    return `In ${daysAway} days`;
  }

  // ── Assessment due banner ────────────────────────────────────────────────────
  function assessmentDueBannerHTML(nextSession) {
    if (!nextSession || !assessments.length) return '';
    const nextDate = new Date(nextSession.scheduled_at).getTime();
    const dueSoon  = assessments.filter(a => {
      if (!a.due_date) return false;
      const due = new Date(a.due_date).getTime();
      return due <= nextDate + 2 * 86400000 &&
             !['completed','done'].includes((a.status || '').toLowerCase().trim());
    });
    if (!dueSoon.length) return '';
    const names = dueSoon.slice(0, 2).map(a => esc(a.template_title || a.name || 'Assessment')).join(', ');
    const more  = dueSoon.length > 2 ? ` and ${dueSoon.length - 2} more` : '';
    return `
      <div class="pt-assess-due-banner">
        <div class="pt-adb-icon">\ud83d\udccc</div>
        <div class="pt-adb-content">
          <div class="pt-adb-title">Assessment due before your next session</div>
          <div class="pt-adb-body">${names}${more} — completing this helps your care team plan your treatment.</div>
        </div>
        <button class="btn btn-sm pt-adb-cta"
                onclick="window._navPatient('patient-assessments')">Complete now</button>
      </div>`;
  }

  // ── Next session hero card ───────────────────────────────────────────────────
  function nextSessionHeroHTML(s) {
    const sessionNum   = Number.isFinite(s.session_number)
      ? s.session_number : (sessDelivered + 1);
    const _loc         = getLocale() === 'tr' ? 'tr-TR' : 'en-US';
    const dayStr       = s.scheduled_at
      ? new Date(s.scheduled_at).toLocaleDateString(_loc, { weekday: 'long' }) : '';
    const dateStr      = s.scheduled_at
      ? new Date(s.scheduled_at).toLocaleDateString(_loc, { month: 'long', day: 'numeric', year: 'numeric' }) : '\u2014';
    const timeStr      = s.scheduled_at
      ? new Date(s.scheduled_at).toLocaleTimeString(_loc, { hour: 'numeric', minute: '2-digit' }) : '';
    const daysAway     = s.scheduled_at
      ? Math.max(0, Math.ceil((new Date(s.scheduled_at).getTime() - now) / 86400000)) : null;
    const isToday      = daysAway === 0;
    const isTomorrow   = daysAway === 1;

    const mod          = modalityLabel(s.modality_slug || s.condition_slug);
    const location     = esc(s.location || s.site_name || '');
    const isRemote     = /remote|telehealth|video|virtual/i.test(s.location || s.site_name || '');
    const locationIcon = isRemote ? '\ud83d\udcbb' : '\ud83c\udfe5';
    const locationLabel = location || 'Your clinic';
    const clinician    = esc(s.clinician_name || s.technician_name || '');
    const duration     = s.duration_minutes ? `${s.duration_minutes} min` : null;
    const clinicNotes  = esc(s.clinic_notes || s.instructions || '');

    return `
      <div class="pt-ns-hero ${isToday ? 'today' : isTomorrow ? 'soon' : ''}">
        <div class="pt-ns-eyebrow">Your Next Session</div>

        <div class="pt-ns-main">
          <div class="pt-ns-date-block">
            <div class="pt-ns-day">${esc(dayStr)}</div>
            <div class="pt-ns-date">${esc(dateStr)}</div>
            ${timeStr ? `<div class="pt-ns-time">\ud83d\udd50\u00a0${esc(timeStr)}</div>` : ''}
          </div>
          <div class="pt-ns-meta-block">
            ${daysAway !== null ? `<div class="pt-ns-countdown ${isToday ? 'today' : isTomorrow ? 'soon' : ''}">${countdownLabel(daysAway)}</div>` : ''}
            <div class="pt-ns-meta-row">
              <span class="pt-ns-meta-item">${locationIcon}\u00a0${locationLabel}</span>
            </div>
            ${clinician ? `<div class="pt-ns-meta-row"><span class="pt-ns-meta-item">\ud83d\udc64\u00a0${clinician}</span></div>` : ''}
            <div class="pt-ns-chips">
              ${mod      ? `<span class="pt-ns-chip">${esc(mod)}</span>` : ''}
              ${duration ? `<span class="pt-ns-chip">\u23f1\u00a0${esc(duration)}</span>` : ''}
              <span class="pt-ns-chip pt-ns-chip-session">Session ${sessionNum}</span>
            </div>
          </div>
        </div>

        ${clinicNotes ? `
        <div class="pt-uc-clinic-note">
          <span class="pt-uc-clinic-note-label">${t('patient.sess.clinic_note')}</span>
          ${clinicNotes}
        </div>` : ''}

        <div class="pt-ns-actions">
          <button class="btn btn-primary btn-sm"
                  onclick="document.getElementById('pt-wte-section')?.scrollIntoView({behavior:'smooth',block:'start'})">
            View Preparation Guide
          </button>
          <button class="btn btn-ghost btn-sm"
                  onclick="window._navPatient('patient-messages')">
            Contact Clinic
          </button>
          <button class="btn btn-ghost btn-sm"
                  onclick="window._ptRequestReschedule(0)">
            Request Reschedule
          </button>
        </div>
      </div>`;
  }

  // ── What to Expect — standalone section ──────────────────────────────────────
  function whatToExpectHTML(s) {
    const prep = getSessionPrep(s);
    const mod  = modalityLabel(s.modality_slug || s.condition_slug);

    const duringLine = mod
      ? `You'll be guided through a ${esc(mod)} session by your clinician or technician.`
      : "You'll be guided through your session by your clinician or technician.";

    const hasAssessmentDue = assessments.some(a => {
      if (!a.due_date) return false;
      const due   = new Date(a.due_date).getTime();
      const sessT = new Date(s.scheduled_at).getTime();
      return due <= sessT + 2 * 86400000 &&
             !['completed','done'].includes((a.status || '').toLowerCase().trim());
    });

    return `
      <div class="pt-wte-section" id="pt-wte-section">
        <div class="pt-sess-section-hd" style="margin-bottom:16px">
          <span class="pt-sess-section-title">Before Your Next Session</span>
        </div>

        <div class="pt-wte-grid">
          <div class="pt-wte-col">
            <div class="pt-wte-col-label">Before your session</div>
            <ul class="pt-prep-list">
              ${prep.steps.map(item => `
                <li class="pt-prep-item">
                  <span class="pt-prep-ico">${item.icon}</span>
                  <span>${item.text}</span>
                </li>`).join('')}
            </ul>
          </div>

          <div class="pt-wte-col">
            <div class="pt-wte-col-label">What to bring</div>
            <ul class="pt-prep-list">
              ${prep.bringList.map(item => `
                <li class="pt-prep-item">
                  <span class="pt-prep-ico" style="font-size:10px;opacity:.45">\u25cf</span>
                  <span>${item}</span>
                </li>`).join('')}
            </ul>
          </div>

          <div class="pt-wte-col">
            <div class="pt-wte-col-label">During your session</div>
            <div class="pt-wte-during-box">
              <div style="font-size:12px;color:var(--text-secondary);line-height:1.7">
                ${duringLine}
                Your session will last ${esc(prep.expectDuration)}.
                Let your clinician know at any time if you feel uncomfortable — it's always safe to pause or adjust.
              </div>
            </div>
          </div>

          <div class="pt-wte-col">
            <div class="pt-wte-col-label">After your session</div>
            <div class="pt-wte-after-box">
              <div style="font-size:12px;color:var(--text-secondary);line-height:1.7">
                Most patients can return to normal activities immediately.
                Note any side effects or mood changes in your daily check-in — your care team reviews these.
                If you feel any unexpected symptoms, contact your clinic.
              </div>
            </div>
          </div>
        </div>

        ${hasAssessmentDue ? `
        <div class="pt-wte-assess-callout">
          \ud83d\udccc\u00a0<strong>Reminder:</strong> You have an assessment due before this session.
          <button class="btn btn-ghost btn-sm" style="margin-left:12px"
                  onclick="window._navPatient('patient-assessments')">Complete assessment</button>
        </div>` : ''}

        <div class="pt-uc-prep-footer" style="margin-top:16px">
          <div class="pt-uc-reschedule-note">${t('patient.sess.cancel_note')}</div>
          <button class="btn btn-ghost btn-sm"
                  onclick="window._navPatient('patient-messages')">
            ${t('patient.sess.msg_clinic')}
          </button>
        </div>
      </div>`;
  }

  // ── Compact upcoming card (sessions beyond the first) ────────────────────────
  function upcomingCompactCardHTML(s, listIdx) {
    const sessionNum = Number.isFinite(s.session_number)
      ? s.session_number : (sessDelivered + listIdx + 2);
    const _loc       = getLocale() === 'tr' ? 'tr-TR' : 'en-US';
    const dateShort  = s.scheduled_at
      ? new Date(s.scheduled_at).toLocaleDateString(_loc, { weekday: 'short', month: 'short', day: 'numeric' })
      : '\u2014';
    const timeStr    = s.scheduled_at
      ? new Date(s.scheduled_at).toLocaleTimeString(_loc, { hour: 'numeric', minute: '2-digit' })
      : '';
    const daysAway   = s.scheduled_at
      ? Math.max(0, Math.ceil((new Date(s.scheduled_at).getTime() - now) / 86400000))
      : null;
    const mod        = modalityLabel(s.modality_slug || s.condition_slug);

    return `
      <div class="pt-uc-compact">
        <div class="pt-uc-c-left">
          <div class="pt-uc-c-session">Session ${sessionNum}</div>
          <div class="pt-uc-c-date">${esc(dateShort)}${timeStr ? `\u00a0\u00b7\u00a0${esc(timeStr)}` : ''}</div>
          ${mod ? `<div class="pt-uc-c-mod">${esc(mod)}</div>` : ''}
        </div>
        <div class="pt-uc-c-right">
          ${daysAway !== null ? `<span class="pt-uc-c-days">${countdownLabel(daysAway)}</span>` : ''}
          <span class="pill pill-pending" style="font-size:10px">${t('patient.sess.scheduled')}</span>
        </div>
      </div>`;
  }

  // ── Past / completed session row ─────────────────────────────────────────────
  function pastSessionRowHTML(s, rowIdx) {
    const num            = sessionNumFor(s);
    const status         = statusInfo(s.status);
    const rawSt          = (s.status || '').toLowerCase().trim();
    const isNonDelivered = ['cancelled','missed','no-show','no_show','rescheduled','interrupted'].includes(rawSt);

    const displayDate  = fmtDate(s.delivered_at || s.scheduled_at);
    const dur          = s.duration_minutes ? `${s.duration_minutes} min` : '';
    const mod          = modalityLabel(s.modality_slug || s.condition_slug);
    const tol          = toleranceLabel(s.tolerance_rating);
    const notes        = s.post_session_notes || s.clinician_notes || null;
    const relDate      = (s.delivered_at || s.scheduled_at || '').slice(0, 10);
    const relDocs      = outcomesByDate[relDate] || [];
    const escapedNotes = esc(notes);
    const rowTitle     = num != null ? t('patient.sess.session_n', { n: num }) : status.label;

    const detailItems = isNonDelivered ? [] : [
      tol           ? { label: t('patient.sess.row.how_went'),  val: esc(tol) }                              : null,
      mod           ? { label: t('patient.sess.row.type'),      val: esc(mod) }                              : null,
      dur           ? { label: t('patient.sess.row.duration'),  val: esc(dur) }                              : null,
      s.device_slug ? { label: t('patient.sess.row.equipment'), val: esc(String(s.device_slug).toUpperCase()) } : null,
    ].filter(Boolean);

    // Inline score chips from linked outcomes
    const scoreChips = relDocs
      .filter(o => o.total_score != null || o.score != null)
      .map(o => {
        const score = o.total_score ?? o.score;
        return `<span class="pt-cr-score-chip">${esc(o.template_title || 'Score')}: <strong>${esc(String(score))}</strong></span>`;
      }).join('');

    return `
      <div class="pt-completed-row${isNonDelivered ? ' pt-cr-nondel' : ''}"
           onclick="window._ptToggleCompleted(${rowIdx})"
           tabindex="0" role="button"
           aria-expanded="false" id="pt-cr-row-${rowIdx}"
           onkeydown="if(event.key==='Enter'||event.key===' '){window._ptToggleCompleted(${rowIdx});event.preventDefault();}">
        <div class="pt-cr-summary">
          <div class="pt-session-icon ${status.iconClass}" aria-hidden="true">${status.iconChar}</div>
          <div class="pt-cr-info">
            <div class="pt-cr-title">${esc(rowTitle)}</div>
            <div class="pt-cr-meta">
              ${esc(displayDate)}${dur ? '\u00a0\u00b7\u00a0' + esc(dur) : ''}${mod ? '\u00a0\u00b7\u00a0' + esc(mod) : ''}
              ${tol && !isNonDelivered ? `\u00a0\u00b7\u00a0<span class="pt-cr-tol-inline">${esc(tol)}</span>` : ''}
            </div>
          </div>
          <div class="pt-cr-badges">
            <span class="${status.pillClass} pt-status-pill">${status.label}</span>
            ${relDocs.length > 0 ? `<span class="pt-report-badge">${t('patient.sess.row.report')}</span>` : ''}
            <span id="pt-cr-chev-${rowIdx}" class="pt-cr-chevron" aria-hidden="true">\u25be</span>
          </div>
        </div>

        <div id="pt-cr-detail-${rowIdx}" class="pt-cr-detail" style="display:none">
          ${isNonDelivered ? `
            <div class="pt-cr-nondel-notice ${rawSt}">
              ${(() => {
                if (rawSt === 'cancelled')                              return t('patient.sess.nondel.cancelled');
                if (['missed','no-show','no_show'].includes(rawSt))    return t('patient.sess.nondel.missed');
                if (rawSt === 'rescheduled')                           return t('patient.sess.nondel.rescheduled');
                if (rawSt === 'interrupted')                           return t('patient.sess.nondel.interrupted');
                return t('patient.sess.nondel.default');
              })()}
            </div>` : ''}

          ${detailItems.length > 0 ? `
            <div class="pt-cr-detail-grid">
              ${detailItems.map(r => `
                <div class="pt-cdr-row">
                  <span class="pt-cdr-label">${r.label}</span>
                  <span class="pt-cdr-value">${r.val}</span>
                </div>`).join('')}
            </div>` : ''}

          ${scoreChips ? `<div class="pt-cr-score-row">${scoreChips}</div>` : ''}

          ${escapedNotes ? `
            <div class="pt-cr-notes">
              <div class="pt-cr-notes-label">${t('patient.sess.row.notes')}</div>
              <div class="pt-cr-notes-body">${escapedNotes}</div>
            </div>` : ''}

          ${relDocs.length > 0 ? relDocs.map(doc => `
            <div class="pt-cr-report-link"
                 onclick="event.stopPropagation();window._navPatient('patient-reports')"
                 onkeydown="if(event.key==='Enter'||event.key===' '){event.stopPropagation();window._navPatient('patient-reports');event.preventDefault();}"
                 role="button" tabindex="0">
              <span style="color:var(--blue);font-size:14px">\u25f1</span>
              <span class="pt-cr-report-title">${esc(doc.template_title || 'Assessment Report')}</span>
              <span class="pt-cr-report-action">${t('patient.sess.row.view_doc')}</span>
            </div>`).join('') : ''}

          ${!detailItems.length && !escapedNotes && !relDocs.length && !isNonDelivered
            ? `<div style="font-size:12px;color:var(--text-tertiary);padding:4px 0">${t('patient.sess.row.no_details')}</div>`
            : ''}
        </div>
      </div>`;
  }

  // ── Related documents & feedback ─────────────────────────────────────────────
  function relatedDocsFeedbackHTML() {
    const items = [];
    pastSessions.forEach(s => {
      const relDate = (s.delivered_at || s.scheduled_at || '').slice(0, 10);
      const docs    = outcomesByDate[relDate] || [];
      docs.forEach(doc => items.push({ type: 'report', date: relDate, doc }));
      if (s.post_session_notes || s.clinician_notes) {
        items.push({ type: 'note', date: relDate, session: s });
      }
      if (s.clinic_notes && /task|homework|exercise|practice/i.test(s.clinic_notes)) {
        items.push({ type: 'homework', date: relDate, session: s });
      }
    });

    if (!items.length) {
      return `
        <div class="pt-sess-section">
          <div class="pt-sess-section-hd">
            <span class="pt-sess-section-title">Reports &amp; Feedback</span>
          </div>
          <div class="pt-rdf-empty">
            <div class="pt-rdf-empty-ico">\ud83d\udcc4</div>
            <div class="pt-rdf-empty-title">Reports will appear here</div>
            <div class="pt-rdf-empty-body">Assessment reports and clinical documents linked to your sessions will show up here after they are completed.</div>
          </div>
        </div>`;
    }

    const reports  = items.filter(i => i.type === 'report');

    function reportCardHTML(item) {
      const doc   = item.doc;
      const score = doc.total_score ?? doc.score;
      return `
        <div class="pt-rdf-card" role="button" tabindex="0"
             onclick="window._navPatient('patient-reports')"
             onkeydown="if(event.key==='Enter'||event.key===' '){window._navPatient('patient-reports');}">
          <div class="pt-rdf-card-ico">\ud83d\udcca</div>
          <div class="pt-rdf-card-body">
            <div class="pt-rdf-card-title">${esc(doc.template_title || 'Assessment')}</div>
            <div class="pt-rdf-card-meta">${esc(fmtDate(item.date))}${score != null ? `\u00a0\u00b7\u00a0Score:\u00a0${esc(String(score))}` : ''}</div>
          </div>
          <span class="pt-rdf-card-arrow">\u203a</span>
        </div>`;
    }

    return reports.length === 0 ? '' : `
      <div class="pt-sess-section">
        <div class="pt-sess-section-hd">
          <span class="pt-sess-section-title">Session Reports</span>
          <span class="pt-sess-badge">${reports.length}</span>
        </div>
        <div class="pt-rdf-wrap">
          ${reports.map(reportCardHTML).join('')}
        </div>
      </div>`;
  }

  // ── Feedback from recent sessions ─────────────────────────────────────────────
  function feedbackFromSessionsHTML() {
    if (!_feedbackItems.length) {
      return `
        <div class="pt-sess-section">
          <div class="pt-sess-section-hd">
            <span class="pt-sess-section-title">Feedback From Recent Sessions</span>
          </div>
          <div class="pt-rdf-empty">
            <div class="pt-rdf-empty-ico">\ud83d\udcac</div>
            <div class="pt-rdf-empty-title">No feedback yet</div>
            <div class="pt-rdf-empty-body">After each completed session your care team may leave notes or feedback here. They appear after your appointments.</div>
          </div>
        </div>`;
    }
    return `
      <div class="pt-sess-section">
        <div class="pt-sess-section-hd">
          <span class="pt-sess-section-title">Feedback From Recent Sessions</span>
          <span class="pt-sess-badge">${_feedbackItems.length}</span>
        </div>
        <div class="pt-feedback-list">
          ${_feedbackItems.map(fb => `
            <div class="pt-feedback-card">
              <div class="pt-feedback-icon">\ud83d\udcac</div>
              <div class="pt-feedback-body">
                <div class="pt-feedback-text">${esc(fb.text)}</div>
                <div class="pt-feedback-meta">
                  ${fb.clinician ? `${esc(fb.clinician)}\u00a0\u00b7\u00a0` : ''}${fb.session_number != null ? `Session\u00a0${fb.session_number}\u00a0\u00b7\u00a0` : ''}${esc(fmtDate(fb.date))}
                </div>
              </div>
            </div>`).join('')}
        </div>
      </div>`;
  }

  // ── Aftercare / What to Watch ─────────────────────────────────────────────────
  function aftercareHTML() {
    const mod = modalityLabel(activeCourse?.modality_slug || '');
    const modLine = mod ? `After a ${esc(mod)} session` : 'After your session';
    return `
      <div class="pt-sess-section pt-aftercare-section">
        <div class="pt-sess-section-hd">
          <span class="pt-sess-section-title">Aftercare &amp; What to Watch</span>
        </div>
        <div class="pt-aftercare-grid">

          <div class="pt-aftercare-col">
            <div class="pt-aftercare-col-label">\u2713\u00a0What is normal</div>
            <ul class="pt-prep-list">
              <li class="pt-prep-item"><span class="pt-prep-ico pt-ac-ok">\u2713</span><span>${modLine}, mild fatigue or scalp sensitivity is common and usually passes within an hour.</span></li>
              <li class="pt-prep-item"><span class="pt-prep-ico pt-ac-ok">\u2713</span><span>A mild headache right after stimulation is not unusual and typically resolves the same day.</span></li>
              <li class="pt-prep-item"><span class="pt-prep-ico pt-ac-ok">\u2713</span><span>Mood can fluctuate in early sessions. Changes tend to stabilise as the course continues.</span></li>
            </ul>
          </div>

          <div class="pt-aftercare-col">
            <div class="pt-aftercare-col-label">! Contact your clinic if</div>
            <ul class="pt-prep-list">
              <li class="pt-prep-item"><span class="pt-prep-ico pt-ac-warn">!</span><span>A headache lasts more than 24 hours or feels unusually severe.</span></li>
              <li class="pt-prep-item"><span class="pt-prep-ico pt-ac-warn">!</span><span>You experience sudden or significant mood changes that feel out of character.</span></li>
              <li class="pt-prep-item"><span class="pt-prep-ico pt-ac-warn">!</span><span>Any symptom that concerns you \u2014 there is no threshold too small to mention.</span></li>
            </ul>
          </div>

          <div class="pt-aftercare-col">
            <div class="pt-aftercare-col-label">\u25ce\u00a0Keep doing between sessions</div>
            <ul class="pt-prep-list">
              <li class="pt-prep-item"><span class="pt-prep-ico">\u25ce</span><span>Your daily check-in \u2014 mood, sleep, and energy logs help your care team track your response.</span></li>
              <li class="pt-prep-item"><span class="pt-prep-ico">\u25ce</span><span>Breathing, mindfulness, or sleep practices your clinician has recommended.</span></li>
              <li class="pt-prep-item"><span class="pt-prep-ico">\u25ce</span><span>Regular meals and good hydration, especially on session days.</span></li>
            </ul>
          </div>

        </div>
        <div class="pt-aftercare-emergency">
          If you are in crisis or need urgent support, contact your clinic or reach a crisis line immediately.
          <button class="btn btn-ghost btn-sm" style="margin-left:12px;flex-shrink:0"
                  onclick="window._navPatient('patient-messages')">Message Clinic</button>
        </div>
      </div>`;
  }

  // ── Page HTML ────────────────────────────────────────────────────────────────
  const nextSession = upcoming[0] || null;
  const _phaseDisplay = esc(activeCourse?.phase || phaseLabel(progressPct));
  const _reviewLabel  = nextMilestoneDate
    ? `After Session\u00a04\u00a0\u00b7\u00a0${esc(fmtDate(nextMilestoneDate))}`
    : 'Not yet scheduled';

  // ── Design · Patient Sessions (ps-*) —————————————————————————————————————
  // Classify each session as clinic / home based on available metadata so the
  // split card renders honest counts (falls back to "clinic" when nothing is
  // known, which matches the current in-clinic-only reality for most courses).
  function _psIsHome(s) {
    const loc = String(s.location || s.venue || s.session_type || '').toLowerCase();
    const hm = !!(s.is_home || s.home_session || s.home);
    return hm || /home|remote|self|telehealth|at-home/.test(loc);
  }
  const _psCompleted = pastSessions.filter(s => {
    const st = String(s.status || '').toLowerCase().trim();
    return st === 'completed' || st === 'done' || !!s.delivered_at;
  });
  const _psClinicSplit = {
    clinicTotal: _psCompleted.filter(s => !_psIsHome(s)).length
      + upcoming.filter(s => !_psIsHome(s)).length,
    clinicDone:  _psCompleted.filter(s => !_psIsHome(s)).length,
    homeTotal:   _psCompleted.filter(s =>  _psIsHome(s)).length
      + upcoming.filter(s =>  _psIsHome(s)).length,
    homeDone:    _psCompleted.filter(s =>  _psIsHome(s)).length,
  };
  function _psPct(done, total) {
    if (!total) return 0;
    return Math.max(0, Math.min(100, Math.round(done / total * 100)));
  }
  function _psRingOffset(pct) {
    const C = 2 * Math.PI * 22;
    return (C - (pct / 100) * C).toFixed(2);
  }

  // Avg comfort from completed sessions (comfort_rating 1-10; fall back to
  // tolerance_rating mapping if comfort not provided). Returns null when
  // nothing to average — we then render "—" not a fake number.
  const _psAvgComfort = (() => {
    const vals = [];
    for (const s of _psCompleted) {
      let v = Number(s.comfort_rating);
      if (Number.isFinite(v)) { vals.push(v); continue; }
      const tol = String(s.tolerance_rating || '').toLowerCase().trim();
      if (tol === 'excellent')     vals.push(9.5);
      else if (tol === 'good')     vals.push(8.5);
      else if (tol === 'mild')     vals.push(7);
      else if (tol === 'moderate') vals.push(5);
      else if (tol === 'poor')     vals.push(3);
    }
    if (!vals.length) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  })();

  // Live session (only render the banner when something is actually live).
  const _psLiveSession = sessions.find(s => {
    const st = String(s.status || '').toLowerCase().trim();
    return st === 'live' || st === 'in_progress' || st === 'active';
  }) || null;

  // Combined + ordered list for the 2-col grid (upcoming first, then completed).
  const _psList = [...upcoming, ..._psCompleted];

  // Given a date, return a short "when" label for upcoming items:
  // "This week" / "Next week" / "Week N" / "Final · review" for the very last.
  function _psWhenLabel(s, isLastUpcoming) {
    const d = new Date(s.scheduled_at || s.delivered_at || 0);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const mondayOfThisWeek = (() => {
      const x = new Date(now); x.setHours(0, 0, 0, 0);
      const dow = (x.getDay() + 6) % 7;
      x.setDate(x.getDate() - dow);
      return x;
    })();
    const diffWeeks = Math.floor((d.getTime() - mondayOfThisWeek.getTime()) / (7 * 86400000));
    if (isLastUpcoming) return 'Final · review';
    if (diffWeeks <= 0) return 'This week';
    if (diffWeeks === 1) return 'Next week';
    return 'Week ' + (diffWeeks + 1);
  }

  // Render one list item with real fields. No fabricated n/score if absent.
  // Matches the new design: left date column, body has "<modality> · <type
  // session>" title and "#N · <time> · <mins> planned|delivered|In progress"
  // meta row, right column stacks pill + "when" label.
  function _psItemHtml(s, idx, ctx) {
    ctx = ctx || {};
    const d = new Date(s.scheduled_at || s.delivered_at || 0);
    const hasDate = !isNaN(d.getTime());
    const mo  = hasDate ? d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase() : '—';
    const day = hasDate ? d.getDate() : '—';
    const dow = hasDate ? d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase() : '';
    const num = sessionNumFor(s) || s.session_number || null;
    const stRaw = String(s.status || '').toLowerCase().trim();
    const live = stRaw === 'live' || stRaw === 'in_progress' || stRaw === 'active';
    const skipped = stRaw === 'missed' || stRaw === 'no-show' || stRaw === 'no_show' || stRaw === 'cancelled';
    const isFuture = hasDate && d.getTime() > Date.now() && !live;
    const home = _psIsHome(s);
    const modLbl = modalityLabel(s.modality_slug) || 'Session';
    const typeLbl = home ? 'Home session' : 'Clinic session';
    const mins = s.duration_minutes;
    const timeStr = hasDate ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
    const elapsedMin = live && hasDate ? Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000)) : null;
    const metaBits = [];
    if (num) metaBits.push('#' + num);
    if (live && elapsedMin != null) {
      metaBits.push('Started ' + timeStr);
      metaBits.push('In progress');
    } else if (isFuture) {
      if (timeStr) metaBits.push(timeStr);
      if (mins)   metaBits.push(mins + ' min planned');
    } else {
      if (timeStr) metaBits.push(timeStr);
      if (mins)   metaBits.push(mins + ' min delivered');
    }
    const pill = live
      ? '<span class="ps-item-pill live">&#9679; Live</span>'
      : skipped
        ? '<span class="ps-item-pill skipped">Skipped</span>'
        : home
          ? '<span class="ps-item-pill home">Home</span>'
          : '<span class="ps-item-pill clinic">Clinic</span>';
    let whenLbl = '';
    if (live) whenLbl = 'Ramping up';
    else if (isFuture) whenLbl = _psWhenLabel(s, !!ctx.isLastUpcoming);
    else if (hasDate) whenLbl = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const classes = ['ps-item'];
    if (live) classes.push('live');
    if (skipped) classes.push('skipped');
    return `
      <button class="${classes.join(' ')}" data-status="${isFuture ? 'upcoming' : live ? 'live' : 'completed'}" data-loc="${home ? 'home' : 'clinic'}" onclick="window._psSelectSession(${idx})">
        <div class="ps-item-date">
          <div class="mo">${esc(mo)}</div>
          <div class="d">${esc(String(day))}</div>
          <div class="dow">${esc(dow)}</div>
        </div>
        <div class="ps-item-body">
          <div class="ps-item-title">${esc(modLbl)} <span class="sep">·</span> ${esc(typeLbl)}</div>
          <div class="ps-item-meta">
            ${metaBits.map(b => '<span>' + esc(b) + '</span>').join('')}
          </div>
        </div>
        <div class="ps-item-right">
          ${pill}
          ${whenLbl ? '<div class="ps-item-when">' + esc(whenLbl) + '</div>' : ''}
        </div>
      </button>`;
  }

  // Group list items into LIVE NOW / UPCOMING / COMPLETED sections with
  // labels. Handles the mockup's "LIVE NOW · 1", "UPCOMING · 7", "COMPLETED ·
  // 12" headings. Hides sections that have zero items.
  function _psGroupedListHtml() {
    if (!_psList.length) {
      return `<div class="ps-empty">No sessions yet. Your first session will appear here when it is available in the portal workflow.</div>`;
    }
    const liveIdxs      = [];
    const upcomingIdxs  = [];
    const completedIdxs = [];
    _psList.forEach((s, i) => {
      const st = String(s.status || '').toLowerCase().trim();
      if (st === 'live' || st === 'in_progress' || st === 'active') liveIdxs.push(i);
      else if (st === 'completed' || st === 'done' || s.delivered_at) completedIdxs.push(i);
      else upcomingIdxs.push(i);
    });
    const parts = [];
    if (liveIdxs.length) {
      parts.push(`<div class="ps-group-lbl">Live now · ${liveIdxs.length}</div>`);
      liveIdxs.forEach(i => parts.push(_psItemHtml(_psList[i], i)));
    }
    if (upcomingIdxs.length) {
      parts.push(`<div class="ps-group-lbl">Upcoming · ${upcomingIdxs.length}</div>`);
      const lastIdx = upcomingIdxs[upcomingIdxs.length - 1];
      upcomingIdxs.forEach(i => parts.push(_psItemHtml(_psList[i], i, { isLastUpcoming: i === lastIdx })));
    }
    if (completedIdxs.length) {
      parts.push(`<div class="ps-group-lbl">Completed · ${completedIdxs.length}</div>`);
      completedIdxs.forEach(i => parts.push(_psItemHtml(_psList[i], i)));
    }
    return parts.join('');
  }

  // LIVE-session detail variant — richer panel matching the mockup:
  // hero + action buttons + LIVE parameter grid + stimulation waveform + live
  // monitoring checklist. Only rendered when the selected session is live.
  function _psDetailLiveHtml(s) {
    const d = new Date(s.scheduled_at || s.delivered_at || Date.now());
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const num = sessionNumFor(s) || s.session_number || null;
    const total = activeCourse?.total_sessions_planned || '—';
    const home = _psIsHome(s);
    const locLabel = (home ? 'At-home' : 'In-clinic').toUpperCase();
    const clinician = activeCourse?.primary_clinician_name || 'Your clinician';
    const elapsedMin = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
    const plannedMin = s.duration_minutes || 20;
    const mA = s.stimulation_mA != null ? s.stimulation_mA : 2.0;
    const target = s.target_site || 'F3 / FP2';
    const montage = home ? 'Home headset' : 'Left DLPFC';
    const imp = s.impedance_kohm != null ? s.impedance_kohm : 4.2;

    return `
      <div class="ps-detail-hero">
        <div class="ps-detail-kicker">SESSION ${num ? '#' + num : '—'}${total !== '—' ? ' / ' + total : ''} · ${esc(locLabel)} · ${esc(String(clinician).toUpperCase())} · <strong>TODAY</strong></div>
        <div class="ps-detail-title">Live: ramp-up in progress</div>
        <div class="ps-detail-sub">Stay seated. Your technician is monitoring in real time. Tap the button if anything feels off.</div>
        <div class="ps-detail-meta">
          <div><div class="ps-detail-meta-lbl">Date</div><div class="ps-detail-meta-val">${esc(dateStr)}</div></div>
          <div><div class="ps-detail-meta-lbl">Time</div><div class="ps-detail-meta-val">Now</div></div>
          <div><div class="ps-detail-meta-lbl">Target</div><div class="ps-detail-meta-val">${esc(target)}</div></div>
          <div><div class="ps-detail-meta-lbl">Duration</div><div class="ps-detail-meta-val">${esc(String(plannedMin))} min</div></div>
          <div><div class="ps-detail-meta-lbl">Clinician</div><div class="ps-detail-meta-val">${esc(clinician)}</div></div>
        </div>
        <div class="ps-detail-actions">
          <button class="btn btn-primary btn-sm" onclick="window._navPatient && window._navPatient('patient-messages')"><span style="color:#04121c">&#9679;</span>&nbsp;Message clinician</button>
          <button class="btn-outline" onclick="window._psReportStop && window._psReportStop()">Stop session</button>
          <button class="btn-outline" onclick="window._psReportDiscomfort && window._psReportDiscomfort()">Report discomfort</button>
        </div>
      </div>
      <div class="ps-detail-body">
        <div class="ps-sec">
          <div class="ps-sec-title">
            <div class="i"><svg><use href="#i-settings"/></svg></div>Parameters <span class="ps-live-tag">· LIVE</span>
          </div>
          <div class="ps-params">
            <div class="ps-param">
              <div class="ps-param-lbl">Dose reached</div>
              <div class="ps-param-val">${esc(String(mA))}<small>mA</small></div>
              <div class="ps-param-sub">Target ${esc(String(mA))} mA</div>
            </div>
            <div class="ps-param">
              <div class="ps-param-lbl">Duration</div>
              <div class="ps-param-val">${esc(String(plannedMin))}<small>min</small></div>
              <div class="ps-param-sub">Elapsed · ${esc(String(elapsedMin))} min</div>
            </div>
            <div class="ps-param">
              <div class="ps-param-lbl">Impedance</div>
              <div class="ps-param-val">${esc(String(imp))}<small>kΩ</small></div>
              <div class="ps-param-sub">Within range</div>
            </div>
            <div class="ps-param">
              <div class="ps-param-lbl">Montage</div>
              <div class="ps-param-val mono">${esc(target)}</div>
              <div class="ps-param-sub">${esc(montage)}</div>
            </div>
          </div>
        </div>

        <div class="ps-sec">
          <div class="ps-sec-title"><div class="i"><svg><use href="#i-pulse"/></svg></div>Stimulation waveform</div>
          <div class="ps-wave">
            <svg viewBox="0 0 600 100" preserveAspectRatio="none">
              <defs>
                <linearGradient id="ps-wave-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="rgba(0,212,188,0.28)"/>
                  <stop offset="100%" stop-color="rgba(0,212,188,0.0)"/>
                </linearGradient>
              </defs>
              <path d="M0,92 L80,92 L160,14 L440,14 L520,92 L600,92 Z" fill="url(#ps-wave-fill)"/>
              <path d="M0,92 L80,92 L160,14 L440,14 L520,92 L600,92" fill="none" stroke="#00d4bc" stroke-width="2"/>
              <circle cx="${Math.max(10, Math.min(590, 80 + (elapsedMin / plannedMin) * 440))}" cy="14" r="4" fill="#00d4bc"/>
              <line x1="${Math.max(10, Math.min(590, 80 + (elapsedMin / plannedMin) * 440))}" y1="4" x2="${Math.max(10, Math.min(590, 80 + (elapsedMin / plannedMin) * 440))}" y2="92" stroke="#00d4bc" stroke-width="1" stroke-dasharray="3,3"/>
              <text x="10" y="20" fill="rgba(255,255,255,0.45)" font-size="9" font-family="monospace">${esc(String(mA))} mA</text>
            </svg>
            <div class="ps-wave-phases">
              <span>Ramp-up<br>30s</span>
              <span>Plateau · ${esc(String(plannedMin))} min @ ${esc(String(mA))} mA</span>
              <span>Ramp-down<br>30s</span>
            </div>
          </div>
        </div>

        <div class="ps-sec">
          <div class="ps-sec-title"><div class="i"><svg><use href="#i-shield"/></svg></div>Live monitoring</div>
          <div class="ps-checklist">
            <div class="ps-checklist-item"><svg width="14" height="14"><use href="#i-check"/></svg>Impedance stable · ${esc(String(imp))} kΩ</div>
            <div class="ps-checklist-item"><svg width="14" height="14"><use href="#i-check"/></svg>Your technician is monitoring</div>
            <div class="ps-checklist-item"><svg width="14" height="14"><use href="#i-check"/></svg>Auto-stop armed if impedance &gt; 10 kΩ</div>
            <div class="ps-checklist-item warn"><svg width="14" height="14"><use href="#i-alert"/></svg>Tingling near F3 is normal during the first minute</div>
          </div>
        </div>
      </div>`;
  }

  // Detail card for the selected session (default = live > nextSession > most recent completed).
  function _psDetailHtml(s) {
    if (!s) {
      return `
        <div class="ps-detail-hero">
          <div class="ps-detail-title">Select a session</div>
          <div class="ps-detail-sub">Pick an item from the list to see parameters, comfort, clinician notes, and prep reminders.</div>
        </div>`;
    }
    const stRaw0 = String(s.status || '').toLowerCase().trim();
    if (stRaw0 === 'live' || stRaw0 === 'in_progress' || stRaw0 === 'active') {
      return _psDetailLiveHtml(s);
    }
    const d = new Date(s.scheduled_at || s.delivered_at || 0);
    const hasDate = !isNaN(d.getTime());
    const dateStr = hasDate ? d.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' }) : '—';
    const timeStr = hasDate ? d.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' }) : '';
    const stRaw = stRaw0;
    const live = false;
    const num = sessionNumFor(s);
    const modLbl = modalityLabel(s.modality_slug) || 'Session';
    const home = _psIsHome(s);
    const kicker = live
      ? '<strong>Live now</strong> · in progress'
      : hasDate && d.getTime() > Date.now()
        ? '<strong>Upcoming</strong> · ' + esc(dateStr)
        : '<strong>Completed</strong> · ' + esc(dateStr);
    const sub = s.summary || s.post_session_notes || s.clinician_notes || (home
      ? 'Home session · follow your device-guided prompts and log anything unusual afterward.'
      : 'In-clinic session with your care team. Ask your clinician about anything unclear.');
    const metaParts = [
      { lbl: 'Session', val: num ? ('#' + num) : '—' },
      { lbl: 'Modality', val: modLbl },
      { lbl: 'Location', val: s.location || (home ? 'At-home' : 'In-clinic') },
      { lbl: 'Duration', val: s.duration_minutes ? s.duration_minutes + ' min' : '—' },
      { lbl: 'Time', val: timeStr || '—' },
    ];

    const amplitude = s.stimulation_mA ?? s.current_mA ?? s.target_mA;
    const frequency = s.frequency_hz ?? s.pulse_frequency_hz;
    const targetSite = s.target_site || s.montage || null;
    const rampUpS = s.ramp_up_sec ?? s.ramp_seconds;
    const paramsHtml = [];
    if (amplitude != null || targetSite || frequency != null || rampUpS != null) {
      if (amplitude != null) paramsHtml.push(`<div class="ps-param"><div class="ps-param-lbl">Amplitude</div><div class="ps-param-val">${esc(amplitude)}<small>mA</small></div></div>`);
      if (frequency != null) paramsHtml.push(`<div class="ps-param"><div class="ps-param-lbl">Frequency</div><div class="ps-param-val">${esc(frequency)}<small>Hz</small></div></div>`);
      if (targetSite)        paramsHtml.push(`<div class="ps-param"><div class="ps-param-lbl">Target</div><div class="ps-param-val mono">${esc(targetSite)}</div></div>`);
      if (rampUpS != null)   paramsHtml.push(`<div class="ps-param"><div class="ps-param-lbl">Ramp-up</div><div class="ps-param-val">${esc(rampUpS)}<small>s</small></div></div>`);
    }
    const paramsSection = paramsHtml.length ? `
      <div class="ps-sec">
        <div class="ps-sec-title"><div class="i"><svg><use href="#i-settings"/></svg></div>Protocol parameters</div>
        <div class="ps-params">${paramsHtml.join('')}</div>
      </div>` : '';

    const comfortVal = Number(s.comfort_rating);
    const comfortSection = Number.isFinite(comfortVal) ? `
      <div class="ps-sec">
        <div class="ps-sec-title"><div class="i"><svg><use href="#i-heart"/></svg></div>Comfort rating</div>
        <div class="ps-comfort-row">
          <div class="ps-comfort-faces">
            ${['😣','😕','😐','🙂','😊'].map((f, i) => {
              const midpoint = (i + 1) * 2;
              const on = Math.round(comfortVal / 2) === i + 1;
              return `<div class="ps-comfort-face${on ? ' on' : ''}">${f}</div>`;
            }).join('')}
          </div>
          <div class="ps-comfort-info">
            <div class="ps-comfort-info-val">${comfortVal.toFixed(1)}</div>
            <div class="ps-comfort-info-lbl">out of 10</div>
          </div>
        </div>
      </div>` : '';

    const note = s.post_session_notes || s.clinician_notes;
    const noteSection = note ? `
      <div class="ps-sec">
        <div class="ps-sec-title"><div class="i"><svg><use href="#i-mail"/></svg></div>Clinician note</div>
        <div class="ps-note">
          <div class="ps-note-hd">
            <div class="ps-note-av">${esc((s.clinician_name || 'CT').split(/\s+/).map(p => p[0] || '').slice(0,2).join('').toUpperCase())}</div>
            <div>
              <div class="ps-note-who">${esc(s.clinician_name || 'Your care team')}</div>
              <div class="ps-note-when">${esc(dateStr)}</div>
            </div>
          </div>
          <div class="ps-note-body">${esc(note)}</div>
        </div>
      </div>` : '';

    const actions = hasDate && d.getTime() > Date.now() && !live
      ? `<button class="btn btn-ghost btn-sm" onclick="window._ptRequestReschedule && window._ptRequestReschedule()">Request reschedule</button>
         <button class="btn btn-primary btn-sm" onclick="window._navPatient('patient-messages')">Message care team</button>`
      : `<button class="btn btn-ghost btn-sm" onclick="window._navPatient('patient-messages')">Message care team</button>`;

    return `
      <div class="ps-detail-hero">
        <div class="ps-detail-kicker">${kicker}</div>
        <div class="ps-detail-title">${esc(modLbl)}${num ? ' · Session #' + num : ''}</div>
        <div class="ps-detail-sub">${esc(sub)}</div>
        <div class="ps-detail-meta">
          ${metaParts.map(m => `<div><div class="ps-detail-meta-lbl">${esc(m.lbl)}</div><div class="ps-detail-meta-val">${esc(m.val)}</div></div>`).join('')}
        </div>
        <div class="ps-detail-actions">${actions}</div>
      </div>
      <div class="ps-detail-body">
        ${paramsSection}
        ${comfortSection}
        ${noteSection}
      </div>`;
  }

  // Pick default detail: live → next upcoming → latest completed.
  const _psInitialIdx = (() => {
    const liveI = _psList.findIndex(s => {
      const st = String(s.status || '').toLowerCase().trim();
      return st === 'live' || st === 'in_progress' || st === 'active';
    });
    if (liveI >= 0) return liveI;
    if (upcoming.length) return 0;
    if (_psCompleted.length) return upcoming.length;
    return 0;
  })();

  // Comparison chart points (comfort by default). Returns a serialisable array
  // of { x:Date, y:value|null, loc:'clinic'|'home', status:'completed'|'skipped' }.
  function _psChartPoints(metric) {
    return _psCompleted
      .map(s => {
        const d = new Date(s.delivered_at || s.scheduled_at || 0);
        if (isNaN(d.getTime())) return null;
        let y = null;
        if (metric === 'comfort') {
          y = Number(s.comfort_rating);
          if (!Number.isFinite(y)) {
            const tol = String(s.tolerance_rating || '').toLowerCase();
            if (tol === 'excellent')     y = 9.5;
            else if (tol === 'good')     y = 8.5;
            else if (tol === 'mild')     y = 7;
            else if (tol === 'moderate') y = 5;
            else if (tol === 'poor')     y = 3;
          }
        } else if (metric === 'impedance') {
          y = Number(s.impedance_kohm ?? s.impedance);
        } else if (metric === 'phq9') {
          const same = outcomesByDate[(s.delivered_at || '').slice(0, 10)] || [];
          const phq = same.find(o => /phq/i.test(o.template_slug || o.template_name || ''));
          y = phq ? Number(phq.score_numeric) : null;
        }
        return {
          x: d.getTime(),
          y: Number.isFinite(y) ? y : null,
          loc: _psIsHome(s) ? 'home' : 'clinic',
          status: String(s.status || '').toLowerCase() === 'missed' ? 'skipped' : 'completed',
        };
      })
      .filter(Boolean);
  }
  function _psChartHtml(metric) {
    const pts = _psChartPoints(metric);
    if (!pts.length) {
      return `<div class="ps-empty" style="margin:8px 10px">No data to chart yet — this updates as sessions are logged.</div>`;
    }
    const xs = pts.map(p => p.x);
    const xMin = Math.min(...xs), xMax = Math.max(...xs) || (xMin + 1);
    const ys = pts.map(p => p.y).filter(v => v != null);
    const yMin = ys.length ? Math.min(...ys) : 0;
    const yMax = ys.length ? Math.max(...ys) : 10;
    const yRange = (yMax - yMin) || 1;
    const xMapPct = (x) => ((x - xMin) / ((xMax - xMin) || 1)) * 90 + 5;
    const yMapPct = (y) => 90 - (((y - yMin) / yRange) * 80);

    // Polyline connecting dots (ignoring null y values).
    const linePts = pts
      .filter(p => p.y != null)
      .map(p => xMapPct(p.x).toFixed(1) + ',' + yMapPct(p.y).toFixed(1))
      .join(' ');

    const dots = pts.map((p, i) => {
      if (p.y == null) return '';
      const left = xMapPct(p.x);
      const top  = yMapPct(p.y);
      const cls = p.status === 'skipped' ? 'skipped' : p.loc;
      return `<div class="ps-compare-dot ${cls}" style="left:${left.toFixed(1)}%;top:${top.toFixed(1)}%" data-idx="${i}" title="${esc(new Date(p.x).toLocaleDateString('en-US', { month:'short', day:'numeric' }) + ' · ' + p.y)}"></div>`;
    }).join('');

    // X-axis tick labels: course-start / ~mid / today / final. Compute weeks
    // from course start to label milestones consistently.
    const courseStart = new Date(xMin);
    const today = Date.now();
    const labels = [];
    labels.push(`<span>${esc(courseStart.toLocaleDateString('en-US', { month:'short', day:'numeric' }))} · Week 1</span>`);
    const midWeeks = Math.max(2, Math.round(((xMin + xMax) / 2 - xMin) / (7 * 86400000)));
    labels.push(`<span>${esc(new Date(xMin + ((xMax - xMin) / 2)).toLocaleDateString('en-US', { month:'short' }))} · Week ${midWeeks}</span>`);
    if (today >= xMin && today <= xMax) {
      labels.push(`<span>Today</span>`);
    } else {
      labels.push(`<span>${esc(new Date(xMax).toLocaleDateString('en-US', { month:'short', day:'numeric' }))}</span>`);
    }

    return `
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;inset:10px 0 30px;width:100%;height:calc(100% - 40px);pointer-events:none">
        <polyline points="${linePts}" fill="none" stroke="rgba(0,212,188,0.55)" stroke-width="0.6" stroke-linejoin="round" stroke-linecap="round"/>
      </svg>
      ${dots}
      <div class="ps-compare-x">${labels.join('')}</div>`;
  }

  el.innerHTML = `
    ${_SEED ? `<div class="hw-demo-banner" role="status">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <strong>Demo data</strong>
      &mdash; sample session history shown while your clinic is being set up. Your real sessions will appear once your care team connects your account.
    </div>` : ''}

    <!-- Page header -->
    <div class="ps-hd">
      <div>
        <h2>Sessions</h2>
        <p>${activeCourse
          ? `Your ${esc(modalityLabel(activeCourse.modality_slug) || 'treatment')} course · <strong style="color:var(--teal)">${sessDelivered} of ${totalPlanned ?? '?'} sessions complete</strong>. Review past sessions, join upcoming ones, or start a home session on your prescribed days.`
          : "You don\u2019t have an active course yet. Once your care team schedules sessions, they will appear here."}</p>
      </div>
      <div class="ps-hd-stats">
        <div class="ps-stat"><div class="ps-stat-num">${_psCompleted.length}</div><div class="ps-stat-lbl">Completed</div></div>
        <div class="ps-stat accent-blue"><div class="ps-stat-num">${upcoming.length}</div><div class="ps-stat-lbl">Upcoming</div></div>
        <div class="ps-stat accent-violet"><div class="ps-stat-num">${_psAvgComfort != null ? _psAvgComfort : '—'}</div><div class="ps-stat-lbl">Avg comfort</div></div>
      </div>
    </div>

    <!-- Home / Clinic split -->
    <div class="ps-split">
      <div class="ps-split-card">
        <div class="ps-split-ico clinic"><svg width="18" height="18"><use href="#i-pulse"/></svg></div>
        <div>
          <div class="ps-split-info-lbl">In-clinic</div>
          <div class="ps-split-info-val">${_psClinicSplit.clinicDone}<small>/ ${_psClinicSplit.clinicTotal || '—'} complete</small></div>
        </div>
        <div class="ps-split-prog">
          <svg viewBox="0 0 54 54">
            <circle cx="27" cy="27" r="22" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="4"/>
            <circle cx="27" cy="27" r="22" fill="none" stroke="#4a9eff" stroke-width="4" stroke-linecap="round" stroke-dasharray="138.23" stroke-dashoffset="${_psRingOffset(_psPct(_psClinicSplit.clinicDone, _psClinicSplit.clinicTotal))}"/>
          </svg>
          <div class="ps-split-prog-n">${_psPct(_psClinicSplit.clinicDone, _psClinicSplit.clinicTotal)}%</div>
        </div>
      </div>
      <div class="ps-split-card">
        <div class="ps-split-ico home"><svg width="18" height="18"><use href="#i-home"/></svg></div>
        <div>
          <div class="ps-split-info-lbl">At-home</div>
          <div class="ps-split-info-val">${_psClinicSplit.homeDone}<small>/ ${_psClinicSplit.homeTotal || '—'} complete</small></div>
        </div>
        <div class="ps-split-prog">
          <svg viewBox="0 0 54 54">
            <circle cx="27" cy="27" r="22" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="4"/>
            <circle cx="27" cy="27" r="22" fill="none" stroke="#9b7fff" stroke-width="4" stroke-linecap="round" stroke-dasharray="138.23" stroke-dashoffset="${_psRingOffset(_psPct(_psClinicSplit.homeDone, _psClinicSplit.homeTotal))}"/>
          </svg>
          <div class="ps-split-prog-n">${_psPct(_psClinicSplit.homeDone, _psClinicSplit.homeTotal)}%</div>
        </div>
      </div>
    </div>

    <!-- LIVE banner — only when a session is actually in progress -->
    ${_psLiveSession ? `
    <div class="ps-live">
      <div class="ps-live-icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#04121c" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
      </div>
      <div class="ps-live-body">
        <div class="ps-live-badge">Live now</div>
        <div class="ps-live-title">${esc(modalityLabel(_psLiveSession.modality_slug) || 'Session')}${sessionNumFor(_psLiveSession) ? ' · #' + sessionNumFor(_psLiveSession) : ''}</div>
        <div class="ps-live-sub">${esc(_psLiveSession.target_site || _psLiveSession.location || 'In progress — follow your device-guided prompts.')}</div>
      </div>
    </div>` : ''}

    <!-- Assessment due banner (existing feature, preserved) -->
    ${assessmentDueBannerHTML(nextSession)}

    <!-- Filters -->
    <div class="ps-filters" id="ps-filters">
      <button class="ps-filter active" data-f="all" onclick="window._psFilter && window._psFilter('all')">All <span class="count">${_psList.length}</span></button>
      ${_psLiveSession ? `<button class="ps-filter" data-f="live" onclick="window._psFilter && window._psFilter('live')">Live <span class="count">1</span></button>` : ''}
      <button class="ps-filter" data-f="upcoming" onclick="window._psFilter && window._psFilter('upcoming')">Upcoming <span class="count">${upcoming.length}</span></button>
      <button class="ps-filter" data-f="completed" onclick="window._psFilter && window._psFilter('completed')">Completed <span class="count">${_psCompleted.length}</span></button>
      <button class="ps-filter" data-f="clinic" onclick="window._psFilter && window._psFilter('clinic')">In-clinic <span class="count">${_psClinicSplit.clinicTotal}</span></button>
      <button class="ps-filter" data-f="home" onclick="window._psFilter && window._psFilter('home')">At-home <span class="count">${_psClinicSplit.homeTotal}</span></button>
      <input class="ps-filter-search" id="ps-search" placeholder="Search by date, note, symptom…" oninput="window._psSearch && window._psSearch(this.value)" />
    </div>

    <!-- Main 2-col: list + detail -->
    <div class="ps-grid">
      <div class="ps-list" id="ps-list">
        ${_psGroupedListHtml()}
      </div>
      <div class="ps-detail">
        <div class="ps-detail-card" id="ps-detail-card">
          ${_psDetailHtml(_psList[_psInitialIdx] || null)}
        </div>
      </div>
    </div>

    <!-- Comparison / trend chart -->
    ${_psCompleted.length ? `
    <div class="ps-compare">
      <div class="ps-compare-hd">
        <div>
          <h3>Session trends</h3>
          <p>Comfort${outcomes.length ? ', impedance, and PHQ-9' : ''} across your course · tap a point to see that session</p>
        </div>
        <div class="ps-compare-tabs" id="ps-compare-tabs">
          <button class="active" data-metric="comfort" onclick="window._psMetric && window._psMetric('comfort')">Comfort</button>
          <button data-metric="impedance" onclick="window._psMetric && window._psMetric('impedance')">Impedance</button>
          <button data-metric="phq9" onclick="window._psMetric && window._psMetric('phq9')">PHQ-9</button>
        </div>
      </div>
      <div class="ps-compare-chart" id="ps-compare-chart">${_psChartHtml('comfort')}</div>
      <div class="ps-compare-legend" style="margin-top:14px">
        <span><span class="sw" style="background:var(--teal)"></span>Clinic session</span>
        <span><span class="sw" style="background:var(--violet)"></span>Home session</span>
        <span><span class="sw" style="background:var(--amber)"></span>Skipped / short</span>
        ${(() => {
          const firstDone = _psCompleted[0];
          if (!firstDone) return '';
          const start = new Date(firstDone.delivered_at || firstDone.scheduled_at || 0);
          const today = new Date();
          if (isNaN(start.getTime())) return '';
          return `<span style="margin-left:auto;color:var(--text-tertiary)">Course start · ${esc(start.toLocaleDateString('en-US', { month:'short', day:'numeric' }))} \u2192 today (${esc(today.toLocaleDateString('en-US', { month:'short', day:'numeric' }))})</span>`;
        })()}
      </div>
    </div>` : ''}

    <!-- Section: before next session / aftercare — preserved below the ps-* grid -->
    ${nextSession ? whatToExpectHTML(nextSession) : ''}
    ${aftercareHTML()}

    <!-- Session reports (if any linked assessments) -->
    ${relatedDocsFeedbackHTML()}
  `;

  // ── Design · Sessions interactive handlers ──────────────────────────────────
  window._psSelectSession = function(idx) {
    const s = _psList[idx];
    const card = document.getElementById('ps-detail-card');
    if (!card) return;
    card.innerHTML = _psDetailHtml(s);
    document.querySelectorAll('#ps-list .ps-item.active').forEach(i => i.classList.remove('active'));
    const items = document.querySelectorAll('#ps-list .ps-item');
    if (items[idx]) items[idx].classList.add('active');
  };
  window._psFilter = function(f) {
    document.querySelectorAll('#ps-filters .ps-filter').forEach(b => b.classList.toggle('active', b.dataset.f === f));
    const items = document.querySelectorAll('#ps-list .ps-item');
    items.forEach(item => {
      if (f === 'all') { item.style.display = ''; return; }
      if (f === 'live')      item.style.display = item.dataset.status === 'live'      ? '' : 'none';
      else if (f === 'upcoming')  item.style.display = item.dataset.status === 'upcoming'  ? '' : 'none';
      else if (f === 'completed') item.style.display = item.dataset.status === 'completed' ? '' : 'none';
      else if (f === 'clinic')    item.style.display = item.dataset.loc    === 'clinic'    ? '' : 'none';
      else if (f === 'home')      item.style.display = item.dataset.loc    === 'home'      ? '' : 'none';
    });
  };
  window._psMetric = function(m) {
    document.querySelectorAll('#ps-compare-tabs button').forEach(b => b.classList.toggle('active', b.dataset.metric === m));
    const chart = document.getElementById('ps-compare-chart');
    if (chart) chart.innerHTML = _psChartHtml(m);
  };
  window._psSearch = function(q) {
    const needle = String(q || '').toLowerCase().trim();
    document.querySelectorAll('#ps-list .ps-item').forEach(item => {
      if (!needle) { item.style.display = ''; return; }
      const hay = item.textContent.toLowerCase();
      item.style.display = hay.includes(needle) ? '' : 'none';
    });
    document.querySelectorAll('#ps-list .ps-group-lbl').forEach(g => {
      let anyVisible = false;
      let sib = g.nextElementSibling;
      while (sib && !sib.classList.contains('ps-group-lbl')) {
        if (sib.style.display !== 'none') { anyVisible = true; break; }
        sib = sib.nextElementSibling;
      }
      g.style.display = anyVisible ? '' : 'none';
    });
  };
  window._psReportStop = async function() {
    if (uid && api.sendPortalMessage) {
      try {
        await api.sendPortalMessage({ body: 'Patient pressed STOP during a live session — immediate attention requested.', category: 'safety_alert', priority: 'high' });
        if (typeof window._showNotifToast === 'function') {
          window._showNotifToast({ title: 'Session pause requested', body: 'Your technician has been alerted. Please sit tight.', severity: 'warning' });
        }
      } catch (_e) {
        console.error('[session] stop alert failed:', _e);
        if (typeof window._showNotifToast === 'function') {
          window._showNotifToast({ title: 'Alert not sent', body: 'This portal could not confirm staff notification. Contact clinic staff immediately.', severity: 'critical' });
        }
      }
      return;
    }
    if (typeof window._showNotifToast === 'function') {
      window._showNotifToast({ title: 'Alert not sent', body: 'This portal could not confirm staff notification. Contact clinic staff immediately.', severity: 'critical' });
    }
  };
  window._psReportDiscomfort = async function() {
    if (typeof window._showNotifToast === 'function') {
      window._showNotifToast({ title: 'Discomfort reported', body: 'Your technician will check in with you immediately.', severity: 'warning' });
    }
    if (uid && api.sendPortalMessage) {
      try {
        await api.sendPortalMessage({ body: 'Patient reported discomfort during a live session — please check in immediately.', category: 'safety_alert', priority: 'high' });
      } catch (_e) { console.error('[session] discomfort alert failed:', _e); }
    }
  };
  // Highlight the initial item.
  setTimeout(() => {
    const items = document.querySelectorAll('#ps-list .ps-item');
    if (items[_psInitialIdx]) items[_psInitialIdx].classList.add('active');
  }, 0);


  // ── Past session accordion ────────────────────────────────────────────────────
  window._ptToggleCompleted = function(rowIdx) {
    const detail = document.getElementById(`pt-cr-detail-${rowIdx}`);
    const chev   = document.getElementById(`pt-cr-chev-${rowIdx}`);
    const row    = document.getElementById(`pt-cr-row-${rowIdx}`);
    if (!detail) return;
    const isOpen = detail.style.display !== 'none';
    el.querySelectorAll('.pt-cr-detail').forEach(d => { d.style.display = 'none'; });
    el.querySelectorAll('.pt-cr-chevron').forEach(c => { c.style.transform = ''; });
    el.querySelectorAll('.pt-completed-row[aria-expanded="true"]').forEach(r => {
      r.setAttribute('aria-expanded', 'false');
    });
    if (!isOpen) {
      detail.style.display = '';
      if (chev) chev.style.transform = 'rotate(180deg)';
      if (row)  row.setAttribute('aria-expanded', 'true');
    }
  };

  // ── Reschedule ────────────────────────────────────────────────────────────────
  window._ptRequestReschedule = function(_idx) {
    window._navPatient('patient-messages');
  };
}
