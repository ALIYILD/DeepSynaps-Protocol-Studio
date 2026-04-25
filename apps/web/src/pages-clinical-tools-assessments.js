// ─────────────────────────────────────────────────────────────────────────────
// pages-clinical-tools-assessments.js — Assessments Hub
// (extracted from pages-clinical-tools.js for code-splitting). Contains the
// `COND_BUNDLES` source-of-truth referenced by the scale-registry text test.
// ─────────────────────────────────────────────────────────────────────────────
import { api } from "./api.js";
import { COND_HUB_META } from "./registries/condition-assessment-hub-meta.js";
import {
  getScaleMeta,
  enumerateBundleScales,
} from "./registries/scale-assessment-registry.js";
import {
  formatScaleWithImplementationBadgeHtml,
  partitionScalesByImplementationTruth,
  getLegacyRunScoreEntryNoticeHtml,
  routeLegacyRunAssessment,
} from "./registries/assessment-implementation-status.js";
import { ASSESS_REGISTRY, ASSESS_TEMPLATES } from "./registries/assess-instruments-registry.js";
import {
  _dsToast,
  _hubResolveRegistryScale,
  _hubEscHtml,
  _hubInterpretScore,
} from "./pages-clinical-tools-shared.js";

// ── pgAssessmentsHub — Assessment library & scheduling ────────────────────────


// ── pgAssessmentsHub replacement ───────────────────────────────────────────────
const PHASE2_CSS = `
/* ── Assessments Hub ─────────────────────────────────────────────────── */
.ah-hub-tabs {
  display: flex;
  gap: 2px;
  border-bottom: 2px solid var(--border);
  padding-bottom: 0;
  flex-wrap: wrap;
}

.ah-hub-tab {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  padding: 10px 20px;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition: color 0.15s, border-color 0.15s;
  font-family: inherit;
}

.ah-hub-tab:hover {
  color: var(--text-primary);
}

.ah-hub-tab.active {
  color: var(--teal);
  border-bottom-color: var(--teal);
}

/* ── Category chips ───────────────────────────────────────────────────── */
.ah-cat-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 4px 0;
}

.ah-cat-chip {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 11.5px;
  font-weight: 600;
  background: rgba(255,255,255,0.06);
  color: var(--text-secondary);
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
  user-select: none;
}

.ah-cat-chip:hover {
  background: rgba(0,212,188,0.1);
  color: var(--teal);
}

.ah-cat-chip.active {
  background: rgba(0,212,188,0.15);
  color: var(--teal);
  border-color: rgba(0,212,188,0.3);
}

/* ── Scale card ───────────────────────────────────────────────────────── */
.ah-scale-card {
  background: var(--surface-1, rgba(255,255,255,0.04));
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 10px);
  padding: 14px 16px;
  transition: border-color 0.15s;
}

.ah-scale-card:hover {
  border-color: rgba(0,212,188,0.35);
}

.ah-scale-badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 5px;
  letter-spacing: 0.3px;
  white-space: nowrap;
}

/* ── Bundle card ──────────────────────────────────────────────────────── */
.ah-bundle-card {
  background: var(--surface-1, rgba(255,255,255,0.04));
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 10px);
  padding: 14px 16px;
  transition: border-color 0.15s;
}

.ah-bundle-card:hover {
  border-color: rgba(0,212,188,0.3);
}

.ah-phase-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 5px 0;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}

.ah-phase-row:last-of-type {
  border-bottom: none;
}

/* ── Inline form ──────────────────────────────────────────────────────── */
.ah-inline-form {
  background: rgba(255,255,255,0.025);
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 10px);
  padding: 16px;
}

.ah-q-row {
  margin-bottom: 16px;
}

.ah-q-row:last-child {
  margin-bottom: 0;
}

.ah-q-label {
  display: block;
  font-size: 12.5px;
  color: var(--text-primary);
  margin-bottom: 6px;
  font-weight: 500;
  line-height: 1.5;
}

.ah-q-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(0,212,188,0.15);
  color: var(--teal);
  font-size: 10px;
  font-weight: 800;
  margin-right: 8px;
  flex-shrink: 0;
  vertical-align: middle;
}

/* ── Domain slider ────────────────────────────────────────────────────── */
.ah-domain-slider {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  padding: 4px 0;
}

/* ── Reports Hub layout ───────────────────────────────────────────────── */
.rh-layout {
  display: flex;
  gap: 0;
  min-height: 0;
  flex: 1;
  height: calc(100vh - 120px);
}

.rh-sidebar {
  width: 180px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  padding: 8px 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
  overflow-y: auto;
  background: rgba(255,255,255,0.01);
}

.rh-sidebar-item {
  display: flex;
  align-items: center;
  padding: 9px 16px;
  font-size: 12.5px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
  border-radius: 0;
  white-space: nowrap;
  font-weight: 500;
}

.rh-sidebar-item:hover {
  background: rgba(255,255,255,0.05);
  color: var(--text-primary);
}

.rh-sidebar-item.active {
  background: rgba(0,212,188,0.1);
  color: var(--teal);
  font-weight: 700;
}

/* ── Report card ──────────────────────────────────────────────────────── */
.rh-report-card {
  background: var(--surface-1, rgba(255,255,255,0.04));
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 10px);
  padding: 14px 16px;
  transition: border-color 0.15s;
}

.rh-report-card:hover {
  border-color: rgba(0,212,188,0.3);
}

.rh-report-type-badge {
  display: inline-block;
  font-size: 10.5px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 6px;
  letter-spacing: 0.2px;
}

/* ── AI summary panel ─────────────────────────────────────────────────── */
.rh-ai-panel {
  margin-top: 8px;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ── Upload modal ─────────────────────────────────────────────────────── */
.rh-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  z-index: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fadeIn 0.15s ease;
}

.rh-modal {
  background: var(--surface-2, #1c2333);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 24px;
  width: 480px;
  max-width: 96vw;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 8px 48px rgba(0,0,0,0.5);
}
`;

// ─────────────────────────────────────────────────────────────────────────────
export async function pgAssessmentsHub(setTopbar) {
  setTopbar('Assessments Hub', `
    <button class="btn btn-primary btn-sm" onclick="document.getElementById('ah2-assign-modal') && document.getElementById('ah2-assign-modal').classList.remove('ah2-hidden')">+ Assign Bundle</button>
    <button class="btn btn-sm" onclick="window._ah2Refresh && window._ah2Refresh()">Refresh</button>
    <button class="btn btn-sm" onclick="window._ah2Export && window._ah2Export()">Export Results</button>
  `);

  const EXTRA_SCALES = [
    { id:'QIDS-SR', name:'QIDS-SR', full:'Quick Inventory of Depressive Symptomatology', domain:'Depression', items:16, min:0, max:27, interpretation:[{max:5,label:'None'},{max:10,label:'Mild'},{max:15,label:'Moderate'},{max:20,label:'Severe'},{max:27,label:'Very Severe'}] },
    { id:'PANSS', name:'PANSS', full:'Positive and Negative Syndrome Scale', domain:'Psychosis', items:30, min:30, max:210, interpretation:[{max:58,label:'Mild'},{max:75,label:'Moderate'},{max:99,label:'Severe'},{max:210,label:'Very Severe'}] },
    { id:'BPRS', name:'BPRS', full:'Brief Psychiatric Rating Scale', domain:'Psychosis', items:24, min:24, max:168, interpretation:[{max:40,label:'Mild'},{max:60,label:'Moderate'},{max:168,label:'Severe'}] },
    { id:'CAPS-5', name:'CAPS-5', full:'Clinician-Administered PTSD Scale for DSM-5', domain:'Trauma/PTSD', items:30, min:0, max:80, interpretation:[{max:22,label:'Mild'},{max:36,label:'Moderate'},{max:52,label:'Severe'},{max:80,label:'Extreme'}] },
    { id:'C-SSRS', name:'C-SSRS', full:'Columbia Suicide Severity Rating Scale', domain:'Safety', items:6, min:0, max:6, interpretation:[{max:0,label:'No Ideation'},{max:2,label:'Passive/Low'},{max:5,label:'Active Ideation'},{max:6,label:'Behavior'}] },
    { id:'SPIN', name:'SPIN', full:'Social Phobia Inventory', domain:'Anxiety', items:17, min:0, max:68, interpretation:[{max:20,label:'None/Minimal'},{max:30,label:'Mild'},{max:40,label:'Moderate'},{max:50,label:'Severe'},{max:68,label:'Very Severe'}] },
    { id:'PSWQ', name:'PSWQ', full:'Penn State Worry Questionnaire', domain:'Anxiety', items:16, min:16, max:80, interpretation:[{max:40,label:'Low'},{max:59,label:'Moderate'},{max:80,label:'High'}] },
    { id:'BPI', name:'BPI', full:'Brief Pain Inventory', domain:'Pain', items:9, min:0, max:10, interpretation:[{max:3,label:'Mild'},{max:6,label:'Moderate'},{max:10,label:'Severe'}] },
    { id:'PCS', name:'PCS', full:'Pain Catastrophizing Scale', domain:'Pain', items:13, min:0, max:52, interpretation:[{max:20,label:'Low'},{max:30,label:'Moderate'},{max:52,label:'High Catastrophizing'}] },
    { id:'MMSE', name:'MMSE', full:'Mini-Mental State Examination', domain:'Cognitive', items:30, min:0, max:30, interpretation:[{max:9,label:'Severe Impairment'},{max:18,label:'Moderate'},{max:23,label:'Mild'},{max:30,label:'Normal'}] },
    { id:'MoCA', name:'MoCA', full:'Montreal Cognitive Assessment', domain:'Cognitive', items:30, min:0, max:30, interpretation:[{max:17,label:'Moderate Impairment'},{max:22,label:'Mild'},{max:25,label:'Borderline'},{max:30,label:'Normal'}] },
    { id:'HAM-A', name:'HAM-A', full:'Hamilton Anxiety Rating Scale', domain:'Anxiety', items:14, min:0, max:56, interpretation:[{max:14,label:'None'},{max:17,label:'Mild'},{max:24,label:'Moderate'},{max:56,label:'Severe'}] },
    { id:'TMS-SE', name:'TMS-SE', full:'TMS Side-Effects Checklist', domain:'Neuromod', items:10, min:0, max:30, interpretation:[{max:5,label:'None/Minimal'},{max:10,label:'Mild'},{max:20,label:'Moderate'},{max:30,label:'Severe'}] },
    { id:'tDCS-CS', name:'tDCS-CS', full:'tDCS Comfort and Side Effects Scale', domain:'Neuromod', items:8, min:0, max:24, interpretation:[{max:4,label:'Comfortable'},{max:10,label:'Mild Discomfort'},{max:24,label:'Significant'}] },
  ];

  const COND_BUNDLES = [
    { id:'CON-001', name:'Major Depressive Disorder', category:'Mood', phases:{ baseline:['PHQ-9','MADRS','HAM-D','QIDS-SR','C-SSRS','ISI','PSS','WHODAS'], weekly:['PHQ-9','QIDS-SR','C-SSRS','ISI'], pre_session:['PHQ-9','C-SSRS'], post_session:['CGI'], milestone:['PHQ-9','MADRS','HAM-D','QIDS-SR','ISI','WHODAS'], discharge:['PHQ-9','MADRS','HAM-D','QIDS-SR','ISI','WHODAS','SF-36'] }},
    { id:'CON-002', name:'Treatment-Resistant Depression', category:'Mood', phases:{ baseline:['PHQ-9','MADRS','HAM-D','QIDS-SR','C-SSRS','ISI','TMS-SE','WHODAS'], weekly:['PHQ-9','QIDS-SR','C-SSRS','TMS-SE'], pre_session:['PHQ-9','C-SSRS','TMS-SE'], post_session:['CGI','TMS-SE'], milestone:['PHQ-9','MADRS','HAM-D','QIDS-SR','ISI','WHODAS'], discharge:['PHQ-9','MADRS','HAM-D','QIDS-SR','ISI','WHODAS','SF-36'] }},
    { id:'CON-003', name:'Bipolar I Disorder', category:'Mood', phases:{ baseline:['MDQ','YMRS','PHQ-9','C-SSRS','ISI','WHODAS'], weekly:['MDQ','YMRS','PHQ-9','C-SSRS'], pre_session:['MDQ','YMRS','C-SSRS'], post_session:['CGI'], milestone:['MDQ','YMRS','PHQ-9','ISI','WHODAS'], discharge:['MDQ','YMRS','PHQ-9','ISI','WHODAS','SF-36'] }},
    { id:'CON-004', name:'Bipolar II Disorder', category:'Mood', phases:{ baseline:['MDQ','YMRS','PHQ-9','C-SSRS','ISI','WHODAS'], weekly:['MDQ','PHQ-9','C-SSRS','ISI'], pre_session:['MDQ','PHQ-9','C-SSRS'], post_session:['CGI'], milestone:['MDQ','YMRS','PHQ-9','ISI','WHODAS'], discharge:['MDQ','YMRS','PHQ-9','ISI','WHODAS','SF-36'] }},
    { id:'CON-005', name:'Persistent Depressive Disorder', category:'Mood', phases:{ baseline:['PHQ-9','MADRS','QIDS-SR','C-SSRS','ISI','PSS','WHODAS'], weekly:['PHQ-9','QIDS-SR','C-SSRS'], pre_session:['PHQ-9','C-SSRS'], post_session:['CGI'], milestone:['PHQ-9','MADRS','QIDS-SR','ISI','WHODAS'], discharge:['PHQ-9','MADRS','QIDS-SR','ISI','WHODAS','SF-36'] }},
    { id:'CON-006', name:'Seasonal Affective Disorder', category:'Mood', phases:{ baseline:['PHQ-9','MADRS','ISI','PSQI','EPWORTH','PSS'], weekly:['PHQ-9','ISI','PSQI'], pre_session:['PHQ-9'], post_session:['CGI'], milestone:['PHQ-9','MADRS','ISI','PSQI'], discharge:['PHQ-9','MADRS','ISI','PSQI','SF-36'] }},
    { id:'CON-007', name:'Postpartum Depression', category:'Mood', phases:{ baseline:['PHQ-9','C-SSRS','ISI','PSS','WHODAS'], weekly:['PHQ-9','C-SSRS','ISI'], pre_session:['PHQ-9','C-SSRS'], post_session:['CGI'], milestone:['PHQ-9','ISI','WHODAS'], discharge:['PHQ-9','ISI','WHODAS','SF-36'] }},
    { id:'CON-008', name:'Premenstrual Dysphoric Disorder', category:'Mood', phases:{ baseline:['PHQ-9','GAD-7','ISI','PSS'], weekly:['PHQ-9','GAD-7'], pre_session:['PHQ-9'], post_session:['CGI'], milestone:['PHQ-9','GAD-7','ISI'], discharge:['PHQ-9','GAD-7','ISI','SF-36'] }},
    { id:'CON-009', name:'Depression with Psychotic Features', category:'Mood', phases:{ baseline:['PHQ-9','MADRS','C-SSRS','PANSS','BPRS','ISI','WHODAS'], weekly:['PHQ-9','BPRS','C-SSRS'], pre_session:['PHQ-9','BPRS','C-SSRS'], post_session:['CGI'], milestone:['PHQ-9','MADRS','PANSS','BPRS','ISI','WHODAS'], discharge:['PHQ-9','MADRS','PANSS','BPRS','ISI','WHODAS','SF-36'] }},
    { id:'CON-010', name:'Suicidality and Crisis Management', category:'Mood', phases:{ baseline:['C-SSRS','PHQ-9','MADRS','QIDS-SR','WHODAS'], weekly:['C-SSRS','PHQ-9'], pre_session:['C-SSRS','PHQ-9'], post_session:['C-SSRS','CGI'], milestone:['C-SSRS','PHQ-9','MADRS'], discharge:['C-SSRS','PHQ-9','MADRS','WHODAS'] }},
    { id:'CON-011', name:'Generalized Anxiety Disorder', category:'Anxiety', phases:{ baseline:['GAD-7','HAM-A','PSWQ','PSS','ISI','WHODAS'], weekly:['GAD-7','PSWQ'], pre_session:['GAD-7'], post_session:['CGI'], milestone:['GAD-7','HAM-A','PSWQ','ISI','WHODAS'], discharge:['GAD-7','HAM-A','PSWQ','ISI','WHODAS','SF-36'] }},
    { id:'CON-012', name:'Panic Disorder', category:'Anxiety', phases:{ baseline:['GAD-7','PDSS','HAM-A','PSS','WHODAS'], weekly:['GAD-7','PDSS'], pre_session:['GAD-7','PDSS'], post_session:['CGI'], milestone:['GAD-7','PDSS','HAM-A','WHODAS'], discharge:['GAD-7','PDSS','HAM-A','WHODAS','SF-36'] }},
    { id:'CON-013', name:'Social Anxiety Disorder', category:'Anxiety', phases:{ baseline:['GAD-7','SPIN','HAM-A','PSS','WHODAS'], weekly:['GAD-7','SPIN'], pre_session:['GAD-7'], post_session:['CGI'], milestone:['GAD-7','SPIN','HAM-A','WHODAS'], discharge:['GAD-7','SPIN','HAM-A','WHODAS','SF-36'] }},
    { id:'CON-014', name:'Specific Phobia', category:'Anxiety', phases:{ baseline:['GAD-7','PSS','WHODAS'], weekly:['GAD-7'], pre_session:['GAD-7'], post_session:['CGI'], milestone:['GAD-7','WHODAS'], discharge:['GAD-7','WHODAS','SF-36'] }},
    { id:'CON-015', name:'Adjustment Disorder with Anxiety', category:'Anxiety', phases:{ baseline:['GAD-7','PSS','ISI','WHODAS'], weekly:['GAD-7','PSS'], pre_session:['GAD-7'], post_session:['CGI'], milestone:['GAD-7','PSS','ISI','WHODAS'], discharge:['GAD-7','PSS','ISI','WHODAS','SF-36'] }},
    { id:'CON-016', name:'Obsessive-Compulsive Disorder', category:'OCD Spectrum', phases:{ baseline:['Y-BOCS','OCI-R','GAD-7','PHQ-9','WHODAS'], weekly:['Y-BOCS','OCI-R'], pre_session:['OCI-R'], post_session:['CGI'], milestone:['Y-BOCS','OCI-R','GAD-7','WHODAS'], discharge:['Y-BOCS','OCI-R','GAD-7','WHODAS','SF-36'] }},
    { id:'CON-017', name:'Body Dysmorphic Disorder', category:'OCD Spectrum', phases:{ baseline:['Y-BOCS','PHQ-9','GAD-7','C-SSRS','WHODAS'], weekly:['Y-BOCS','PHQ-9'], pre_session:['Y-BOCS'], post_session:['CGI'], milestone:['Y-BOCS','PHQ-9','WHODAS'], discharge:['Y-BOCS','PHQ-9','WHODAS','SF-36'] }},
    { id:'CON-018', name:'Hoarding Disorder', category:'OCD Spectrum', phases:{ baseline:['Y-BOCS','PHQ-9','GAD-7','WHODAS'], weekly:['Y-BOCS','PHQ-9'], pre_session:['Y-BOCS'], post_session:['CGI'], milestone:['Y-BOCS','PHQ-9','WHODAS'], discharge:['Y-BOCS','PHQ-9','WHODAS','SF-36'] }},
    { id:'CON-019', name:'Post-Traumatic Stress Disorder', category:'Trauma', phases:{ baseline:['PCL-5','CAPS-5','PHQ-9','C-SSRS','ISI','DERS','WHODAS'], weekly:['PCL-5','PHQ-9','C-SSRS'], pre_session:['PCL-5','C-SSRS'], post_session:['CGI'], milestone:['PCL-5','CAPS-5','PHQ-9','ISI','WHODAS'], discharge:['PCL-5','CAPS-5','PHQ-9','ISI','WHODAS','SF-36'] }},
    { id:'CON-020', name:'Complex PTSD Developmental Trauma', category:'Trauma', phases:{ baseline:['PCL-5','CAPS-5','PHQ-9','C-SSRS','DERS','ISI','WHODAS'], weekly:['PCL-5','PHQ-9','DERS','C-SSRS'], pre_session:['PCL-5','C-SSRS'], post_session:['CGI','DERS'], milestone:['PCL-5','CAPS-5','PHQ-9','DERS','ISI','WHODAS'], discharge:['PCL-5','CAPS-5','PHQ-9','DERS','ISI','WHODAS','SF-36'] }},
    { id:'CON-021', name:'ADHD Inattentive Type', category:'ADHD', phases:{ baseline:['WHODAS','PHQ-9','ISI','PSS'], weekly:['WHODAS','PHQ-9'], pre_session:['WHODAS'], post_session:['CGI'], milestone:['WHODAS','PHQ-9','ISI'], discharge:['WHODAS','PHQ-9','ISI','SF-36'] }},
    { id:'CON-022', name:'ADHD Combined Type', category:'ADHD', phases:{ baseline:['WHODAS','PHQ-9','ISI','PSS','DERS'], weekly:['WHODAS','PHQ-9','DERS'], pre_session:['WHODAS'], post_session:['CGI'], milestone:['WHODAS','PHQ-9','ISI','DERS'], discharge:['WHODAS','PHQ-9','ISI','DERS','SF-36'] }},
    { id:'CON-023', name:'Schizophrenia', category:'Psychotic', phases:{ baseline:['PANSS','BPRS','C-SSRS','ISI','WHODAS','CGI'], weekly:['PANSS','BPRS','C-SSRS'], pre_session:['BPRS','C-SSRS'], post_session:['CGI','BPRS'], milestone:['PANSS','BPRS','C-SSRS','ISI','WHODAS'], discharge:['PANSS','BPRS','ISI','WHODAS','SF-36'] }},
    { id:'CON-024', name:'Schizoaffective Disorder', category:'Psychotic', phases:{ baseline:['PANSS','BPRS','PHQ-9','MDQ','C-SSRS','ISI','WHODAS'], weekly:['PANSS','BPRS','PHQ-9','C-SSRS'], pre_session:['BPRS','C-SSRS'], post_session:['CGI','BPRS'], milestone:['PANSS','BPRS','PHQ-9','ISI','WHODAS'], discharge:['PANSS','BPRS','PHQ-9','ISI','WHODAS','SF-36'] }},
    { id:'CON-025', name:'Insomnia Disorder', category:'Sleep', phases:{ baseline:['ISI','PSQI','EPWORTH','ESS','PHQ-9','GAD-7'], weekly:['ISI','PSQI'], pre_session:['ISI'], post_session:['CGI'], milestone:['ISI','PSQI','EPWORTH','PHQ-9'], discharge:['ISI','PSQI','EPWORTH','PHQ-9','SF-36'] }},
    { id:'CON-026', name:'Sleep-Related Anxiety', category:'Sleep', phases:{ baseline:['ISI','PSQI','GAD-7','PHQ-9'], weekly:['ISI','GAD-7'], pre_session:['ISI'], post_session:['CGI'], milestone:['ISI','PSQI','GAD-7','PHQ-9'], discharge:['ISI','PSQI','GAD-7','PHQ-9','SF-36'] }},
    { id:'CON-027', name:'Chronic Pain General', category:'Pain', phases:{ baseline:['BPI','PCS','PHQ-9','GAD-7','ISI','SF-36','WHODAS'], weekly:['BPI','PCS','PHQ-9'], pre_session:['BPI'], post_session:['BPI','CGI'], milestone:['BPI','PCS','PHQ-9','ISI','WHODAS'], discharge:['BPI','PCS','PHQ-9','ISI','WHODAS','SF-36'] }},
    { id:'CON-028', name:'Fibromyalgia', category:'Pain', phases:{ baseline:['BPI','PCS','PHQ-9','GAD-7','ISI','PSQI','SF-36'], weekly:['BPI','PHQ-9','ISI'], pre_session:['BPI'], post_session:['BPI','CGI'], milestone:['BPI','PCS','PHQ-9','ISI','SF-36'], discharge:['BPI','PCS','PHQ-9','ISI','SF-36'] }},
    { id:'CON-029', name:'Chronic Low Back Pain', category:'Pain', phases:{ baseline:['BPI','PCS','PHQ-9','GAD-7','WHODAS','tDCS-CS'], weekly:['BPI','PHQ-9'], pre_session:['BPI','tDCS-CS'], post_session:['BPI','tDCS-CS','CGI'], milestone:['BPI','PCS','PHQ-9','WHODAS'], discharge:['BPI','PCS','PHQ-9','WHODAS','SF-36'] }},
    { id:'CON-030', name:'Neuropathic Pain', category:'Pain', phases:{ baseline:['BPI','PCS','PHQ-9','GAD-7','WHODAS'], weekly:['BPI','PHQ-9'], pre_session:['BPI'], post_session:['BPI','CGI'], milestone:['BPI','PCS','PHQ-9','WHODAS'], discharge:['BPI','PCS','PHQ-9','WHODAS','SF-36'] }},
    { id:'CON-031', name:'Migraine and Headache Disorders', category:'Pain', phases:{ baseline:['BPI','PHQ-9','GAD-7','ISI','TMS-SE','WHODAS'], weekly:['BPI','PHQ-9','TMS-SE'], pre_session:['BPI','TMS-SE'], post_session:['BPI','TMS-SE','CGI'], milestone:['BPI','PHQ-9','ISI','WHODAS'], discharge:['BPI','PHQ-9','ISI','WHODAS','SF-36'] }},
    { id:'CON-032', name:'Complex Regional Pain Syndrome', category:'Pain', phases:{ baseline:['BPI','PCS','PHQ-9','GAD-7','DERS','WHODAS'], weekly:['BPI','PHQ-9'], pre_session:['BPI'], post_session:['BPI','CGI'], milestone:['BPI','PCS','PHQ-9','WHODAS'], discharge:['BPI','PCS','PHQ-9','WHODAS','SF-36'] }},
    { id:'CON-033', name:'Epilepsy Seizure Disorder', category:'Neurology', phases:{ baseline:['PHQ-9','GAD-7','ISI','WHODAS','SF-36'], weekly:['PHQ-9','GAD-7'], pre_session:['PHQ-9'], post_session:['CGI'], milestone:['PHQ-9','GAD-7','ISI','WHODAS'], discharge:['PHQ-9','GAD-7','ISI','WHODAS','SF-36'] }},
    { id:'CON-034', name:"Parkinson's Disease", category:'Neurology', phases:{ baseline:['PHQ-9','MADRS','ISI','PSQI','MMSE','MoCA','WHODAS','SF-36'], weekly:['PHQ-9','ISI'], pre_session:['PHQ-9','MoCA'], post_session:['CGI'], milestone:['PHQ-9','MADRS','ISI','MMSE','MoCA','WHODAS'], discharge:['PHQ-9','MADRS','ISI','MMSE','MoCA','WHODAS','SF-36'] }},
    { id:'CON-035', name:"Alzheimer's Disease and Dementia", category:'Neurology', phases:{ baseline:['MMSE','MoCA','PHQ-9','ISI','WHODAS','SF-36'], weekly:['MMSE','PHQ-9'], pre_session:['MoCA'], post_session:['CGI'], milestone:['MMSE','MoCA','PHQ-9','ISI','WHODAS'], discharge:['MMSE','MoCA','PHQ-9','ISI','WHODAS','SF-36'] }},
    { id:'CON-036', name:'Mild Cognitive Impairment', category:'Neurology', phases:{ baseline:['MoCA','MMSE','PHQ-9','ISI','WHODAS'], weekly:['MoCA','PHQ-9'], pre_session:['MoCA'], post_session:['CGI'], milestone:['MoCA','MMSE','PHQ-9','WHODAS'], discharge:['MoCA','MMSE','PHQ-9','WHODAS','SF-36'] }},
    { id:'CON-037', name:'Traumatic Brain Injury', category:'Neurology', phases:{ baseline:['MMSE','MoCA','PHQ-9','C-SSRS','ISI','BPI','WHODAS'], weekly:['PHQ-9','ISI','BPI'], pre_session:['PHQ-9','BPI'], post_session:['CGI'], milestone:['MMSE','MoCA','PHQ-9','ISI','BPI','WHODAS'], discharge:['MMSE','MoCA','PHQ-9','ISI','BPI','WHODAS','SF-36'] }},
    { id:'CON-038', name:'Stroke Rehabilitation', category:'Neurology', phases:{ baseline:['PHQ-9','MADRS','BPI','ISI','MMSE','WHODAS','SF-36'], weekly:['PHQ-9','BPI'], pre_session:['PHQ-9','BPI'], post_session:['CGI'], milestone:['PHQ-9','MADRS','BPI','MMSE','WHODAS'], discharge:['PHQ-9','MADRS','BPI','MMSE','WHODAS','SF-36'] }},
    { id:'CON-039', name:'Multiple Sclerosis', category:'Neurology', phases:{ baseline:['PHQ-9','MADRS','BPI','ISI','PSQI','MMSE','WHODAS','SF-36'], weekly:['PHQ-9','BPI','ISI'], pre_session:['PHQ-9','BPI'], post_session:['CGI'], milestone:['PHQ-9','MADRS','BPI','ISI','MMSE','WHODAS'], discharge:['PHQ-9','MADRS','BPI','ISI','MMSE','WHODAS','SF-36'] }},
    { id:'CON-040', name:'ALS Motor Neuron Disease', category:'Neurology', phases:{ baseline:['PHQ-9','C-SSRS','BPI','ISI','WHODAS','SF-36'], weekly:['PHQ-9','C-SSRS','BPI'], pre_session:['PHQ-9','C-SSRS'], post_session:['CGI'], milestone:['PHQ-9','C-SSRS','BPI','WHODAS'], discharge:['PHQ-9','C-SSRS','BPI','WHODAS','SF-36'] }},
    { id:'CON-041', name:'Essential Tremor', category:'Neurology', phases:{ baseline:['PHQ-9','GAD-7','ISI','WHODAS'], weekly:['PHQ-9','GAD-7'], pre_session:['PHQ-9'], post_session:['CGI'], milestone:['PHQ-9','GAD-7','ISI','WHODAS'], discharge:['PHQ-9','GAD-7','ISI','WHODAS','SF-36'] }},
    { id:'CON-042', name:'Tourette Syndrome Tic Disorders', category:'Neurology', phases:{ baseline:['PHQ-9','GAD-7','Y-BOCS','OCI-R','WHODAS'], weekly:['PHQ-9','GAD-7'], pre_session:['PHQ-9'], post_session:['CGI'], milestone:['PHQ-9','GAD-7','Y-BOCS','WHODAS'], discharge:['PHQ-9','GAD-7','Y-BOCS','WHODAS','SF-36'] }},
    { id:'CON-043', name:'Tinnitus', category:'Sensory', phases:{ baseline:['PHQ-9','GAD-7','ISI','PSQI','TMS-SE','SF-36'], weekly:['PHQ-9','GAD-7','ISI'], pre_session:['PHQ-9','TMS-SE'], post_session:['TMS-SE','CGI'], milestone:['PHQ-9','GAD-7','ISI','SF-36'], discharge:['PHQ-9','GAD-7','ISI','SF-36'] }},
    { id:'CON-044', name:'Alcohol Use Disorder', category:'Substance', phases:{ baseline:['AUDIT','PHQ-9','GAD-7','C-SSRS','ISI','WHODAS'], weekly:['AUDIT','PHQ-9','C-SSRS'], pre_session:['AUDIT','C-SSRS'], post_session:['CGI'], milestone:['AUDIT','PHQ-9','ISI','WHODAS'], discharge:['AUDIT','PHQ-9','ISI','WHODAS','SF-36'] }},
    { id:'CON-045', name:'Substance Use Disorder Other', category:'Substance', phases:{ baseline:['DAST-10','PHQ-9','GAD-7','C-SSRS','ISI','WHODAS'], weekly:['DAST-10','PHQ-9','C-SSRS'], pre_session:['DAST-10','C-SSRS'], post_session:['CGI'], milestone:['DAST-10','PHQ-9','ISI','WHODAS'], discharge:['DAST-10','PHQ-9','ISI','WHODAS','SF-36'] }},
    { id:'CON-046', name:'Gambling Behavioural Addiction', category:'Substance', phases:{ baseline:['PHQ-9','GAD-7','C-SSRS','DERS','WHODAS'], weekly:['PHQ-9','DERS'], pre_session:['PHQ-9'], post_session:['CGI'], milestone:['PHQ-9','GAD-7','DERS','WHODAS'], discharge:['PHQ-9','GAD-7','DERS','WHODAS','SF-36'] }},
    { id:'CON-047', name:'Anorexia Nervosa', category:'Eating', phases:{ baseline:['EDE-Q','PHQ-9','C-SSRS','GAD-7','ISI','WHODAS'], weekly:['EDE-Q','PHQ-9','C-SSRS'], pre_session:['EDE-Q','C-SSRS'], post_session:['CGI'], milestone:['EDE-Q','PHQ-9','ISI','WHODAS'], discharge:['EDE-Q','PHQ-9','ISI','WHODAS','SF-36'] }},
    { id:'CON-048', name:'Bulimia Binge Eating Disorder', category:'Eating', phases:{ baseline:['EDE-Q','BINGE','PHQ-9','GAD-7','C-SSRS','ISI','WHODAS'], weekly:['EDE-Q','BINGE','PHQ-9'], pre_session:['EDE-Q'], post_session:['CGI'], milestone:['EDE-Q','BINGE','PHQ-9','ISI','WHODAS'], discharge:['EDE-Q','BINGE','PHQ-9','ISI','WHODAS','SF-36'] }},
    { id:'CON-049', name:'Cognitive Decline Unspecified', category:'Cognitive', phases:{ baseline:['MMSE','MoCA','PHQ-9','ISI','WHODAS'], weekly:['MMSE','PHQ-9'], pre_session:['MoCA'], post_session:['CGI'], milestone:['MMSE','MoCA','PHQ-9','WHODAS'], discharge:['MMSE','MoCA','PHQ-9','WHODAS','SF-36'] }},
    { id:'CON-050', name:'Executive Function Deficits', category:'Cognitive', phases:{ baseline:['MoCA','PHQ-9','WHODAS','DERS'], weekly:['MoCA','PHQ-9'], pre_session:['MoCA'], post_session:['CGI'], milestone:['MoCA','PHQ-9','DERS','WHODAS'], discharge:['MoCA','PHQ-9','DERS','WHODAS','SF-36'] }},
    { id:'CON-051', name:'TMS Protocol General', category:'Neuromod', phases:{ baseline:['PHQ-9','GAD-7','ISI','TMS-SE','C-SSRS','WHODAS'], weekly:['PHQ-9','TMS-SE','C-SSRS'], pre_session:['TMS-SE','C-SSRS'], post_session:['TMS-SE','CGI'], milestone:['PHQ-9','GAD-7','ISI','TMS-SE','WHODAS'], discharge:['PHQ-9','GAD-7','ISI','WHODAS','SF-36'] }},
    { id:'CON-052', name:'tDCS Protocol General', category:'Neuromod', phases:{ baseline:['PHQ-9','GAD-7','BPI','tDCS-CS','WHODAS'], weekly:['PHQ-9','BPI','tDCS-CS'], pre_session:['tDCS-CS'], post_session:['tDCS-CS','CGI'], milestone:['PHQ-9','GAD-7','BPI','tDCS-CS','WHODAS'], discharge:['PHQ-9','GAD-7','BPI','WHODAS','SF-36'] }},
    { id:'CON-053', name:'Neurofeedback Protocol', category:'Neuromod', phases:{ baseline:['PHQ-9','GAD-7','ISI','PSQI','PSS','WHODAS'], weekly:['PHQ-9','GAD-7','ISI'], pre_session:['PHQ-9','PSS'], post_session:['CGI'], milestone:['PHQ-9','GAD-7','ISI','PSQI','WHODAS'], discharge:['PHQ-9','GAD-7','ISI','PSQI','WHODAS','SF-36'] }},
  ];

  const CATEGORIES = [...new Set(COND_BUNDLES.map(c => c.category))];
  const PHASES = ['baseline','weekly','pre_session','post_session','milestone','discharge'];
  const PHASE_LABELS = { baseline:'Baseline', weekly:'Weekly', pre_session:'Pre-Session', post_session:'Post-Session', milestone:'Milestone', discharge:'Discharge' };

  // DATA is now hydrated from the /api/v1/assessments backend. One UI "assignment"
  // maps to N backend records (one per scale) grouped by (patient, bundle, phase,
  // assigned day). No localStorage source-of-truth — the backend is authoritative.
  let DATA = { assignments: [], loading: true, error: null };

  function _groupKey(r) {
    const d = (r.created_at || '').slice(0, 10);
    return [r.patient_id || '', r.bundle_id || '', r.phase || '', d].join('|');
  }

  function _scaleIdFromRecord(r) {
    // Prefer the raw scale id we stashed in data.scale_id when assigning; fall
    // back to template_title (user-facing) or template_id (normalized slug).
    return (r.data && r.data.scale_id) || r.template_title || r.template_id || '';
  }

  function _groupToAssignment(records) {
    const first = records[0];
    const today = new Date().toISOString().slice(0, 10);
    const dueDate = (first.due_date || '').slice(0, 10) || today;
    const assignedDate = (first.created_at || '').slice(0, 10) || today;
    const condId = first.bundle_id || '';
    const cond = COND_BUNDLES.find(c => c.id === condId);
    // Build the scale list in bundle order (stable display) with any extras.
    const bundleScales = cond && cond.phases && cond.phases[first.phase]
      ? cond.phases[first.phase].slice()
      : [];
    const recordByScale = {};
    records.forEach(r => { recordByScale[_scaleIdFromRecord(r)] = r; });
    const scales = bundleScales.length
      ? bundleScales.filter(s => recordByScale[s]).concat(
          Object.keys(recordByScale).filter(s => !bundleScales.includes(s)))
      : Object.keys(recordByScale);
    const results = [];
    scales.forEach(sid => {
      const r = recordByScale[sid];
      if (!r) return;
      if (r.status === 'completed') {
        const d = r.data || {};
        const score = d.score != null ? d.score
          : (r.score_numeric != null ? r.score_numeric
          : (r.score != null ? parseFloat(r.score) : null));
        if (score != null && !Number.isNaN(score)) {
          results.push({
            scale: sid,
            score,
            interp: d.interpretation || r.severity_label || interpretScore(sid, score),
            items: d.items || null,
          });
        }
      }
    });
    const allCompleted = records.every(r => r.status === 'completed');
    const allApproved = records.every(r => r.approved_status === 'approved');
    let status = allCompleted ? 'completed' : 'pending';
    if (!allCompleted && dueDate < today) status = 'overdue';
    const latestCompleted = records
      .filter(r => r.status === 'completed')
      .map(r => (r.updated_at || r.created_at || '').slice(0, 10))
      .sort().pop() || null;
    return {
      id: 'G-' + _groupKey(first).replace(/\|/g, '-'),
      patientId: first.patient_id || '',
      condId,
      condName: cond ? cond.name : (condId || 'Unassigned'),
      phase: first.phase || 'baseline',
      scales,
      assignedBy: first.clinician_id || 'Clinician',
      assignedDate,
      dueDate,
      recurrence: (first.data && first.data.recurrence) || null,
      status,
      completedDate: allCompleted ? latestCompleted : null,
      reviewed: allApproved && allCompleted,
      results,
      safetyAlerts: (first.data && first.data.safetyAlerts) || [],
      _backendIds: Object.fromEntries(Object.entries(recordByScale).map(([s, r]) => [s, r.id])),
    };
  }

  async function hydrate() {
    DATA.loading = true;
    DATA.error = null;
    try {
      const resp = await api.listAssessments();
      const items = Array.isArray(resp) ? resp : (resp && resp.items) || [];
      const groups = {};
      items.forEach(r => {
        const k = _groupKey(r);
        (groups[k] = groups[k] || []).push(r);
      });
      DATA.assignments = Object.values(groups).map(_groupToAssignment);
    } catch (err) {
      DATA.assignments = [];
      DATA.error = (err && err.message) || 'Failed to load assessments';
      console.warn('[assessments-hub] hydrate failed:', err);
    } finally {
      DATA.loading = false;
    }
  }
  let activeTab = 'dashboard';
  let activeCat = 'all';
  let tlibFilter = 'All';
  let tlibSearch = '';

  const extraMap = Object.fromEntries(EXTRA_SCALES.map(s => [s.id, s]));
  function interpretScore(scaleId, score) {
    return _hubInterpretScore(scaleId, score, extraMap);
  }

  function buildHubScaleBlock(sid, a) {
    const existing = a.results.find(r => r.scale === sid);
    const reg = _hubResolveRegistryScale(sid);
    const routed = routeLegacyRunAssessment(sid, ASSESS_REGISTRY);
    // Implementation-truth gating: do NOT branch on reg?.inline alone.
    // If the checklist is implemented, render item-by-item; otherwise fall back to numeric entry
    // with the same hub-aligned notice copy as the legacy Run panel.
    if (
      routed.route === 'inline_panel' &&
      routed.status === 'implemented_item_checklist' &&
      Array.isArray(reg?.questions) &&
      reg.questions.length
    ) {
      const subId = 'ah2-subtot-' + sid.replace(/[^a-z0-9]/gi, '_');
      const siId = 'ah2-si-' + sid.replace(/[^a-z0-9]/gi, '-');
      const sm = getScaleMeta(sid);
      let html = '<div class="ah2-inline-wrap" data-inline-scale="' + String(sid).replace(/"/g, '&quot;') + '" style="margin-bottom:16px;border:1px solid var(--border);border-radius:10px;padding:12px">';
      html += '<div style="font-weight:700;margin-bottom:8px">' + _hubEscHtml(sid) + (reg.sub ? ' <span style="font-weight:400;color:var(--text-secondary);font-size:12px">' + _hubEscHtml(reg.sub) + '</span>' : '') + '</div>';
      if (sm.scoring_note) {
        html += '<p style="font-size:11px;color:var(--text-tertiary);margin:0 0 10px;line-height:1.45">' + _hubEscHtml(sm.scoring_note) + '</p>';
      }
      reg.questions.forEach((q, i) => {
        html += '<div style="margin-bottom:10px"><span class="ah2-q-num">' + (i + 1) + '</span>';
        html += '<label style="display:block;font-size:12.5px;margin:4px 0 6px;color:var(--text-primary)">' + _hubEscHtml(q) + '</label>';
        html += '<select class="ah2-input ah2-q-select" style="width:100%;max-width:440px">';
        html += '<option value="">—</option>';
        (reg.options || []).forEach(opt => {
          const m = String(opt).match(/\((\d+)\)\s*$/);
          const nv = m ? m[1] : '';
          html += '<option value="' + nv + '">' + _hubEscHtml(opt) + '</option>';
        });
        html += '</select></div>';
      });
      html += '<div style="margin-top:10px;font-weight:600">Total: <span id="' + subId + '">' + (existing ? String(existing.score) : '—') + '</span>';
      html += ' <span class="ah2-score-interp" id="' + siId + '" style="margin-left:8px;font-weight:500;color:var(--text-secondary)">' + (existing ? _hubEscHtml(existing.interp) : '') + '</span></div>';
      html += '</div>';
      return html;
    }
    const es = extraMap[sid];
    const rangeLabel = es ? sid + ' (' + es.min + '-' + es.max + ')' : sid + (reg?.max != null ? ' (0–' + reg.max + ')' : '');
    const minmax = es ? ' min="' + es.min + '" max="' + es.max + '"' : (reg?.max != null ? ' min="0" max="' + reg.max + '"' : '');
    const safeId = sid.replace(/[^a-z0-9]/gi, '-');
    const noticeHtml = getLegacyRunScoreEntryNoticeHtml(routed.status);
    const numericRow =
      '<div class="ah2-score-row">' +
      '<label class="ah2-score-label">' + _hubEscHtml(rangeLabel) + '</label>' +
      '<input type="number" class="ah2-input ah2-score-input" data-scale="' + _hubEscHtml(sid) + '" placeholder="Score" value="' + (existing ? String(existing.score) : '') + '"' + minmax + '/>' +
      '<span class="ah2-score-interp" id="ah2-si-' + safeId + '">' + (existing ? _hubEscHtml(existing.interp) : '') + '</span>' +
    '</div>';
    if (noticeHtml) {
      return (
        '<div class="ah2-impl-gap-wrap" data-impl-gap-scale="' +
        String(sid).replace(/"/g, '&quot;') +
        '">' +
        noticeHtml +
        numericRow +
        '</div>'
      );
    }
    return numericRow;
  }

  function wireHubChecklistListeners(modal) {
    modal.querySelectorAll('.ah2-q-select').forEach(sel => {
      sel.addEventListener('change', function hubQChange() {
        const wrap = this.closest('.ah2-inline-wrap');
        if (!wrap) return;
        const sid = wrap.getAttribute('data-inline-scale');
        if (!sid) return;
        let sum = 0;
        wrap.querySelectorAll('.ah2-q-select').forEach(s => {
          if (s.value !== '') sum += parseInt(s.value, 10) || 0;
        });
        const subId = 'ah2-subtot-' + sid.replace(/[^a-z0-9]/gi, '_');
        const el = document.getElementById(subId);
        if (el) el.textContent = String(sum);
        const interp = interpretScore(sid, sum);
        const si = document.getElementById('ah2-si-' + sid.replace(/[^a-z0-9]/gi, '-'));
        if (si) si.textContent = interp;
      });
    });
  }

  function collectAllScaleTokens(cond) {
    const ids = [];
    PHASES.forEach(ph => {
      (cond.phases[ph] || []).forEach(sid => ids.push(sid));
    });
    return ids;
  }

  function inAppChecklistScaleIds(cond) {
    const { implementedItemChecklist } = partitionScalesByImplementationTruth(
      collectAllScaleTokens(cond),
      ASSESS_REGISTRY,
    );
    return implementedItemChecklist;
  }

  function kpis() {
    const today = new Date().toISOString().slice(0,10);
    const all = DATA.assignments;
    return {
      overdue: all.filter(a => a.status === 'overdue' || (a.status === 'pending' && a.dueDate < today)).length,
      dueToday: all.filter(a => a.status === 'pending' && a.dueDate === today).length,
      pendingReview: all.filter(a => a.status === 'completed' && !a.reviewed).length,
      completed: all.filter(a => a.status === 'completed').length,
      total: all.length,
    };
  }

  function render() {
    const root = document.getElementById('ah2-root');
    if (!root) return;
    if (DATA.loading) {
      root.innerHTML = '<div class="ah2-loading" style="padding:48px;text-align:center;color:var(--text-secondary)">Loading assessments…</div>';
      return;
    }
    if (DATA.error) {
      root.innerHTML =
        '<div class="ah2-error" style="padding:32px;text-align:center;border:1px solid var(--border);border-radius:12px;margin:16px">' +
          '<div style="font-weight:700;margin-bottom:8px;color:var(--danger,#ff6b6b)">Could not load assessments</div>' +
          '<div style="font-size:12.5px;color:var(--text-secondary);margin-bottom:12px">' + _hubEscHtml(DATA.error) + '</div>' +
          '<button class="ah2-btn" onclick="window._ah2Refresh && window._ah2Refresh()">Retry</button>' +
        '</div>';
      return;
    }
    const k = kpis();
    root.innerHTML =
      '<div class="ah2-kpi-strip">' +
        '<div class="ah2-kpi ' + (k.overdue > 0 ? 'ah2-kpi-danger' : '') + '"><span class="ah2-kpi-val">' + k.overdue + '</span><span class="ah2-kpi-lbl">Overdue</span></div>' +
        '<div class="ah2-kpi ' + (k.dueToday > 0 ? 'ah2-kpi-warn' : '') + '"><span class="ah2-kpi-val">' + k.dueToday + '</span><span class="ah2-kpi-lbl">Due Today</span></div>' +
        '<div class="ah2-kpi ' + (k.pendingReview > 0 ? 'ah2-kpi-info' : '') + '"><span class="ah2-kpi-val">' + k.pendingReview + '</span><span class="ah2-kpi-lbl">Pending Review</span></div>' +
        '<div class="ah2-kpi"><span class="ah2-kpi-val">' + k.completed + '</span><span class="ah2-kpi-lbl">Completed</span></div>' +
        '<div class="ah2-kpi"><span class="ah2-kpi-val">' + k.total + '</span><span class="ah2-kpi-lbl">Total Assigned</span></div>' +
      '</div>' +
      '<div class="ah2-tabs">' +
        ['templates','dashboard','scheduled','results','conditions','scales'].map(t =>
          '<button class="ah2-tab' + (activeTab===t?' ah2-tab-active':'') + '" onclick="window._ah2Tab(\'' + t + '\')">' +
          (t==='templates'?'Template Library':t==='dashboard'?'Dashboard':t==='scheduled'?'Scheduled':t==='results'?'Results':t==='conditions'?'53 Conditions':'Scale Library') +
          '</button>'
        ).join('') +
      '</div>' +
      '<div class="ah2-tab-body" id="ah2-body">' + renderTab() + '</div>';
  }

  function renderTab() {
    if (activeTab === 'templates') return renderTemplateLibrary();
    if (activeTab === 'dashboard') return renderDashboard();
    if (activeTab === 'scheduled') return renderScheduled();
    if (activeTab === 'results') return renderResults();
    if (activeTab === 'conditions') return renderConditions();
    if (activeTab === 'scales') return renderScales();
    return '';
  }

  // ── Assessment Template Library ───────────────────────────────────────────
  const ASSESS_TEMPLATES = [
    { id:'PHQ-9',  title:'PHQ-9', cat:'Validated Scale', catKey:'validated', conditions:['Depression','MDD'], time:'3 min', fill:'In-Platform',
      desc:'Patient Health Questionnaire-9. Gold-standard depression screening and severity measure, 9 items scored 0–27.' },
    { id:'GAD-7',  title:'GAD-7', cat:'Validated Scale', catKey:'validated', conditions:['Anxiety'], time:'3 min', fill:'In-Platform',
      desc:'Generalised Anxiety Disorder 7-item scale. Validated for anxiety screening and severity measurement.' },
    { id:'PCL-5',  title:'PCL-5', cat:'Validated Scale', catKey:'validated', conditions:['PTSD','Trauma'], time:'10 min', fill:'In-Platform',
      desc:'PTSD Checklist for DSM-5. 20-item self-report measure of PTSD symptoms over the past month.' },
    { id:'HDRS-17',title:'HDRS-17', cat:'Validated Scale', catKey:'validated', conditions:['Depression'], time:'8 min', fill:'In-Platform',
      desc:'Hamilton Depression Rating Scale (17 items). Clinician-administered scale for depression severity.' },
    { id:'MADRS',  title:'MADRS', cat:'Validated Scale', catKey:'validated', conditions:['Depression'], time:'6 min', fill:'In-Platform',
      desc:'Montgomery-Asberg Depression Rating Scale. 10-item clinician-rated scale sensitive to TMS treatment change.' },
    { id:'MoCA',   title:'MoCA', cat:'Validated Scale', catKey:'validated', conditions:['Cognition','Dementia'], time:'10 min', fill:'In-Platform',
      desc:'Montreal Cognitive Assessment. 30-point screen for mild cognitive impairment and dementia.' },
    { id:'PSQI',   title:'PSQI', cat:'Validated Scale', catKey:'validated', conditions:['Sleep Disorders'], time:'5 min', fill:'In-Platform',
      desc:'Pittsburgh Sleep Quality Index. 19-item self-rated questionnaire assessing sleep quality over past month.' },
    { id:'BPRS',   title:'BPRS', cat:'Validated Scale', catKey:'validated', conditions:['Psychosis','Schizophrenia'], time:'8 min', fill:'In-Platform',
      desc:'Brief Psychiatric Rating Scale. 24-item clinician-rated scale for psychotic and mood symptoms.' },
    { id:'NB-FORM',title:'Neuromod Baseline Form', cat:'Structured Form', catKey:'form', conditions:['All conditions'], time:'15 min', fill:'In-Platform',
      desc:'Comprehensive neuromodulation baseline: medical history, current medications, contraindications, session goals.' },
    { id:'ST-FORM',title:'Session Tolerance Form', cat:'Structured Form', catKey:'form', conditions:['All conditions'], time:'3 min', fill:'In-Platform',
      desc:'Pre/post-session tolerability check: discomfort ratings, adverse sensations, session-readiness confirmation.' },
    { id:'WP-FORM',title:'Weekly Progress Check', cat:'Structured Form', catKey:'form', conditions:['All conditions'], time:'5 min', fill:'In-Platform',
      desc:'Weekly structured self-report covering symptom change, sleep, mood, energy, and treatment adherence.' },
    { id:'SE-FORM',title:'Side Effect Monitor', cat:'Structured Form', catKey:'form', conditions:['All conditions'], time:'5 min', fill:'In-Platform',
      desc:'Structured side-effect checklist: headache, scalp discomfort, twitching, cognitive effects — graded severity.' },
    { id:'DEP-BDL', title:'Depression Protocol Bundle', cat:'Condition Bundle', catKey:'bundle', conditions:['Depression'], time:null, fill:'In-Platform',
      desc:'PHQ-9 + HDRS-17 + Side Effect Monitor — recommended battery for TMS depression treatment monitoring.' },
    { id:'ADHD-BDL',title:'ADHD Protocol Bundle', cat:'Condition Bundle', catKey:'bundle', conditions:['ADHD'], time:null, fill:'In-Platform',
      desc:'CAARS + CGI + Side Effect Monitor — recommended battery for tDCS ADHD treatment monitoring.' },
    { id:'PTSD-BDL',title:'PTSD Protocol Bundle', cat:'Condition Bundle', catKey:'bundle', conditions:['PTSD'], time:null, fill:'In-Platform',
      desc:'PCL-5 + Side Effect Monitor + PSQI — recommended battery for TMS PTSD treatment monitoring.' },
  ];
  // "Caregiver" chip removed — no template carries a caregiver catKey, so it
  // always rendered zero results. Remove, not disable.
  const ASSESS_FILTER_CHIPS = ['All','Validated Scales','Structured Forms','Condition Bundles','Side Effects'];
  const ASSESS_CAT_MAP = { 'Validated Scales':'validated', 'Structured Forms':'form', 'Condition Bundles':'bundle' };

  function renderTemplateLibrary() {
    const q = tlibSearch.toLowerCase();
    const filterKey = ASSESS_CAT_MAP[tlibFilter] || null;
    let items = ASSESS_TEMPLATES;
    if (filterKey) items = items.filter(i => i.catKey === filterKey);
    if (tlibFilter === 'Side Effects') items = items.filter(i => i.title.toLowerCase().includes('side') || i.conditions.some(c => c.toLowerCase().includes('side')));
    if (q) items = items.filter(i => i.title.toLowerCase().includes(q) || i.cat.toLowerCase().includes(q) || i.conditions.join(' ').toLowerCase().includes(q) || i.desc.toLowerCase().includes(q));
    const chips = ASSESS_FILTER_CHIPS.map(f =>
      '<button class="tlib-filter-chip' + (tlibFilter===f?' active':'') + '" onclick="window._ah2TlibFilter(\'' + f + '\')">' + f + '</button>'
    ).join('');
    const badgeCls = { validated:'tlib-badge--validated', form:'tlib-badge--form', bundle:'tlib-badge--bundle' };
    const cards = items.length ? items.map(item => {
      const tags = item.conditions.slice(0,3).map(c => '<span class="tlib-badge tlib-badge--form">' + c + '</span>').join('');
      const timeTxt = item.time ? '<span style="margin-right:8px">&#9201; ' + item.time + '</span>' : '';
      return '<div class="tlib-card">' +
        '<div class="tlib-card-title">' + item.title + '</div>' +
        '<div class="tlib-card-badges">' +
          '<span class="tlib-badge ' + (badgeCls[item.catKey]||'tlib-badge--form') + '">' + item.cat + '</span>' +
          tags +
        '</div>' +
        '<div class="tlib-card-meta">' + timeTxt + (item.fill ? '<span class="tlib-badge tlib-badge--clinical">' + item.fill + '</span>' : '') + '</div>' +
        '<div class="tlib-card-meta" style="margin-bottom:0">' + item.desc + '</div>' +
        '<div class="tlib-card-actions">' +
          '<button class="tlib-btn-assign" onclick="window._ah2TlibAssign(\'' + item.id + '\',\'' + item.title.replace(/'/g,"\\'") + '\')">Assign</button>' +
          '<button class="tlib-btn-preview" onclick="window._ah2TlibPreview(\'' + item.id + '\')">Preview</button>' +
        '</div>' +
      '</div>';
    }).join('') : '<div class="tlib-empty"><div class="tlib-empty-icon">&#128269;</div><div class="tlib-empty-msg">No templates match your search</div></div>';
    return '<div class="tlib-wrap">' +
      '<div class="tlib-search-bar"><input class="tlib-search-input" id="ah2-tlib-search" type="text" placeholder="Search scales, forms, bundles\u2026" value="' + tlibSearch.replace(/"/g,'&quot;') + '" oninput="window._ah2TlibSearch(this.value)"/></div>' +
      '<div class="tlib-filters">' + chips + '</div>' +
      '<div class="tlib-grid">' + cards + '</div>' +
    '</div>';
  }

  function assignCard(a) {
    const today = new Date().toISOString().slice(0,10);
    const isOverdue = a.status === 'overdue' || (a.status === 'pending' && a.dueDate < today);
    const statusCls = isOverdue ? 'ah2-status-danger' : a.status === 'completed' ? 'ah2-status-ok' : 'ah2-status-warn';
    const statusLabel = isOverdue && a.status === 'pending' ? 'overdue' : a.status;
    // Escape every piece of assignment data before inlining into HTML. Patient
    // IDs and condition names originate from user input / localStorage and
    // must not be trusted as HTML. `safeId` is used for attribute values.
    const safeId = String(a.id || '').replace(/[^A-Za-z0-9_-]/g, '');
    const phaseKey = String(a.phase || '').replace(/[^a-z_]/gi, '');
    const phaseLbl = PHASE_LABELS[a.phase] || a.phase || '';
    return '<div class="ah2-assign-card' + (isOverdue ? ' ah2-assign-card--danger' : '') + '">' +
      '<div class="ah2-assign-main">' +
        '<span class="ah2-assign-cond">' + _hubEscHtml(a.condName || '') + '</span>' +
        '<span class="ah2-phase-pill ah2-phase-' + phaseKey + '">' + _hubEscHtml(phaseLbl) + '</span>' +
        '<span class="ah2-assign-patient">Patient ' + _hubEscHtml(a.patientId || '') + '</span>' +
        '<div class="ah2-assign-scales">' + (a.scales || []).map(_hubEscHtml).join(' &middot; ') + '</div>' +
      '</div>' +
      '<div class="ah2-assign-meta">' +
        '<span class="ah2-badge ' + statusCls + '">' + _hubEscHtml(statusLabel) + '</span>' +
        '<span class="ah2-assign-due">Due ' + _hubEscHtml(a.dueDate || '') + '</span>' +
      '</div>' +
      '<div class="ah2-assign-actions">' +
        (a.status !== 'completed' ? '<button class="ah2-btn ah2-btn-sm" onclick="window._ah2Score(\'' + safeId + '\')">Enter Scores</button>' : '') +
        (a.status === 'completed' && !a.reviewed ? '<button class="ah2-btn ah2-btn-sm ah2-btn-info" onclick="window._ah2Review(\'' + safeId + '\')">Review</button>' : '') +
        '<button class="ah2-btn ah2-btn-sm ah2-btn-ghost" onclick="window._ah2Detail(\'' + safeId + '\')">Detail</button>' +
      '</div>' +
    '</div>';
  }

  function renderDashboard() {
    const today = new Date().toISOString().slice(0,10);
    const overdueList = DATA.assignments.filter(a => a.status === 'overdue' || (a.status === 'pending' && a.dueDate < today));
    const dueList = DATA.assignments.filter(a => a.status === 'pending' && a.dueDate === today);
    const reviewList = DATA.assignments.filter(a => a.status === 'completed' && !a.reviewed);
    let html = '';
    if (overdueList.length) html += '<div class="ah2-dash-section"><h3 class="ah2-dash-heading ah2-dash-heading--danger">Overdue (' + overdueList.length + ')</h3><div class="ah2-assign-list">' + overdueList.map(assignCard).join('') + '</div></div>';
    if (dueList.length) html += '<div class="ah2-dash-section"><h3 class="ah2-dash-heading ah2-dash-heading--warn">Due Today (' + dueList.length + ')</h3><div class="ah2-assign-list">' + dueList.map(assignCard).join('') + '</div></div>';
    if (reviewList.length) html += '<div class="ah2-dash-section"><h3 class="ah2-dash-heading ah2-dash-heading--info">Pending Review (' + reviewList.length + ')</h3><div class="ah2-assign-list">' + reviewList.map(assignCard).join('') + '</div></div>';
    if (!html) html = '<div class="ah2-empty">All clear — no urgent items</div>';
    return '<div class="ah2-dash">' + html + '</div>';
  }

  function renderScheduled() {
    const active = DATA.assignments.filter(a => a.status !== 'completed');
    if (!active.length) return '<div class="ah2-empty">No active assignments</div>';
    return '<div class="ah2-assign-list">' + active.map(assignCard).join('') + '</div>';
  }

  function renderResults() {
    const done = DATA.assignments.filter(a => a.status === 'completed');
    if (!done.length) return '<div class="ah2-empty">No completed assessments yet</div>';
    return '<div class="ah2-assign-list">' + done.map(a => {
      const safeId = String(a.id || '').replace(/[^A-Za-z0-9_-]/g, '');
      const phaseKey = String(a.phase || '').replace(/[^a-z_]/gi, '');
      const phaseLbl = PHASE_LABELS[a.phase] || a.phase || '';
      const scaleSummary = (a.results && a.results.length > 0)
        ? a.results.map(r => _hubEscHtml(r.scale) + ': <strong>' + _hubEscHtml(String(r.score)) + '</strong> (' + _hubEscHtml(r.interp || '') + ')').join(' &middot; ')
        : (a.scales || []).map(_hubEscHtml).join(' &middot; ');
      return '<div class="ah2-assign-card">' +
        '<div class="ah2-assign-main">' +
          '<span class="ah2-assign-cond">' + _hubEscHtml(a.condName || '') + '</span>' +
          '<span class="ah2-phase-pill ah2-phase-' + phaseKey + '">' + _hubEscHtml(phaseLbl) + '</span>' +
          '<span class="ah2-assign-patient">Patient ' + _hubEscHtml(a.patientId || '') + '</span>' +
          '<div class="ah2-assign-scales">' + scaleSummary + '</div>' +
        '</div>' +
        '<div class="ah2-assign-meta">' +
          '<span class="ah2-badge ' + (a.reviewed ? 'ah2-status-ok' : 'ah2-status-info') + '">' + (a.reviewed ? 'Reviewed' : 'Needs Review') + '</span>' +
          '<span class="ah2-assign-due">Completed ' + _hubEscHtml(a.completedDate || '') + '</span>' +
        '</div>' +
        '<div class="ah2-assign-actions">' +
          (!a.reviewed ? '<button class="ah2-btn ah2-btn-sm ah2-btn-info" onclick="window._ah2Review(\'' + safeId + '\')">Review</button>' : '') +
          '<button class="ah2-btn ah2-btn-sm ah2-btn-ghost" onclick="window._ah2Detail(\'' + safeId + '\')">Detail</button>' +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  function renderConditions() {
    const cats = activeCat === 'all' ? CATEGORIES : [activeCat];
    const filterBtns = '<button class="ah2-filter-btn' + (activeCat==='all'?' ah2-filter-btn-active':'') + '" onclick="window._ah2Cat(\'all\')">All (' + COND_BUNDLES.length + ')</button>' +
      CATEGORIES.map(c => '<button class="ah2-filter-btn' + (activeCat===c?' ah2-filter-btn-active':'') + '" onclick="window._ah2Cat(\'' + c + '\')">' + c + '</button>').join('');
    const body = cats.map(cat => {
      const conds = COND_BUNDLES.filter(c => c.category === cat);
      return '<div class="ah2-cat-section"><h3 class="ah2-cat-heading">' + cat + ' <span class="ah2-cat-count">' + conds.length + '</span></h3>' +
        '<div class="ah2-cond-grid">' + conds.map(cond => {
          const inApp = inAppChecklistScaleIds(cond);
          const inAppSummary = inApp.length ? (inApp.length + ' in-app screener' + (inApp.length === 1 ? '' : 's')) : 'No in-app item lists';
          const baselineBadges = (cond.phases.baseline || [])
            .map(s => formatScaleWithImplementationBadgeHtml(s, ASSESS_REGISTRY))
            .join('<span style="opacity:0.35"> · </span>');
          return '<div class="ah2-cond-card">' +
            '<div class="ah2-cond-header"><span class="ah2-cond-id">' + cond.id + '</span><span class="ah2-cond-name">' + cond.name + '</span></div>' +
            '<div class="ah2-phase-pills">' + PHASES.map(ph => '<span class="ah2-phase-pill ah2-phase-' + ph + '" title="' + PHASE_LABELS[ph] + ': ' + cond.phases[ph].join(', ') + '">' + PHASE_LABELS[ph] + '</span>').join('') + '</div>' +
            '<div class="ah2-cond-scales ah2-cond-scale-line"><strong style="color:var(--text-primary)">Baseline</strong> · ' + baselineBadges + '</div>' +
            '<div class="ah2-cond-checklists" style="font-size:11.5px;color:var(--text-secondary);margin:2px 0 8px;line-height:1.45">Bundle summary: ' + _hubEscHtml(inAppSummary) + '</div>' +
            '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
            '<button class="ah2-btn ah2-btn-sm" onclick="window._ah2AssignCond(\'' + cond.id + '\')">Assign Bundle</button>' +
            '<button class="ah2-btn ah2-btn-sm ah2-btn-ghost" onclick="window._ah2CondInfo(\'' + cond.id + '\')">Info &amp; links</button>' +
            '</div>' +
          '</div>';
        }).join('') + '</div></div>';
    }).join('');
    return '<div class="ah2-cond-toolbar">' + filterBtns + '</div>' + body;
  }

  function renderScales() {
    const domains = [...new Set(EXTRA_SCALES.map(s => s.domain))];
    return '<div class="ah2-scale-count">Extended scale library: <strong>' + EXTRA_SCALES.length + '</strong> scales</div>' +
      domains.map(dom => {
        const scs = EXTRA_SCALES.filter(s => s.domain === dom);
        return '<div class="ah2-scale-domain"><h4 class="ah2-scale-domain-title">' + dom + '</h4>' +
          '<div class="ah2-scale-grid">' + scs.map(s =>
            '<div class="ah2-scale-card">' +
              '<div class="ah2-scale-name">' + s.name + '</div>' +
              '<div class="ah2-scale-full">' + s.full + '</div>' +
              '<div class="ah2-scale-range">Range: ' + s.min + '\u2013' + s.max + ' &bull; ' + s.items + ' items</div>' +
              '<div class="ah2-scale-interps">' + s.interpretation.map(r => r.label + ' (&le;' + r.max + ')').join(' &bull; ') + '</div>' +
            '</div>'
          ).join('') + '</div></div>';
      }).join('');
  }

  window._ah2Tab = function(t) { activeTab = t; render(); };
  window._ah2Cat = function(c) { activeCat = c; render(); };

  window._ah2TlibFilter = function(f) { tlibFilter = f; render(); };
  window._ah2TlibSearch = function(v) { tlibSearch = v; render(); document.getElementById('ah2-tlib-search')?.focus(); };
  window._ah2TlibAssign = function(id, title) {
    window._dsShowAssignModal({
      templateName: title,
      templateId: id,
      templateType: 'assessment',
      onAssign: async (patientId, patientName) => {
        // Backend AssessmentAssignRequest expects the normalized template id
        // (lowercase, alphanumeric-only — e.g. PHQ-9 → phq9). Non-normalized
        // ids fail server-side template lookup and create an assessment with
        // no embedded sections. Match the bulk-assign path's normalization.
        const normalized = String(id || '').toLowerCase().replace(/[^a-z0-9]/g, '') || String(id || '').toLowerCase();
        try {
          await api.assignAssessment(patientId, { template_id: normalized });
        } catch (err) {
          const msg = (err && err.message) || 'Network error';
          if (window._showNotifToast) {
            window._showNotifToast({ title: 'Assignment failed', body: msg, severity: 'critical' });
          } else {
            _dsToast('Assignment failed: ' + msg, 'error');
          }
          return;
        }
        try { await hydrate(); render(); } catch {}
        if (window._showNotifToast) {
          window._showNotifToast({ title: 'Assessment Assigned', body: '\u201c' + title + '\u201d assigned to ' + patientName, severity: 'success' });
        } else {
          _dsToast('\u201c' + title + '\u201d assigned to ' + patientName, 'success');
        }
      }
    });
  };
  window._ah2TlibPreview = function(id) {
    const item = ASSESS_TEMPLATES.find(x => x.id === id);
    if (!item) return;
    // Resolve the instrument registry entry for real items (PHQ-9, GAD-7,
    // PCL-5, etc. carry full questions + options). Licensed instruments
    // have no embedded items; we surface licensing instead.
    const reg = ASSESS_REGISTRY.find(r => r.id === id) || null;
    const esc = s => String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    let body = '';
    body += '<div style="font-size:12px;color:var(--text-secondary);line-height:1.6;margin-bottom:10px">' + esc(item.desc || '') + '</div>';
    body += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px">';
    body += '<span class="tlib-badge tlib-badge--form">' + esc(item.cat) + '</span>';
    if (item.time) body += '<span class="tlib-badge tlib-badge--form">\u23F1 ' + esc(item.time) + '</span>';
    (item.conditions || []).slice(0, 4).forEach(c => {
      body += '<span class="tlib-badge tlib-badge--form">' + esc(c) + '</span>';
    });
    body += '</div>';

    if (reg && Array.isArray(reg.questions) && reg.questions.length) {
      body += '<h4 style="margin:0 0 6px;font-size:12.5px;font-weight:700">Items</h4>';
      body += '<ol style="margin:0 0 14px;padding-left:20px;font-size:12.5px;line-height:1.55;color:var(--text-primary)">';
      reg.questions.forEach(q => { body += '<li style="margin-bottom:4px">' + esc(q) + '</li>'; });
      body += '</ol>';
      if (Array.isArray(reg.options) && reg.options.length) {
        body += '<h4 style="margin:0 0 6px;font-size:12.5px;font-weight:700">Response options</h4>';
        body += '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:14px">';
        body += reg.options.map(o => esc(o)).join(' &middot; ');
        body += '</div>';
      }
    } else if (reg) {
      body += '<div role="note" style="font-size:12px;color:var(--amber,#ffb547);background:rgba(255,181,71,0.08);border:1px solid rgba(255,181,71,0.25);border-radius:6px;padding:8px 10px;margin-bottom:14px;line-height:1.5">'
        + 'Licensed instrument \u2014 item text must be administered via an authorized copy. DeepSynaps stores total score and interpretation only.'
        + '</div>';
    } else {
      body += '<div style="font-size:12px;color:var(--text-tertiary);margin-bottom:14px">Structured form \u2014 full layout rendered when the form is opened for a patient.</div>';
    }

    if (reg && reg.scoringKey) {
      body += '<div style="font-size:11.5px;color:var(--text-tertiary);line-height:1.5">Scoring: interpretation is computed from the total per the published rubric.</div>';
    }

    const title = document.getElementById('ah2-preview-title');
    const bd = document.getElementById('ah2-preview-body');
    if (title) title.textContent = item.title;
    if (bd) bd.innerHTML = body;
    document.getElementById('ah2-preview-modal')?.classList.remove('ah2-hidden');
  };

  window._ah2PreviewBundle = function() {
    const condSel = document.getElementById('ah2-f-cond');
    const phaseSel = document.getElementById('ah2-f-phase');
    const prev = document.getElementById('ah2-bundle-preview');
    if (!prev || !condSel) return;
    const cond = COND_BUNDLES.find(c => c.id === condSel.value);
    if (!cond) { prev.textContent = 'Select condition and phase to preview scales'; return; }
    const ph = (phaseSel && phaseSel.value) || 'baseline';
    const scales = cond.phases[ph] || [];
    prev.innerHTML = '<strong>' + PHASE_LABELS[ph] + ' bundle (' + scales.length + ' scales):</strong><br>' + scales.join(', ');
  };

  window._ah2AssignCond = function(condId) {
    const modal = document.getElementById('ah2-assign-modal');
    if (!modal) return;
    const sel = modal.querySelector('#ah2-f-cond');
    if (sel) sel.value = condId;
    window._ah2PreviewBundle();
    modal.classList.remove('ah2-hidden');
  };

  window._ah2SaveAssign = async function() {
    const patient = ((document.getElementById('ah2-f-patient') || {}).value || '').trim();
    const condId = (document.getElementById('ah2-f-cond') || {}).value || '';
    const phase = (document.getElementById('ah2-f-phase') || {}).value || '';
    const due = (document.getElementById('ah2-f-due') || {}).value || '';
    const recur = (document.getElementById('ah2-f-recur') || {}).value || '';
    if (!patient || !condId || !phase || !due) { _dsToast('Please fill in all required fields before assigning.', 'warn'); return; }
    if (patient.length < 3 || /[<>"]/.test(patient)) {
      _dsToast('Patient ID looks invalid. Pick a patient from the list or enter the clinic-issued ID.', 'warn');
      return;
    }
    const cond = COND_BUNDLES.find(c => c.id === condId);
    if (!cond) { _dsToast('Unknown condition bundle.', 'warn'); return; }
    const scales = cond.phases[phase] || [];
    if (!scales.length) { _dsToast('No scales defined for this phase.', 'warn'); return; }

    // Disable the Assign button while the request is in flight so a double-click
    // can't create two bundles. The hub re-renders on success; failure re-enables.
    const btn = document.querySelector('#ah2-assign-modal .ah2-btn:not(.ah2-btn-ghost)');
    if (btn) { btn.disabled = true; btn.textContent = 'Assigning…'; }
    try {
      // Backend wants one record per scale. We ship the human-readable scale id
      // in `data.scale_id` so hydrate() can round-trip it back to the UI label
      // the clinician recognises (PHQ-9, C-SSRS, etc.).
      const items = scales.map(sid => {
        const tpl = _hubResolveRegistryScale(sid);
        const templateId = (tpl?.scoringKey || tpl?.id || sid || '').toString().toLowerCase().replace(/[^a-z0-9]/g, '') || String(sid).toLowerCase();
        const templateTitle = tpl?.t || tpl?.abbr || sid;
        return { sid, templateId, templateTitle, scoringKey: tpl?.scoringKey, inline: !!tpl?.inline };
      });
      // bulk-assign takes one template list; we call it once and then PATCH each
      // record with the right data.scale_id (so hydrate() can map it back).
      const resp = await api.bulkAssignAssessments({
        patient_id: patient,
        template_ids: items.map(i => i.templateId),
        phase,
        due_date: due,
        bundle_id: condId,
        clinician_notes: recur ? 'Recurrence: ' + recur : null,
      });
      const created = (resp && resp.created) || [];
      // Stamp each newly-created record with its scale id + recurrence so the
      // grouping/round-trip in hydrate() lines up cleanly.
      await Promise.all(created.map(async (rec, idx) => {
        const item = items[idx] || items.find(i => i.templateId === rec.template_id);
        if (!item) return;
        try {
          await api.updateAssessment(rec.id, {
            data: {
              ...(rec.data || {}),
              scale_id: item.sid,
              scale_label: item.templateTitle,
              recurrence: recur || null,
            },
            scale_version: item.scoringKey ? item.scoringKey + '@1' : null,
            respondent_type: item.inline ? 'patient' : 'clinician',
          });
        } catch (err) {
          console.warn('[assessments-hub] stamp failed for', item.sid, err);
        }
      }));
      const failed = (resp && resp.failed) || [];
      if (failed.length) {
        window._showNotifToast?.({ title: 'Some scales failed', body: failed.map(f => f.template_id + ': ' + f.reason).join(' | '), severity: 'warning' });
      } else {
        window._showNotifToast?.({ title: 'Bundle assigned', body: scales.length + ' scales queued for ' + patient, severity: 'success' });
      }
      document.getElementById('ah2-assign-modal').classList.add('ah2-hidden');
      await hydrate();
      render();
    } catch (err) {
      const msg = (err && err.message) || 'Network error';
      console.warn('[assessments-hub] assign failed:', err);
      window._showNotifToast?.({ title: 'Assignment failed', body: msg, severity: 'critical' });
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Assign'; }
    }
  };

  window._ah2Score = function(id) {
    const a = DATA.assignments.find(x => x.id === id);
    if (!a) return;
    const modal = document.getElementById('ah2-score-modal');
    modal.dataset.assignId = id;
    document.getElementById('ah2-score-body').innerHTML =
      '<p class="ah2-score-info"><strong>' + _hubEscHtml(a.condName) + '</strong> &bull; ' + _hubEscHtml(PHASE_LABELS[a.phase]) + ' &bull; Patient ' + _hubEscHtml(a.patientId) + '</p>' +
      '<p class="ah2-score-hint">Use the item checklists for validated self-report scales (PHQ-9, GAD-7, ISI, PCL-5, etc.). Enter numeric totals for clinician-rated or extended scales.</p>' +
      a.scales.map(sid => buildHubScaleBlock(sid, a)).join('');
    modal.querySelectorAll('.ah2-score-input').forEach(inp => {
      inp.addEventListener('input', function() {
        const interp = interpretScore(this.dataset.scale, parseInt(this.value, 10));
        const el = document.getElementById('ah2-si-' + this.dataset.scale.replace(/[^a-z0-9]/gi, '-'));
        if (el) el.textContent = interp;
      });
    });
    wireHubChecklistListeners(modal);
    modal.classList.remove('ah2-hidden');
  };

  window._ah2SaveScores = async function() {
    const modal = document.getElementById('ah2-score-modal');
    const a = DATA.assignments.find(x => x.id === modal.dataset.assignId);
    if (!a) return;
    const results = [];
    const incomplete = [];
    const safetyAlerts = [];
    modal.querySelectorAll('.ah2-inline-wrap').forEach(wrap => {
      const sid = wrap.getAttribute('data-inline-scale');
      if (!sid) return;
      const selects = [...wrap.querySelectorAll('.ah2-q-select')];
      const vals = selects.map(s => s.value);
      if (vals.every(v => v === '')) return;
      if (vals.some(v => v === '')) {
        incomplete.push(sid);
        return;
      }
      const numeric = vals.map(v => parseInt(v, 10));
      const sum = numeric.reduce((acc, n) => acc + n, 0);
      results.push({ scale: sid, score: sum, interp: interpretScore(sid, sum), items: numeric });
      // PHQ-9 item 9 (self-harm) — any non-zero answer triggers the clinic's
      // suicide-safety protocol before the patient leaves.
      if (/^PHQ-?9$/i.test(sid) && numeric.length >= 9 && numeric[8] >= 1) {
        safetyAlerts.push({
          scale: 'PHQ-9',
          severity: numeric[8] >= 2 ? 'critical' : 'warn',
          message: 'PHQ-9 item 9 (self-harm) = ' + numeric[8] + '. Follow suicide-safety protocol and document response before the patient leaves.',
        });
      }
    });
    if (incomplete.length) {
      window._showNotifToast?.({ title: 'Incomplete checklists', body: 'Finish every item for: ' + incomplete.join(', '), severity: 'warning' });
      return;
    }
    modal.querySelectorAll('.ah2-score-input').forEach(inp => {
      if (inp.value !== '') {
        const score = parseInt(inp.value, 10);
        results.push({ scale: inp.dataset.scale, score, interp: interpretScore(inp.dataset.scale, score) });
        // C-SSRS numeric (0-6). ≥2 = active ideation (warn); ≥4 = behavior/plan (critical).
        if (/^C-?SSRS$/i.test(inp.dataset.scale) && !Number.isNaN(score) && score >= 2) {
          safetyAlerts.push({
            scale: 'C-SSRS',
            severity: score >= 4 ? 'critical' : 'warn',
            message: score >= 4
              ? 'C-SSRS indicates suicidal behavior/plan — escalate immediately per crisis protocol.'
              : 'C-SSRS indicates active ideation — clinician review required before session.',
          });
        }
      }
    });
    if (!results.length) {
      window._showNotifToast?.({ title: 'No scores', body: 'Enter at least one scale score or checklist.', severity: 'warning' });
      return;
    }

    const saveBtn = modal.querySelector('.ah2-btn:not(.ah2-btn-ghost)');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }
    const failures = [];
    try {
      // PATCH each backend record for the scales we just scored. Unscored scales
      // in the bundle stay `pending` — the clinician can finish them later.
      await Promise.all(results.map(async r => {
        const backendId = a._backendIds && a._backendIds[r.scale];
        if (!backendId) {
          failures.push({ scale: r.scale, reason: 'No backend id — was this assignment created offline?' });
          return;
        }
        try {
          await api.updateAssessment(backendId, {
            status: 'completed',
            score: String(r.score),
            data: {
              score: r.score,
              interpretation: r.interp,
              items: r.items || null,
              scale_id: r.scale,
              source: 'assessments-hub',
              safetyAlerts: safetyAlerts.filter(s => s.scale === r.scale),
            },
          });
        } catch (err) {
          failures.push({ scale: r.scale, reason: (err && err.message) || 'Network error' });
        }
      }));

      // Legacy sidecar: ds_assessment_runs localStorage keeps the patient-profile
      // Assessments tab + dashboard widgets working. We write directly so we don't
      // re-trigger the old fire-and-forget api.createAssessment path (would dupe).
      try {
        const runs = JSON.parse(localStorage.getItem('ds_assessment_runs') || '[]');
        const ts = new Date().toISOString();
        results.forEach(r => {
          const tpl = _hubResolveRegistryScale(r.scale);
          const sm = getScaleMeta(r.scale);
          runs.push({
            patient_id: a.patientId,
            scale_id: r.scale,
            scale_name: (!sm.unknown && sm.display_name) ? sm.display_name : (tpl?.abbr || tpl?.t || r.scale),
            score: r.score,
            interpretation: r.interp || '',
            completed_at: ts,
            status: 'completed',
            timing_window: a.phase || '',
            source: 'assessments-hub',
            assignment_id: a.id,
            condition_name: a.condName || '',
          });
        });
        localStorage.setItem('ds_assessment_runs', JSON.stringify(runs));
        window.dispatchEvent(new CustomEvent('ds-assessment-runs-updated', { detail: { patientId: a.patientId } }));
      } catch {}

      modal.classList.add('ah2-hidden');
      if (failures.length) {
        window._showNotifToast?.({
          title: 'Some scores did not save',
          body: failures.map(f => f.scale + ': ' + f.reason).join(' | '),
          severity: 'warning',
        });
      }
      if (safetyAlerts.length) {
        const critical = safetyAlerts.some(s => s.severity === 'critical');
        window._showNotifToast?.({
          title: critical ? 'SAFETY ALERT — immediate review required' : 'Safety flag — clinician review required',
          body: safetyAlerts.map(s => s.scale + ': ' + s.message).join(' | '),
          severity: critical ? 'critical' : 'warning',
        });
      } else if (!failures.length) {
        window._showNotifToast?.({ title: 'Scores saved', body: 'Totals synced to patient assessments and clinic metrics.', severity: 'success' });
      }
      await hydrate();
      render();
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save & Complete'; }
    }
  };

  window._ah2Review = async function(id) {
    const a = DATA.assignments.find(x => x.id === id);
    if (!a) return;
    const ids = Object.values(a._backendIds || {});
    if (!ids.length) { _dsToast('Nothing to review — assignment has no backend records.', 'warn'); return; }
    try {
      await Promise.all(ids.map(bid =>
        api.approveAssessment(bid, { approved: true }).catch(err => {
          console.warn('[assessments-hub] approve failed for', bid, err);
          throw err;
        })
      ));
      window._showNotifToast?.({ title: 'Reviewed', body: 'Assignment marked approved.', severity: 'success' });
      await hydrate();
      render();
      window._ah2Detail(id);
    } catch (err) {
      const msg = (err && err.message) || 'Network error';
      window._showNotifToast?.({ title: 'Review failed', body: msg, severity: 'critical' });
    }
  };

  window._ah2Detail = function(id) {
    const a = DATA.assignments.find(x => x.id === id);
    if (!a) return;
    const rows = [
      ['Condition', '<strong>' + a.condName + '</strong>'],
      ['Phase', '<span class="ah2-phase-pill ah2-phase-' + a.phase + '">' + PHASE_LABELS[a.phase] + '</span>'],
      ['Patient', a.patientId],
      ['Assigned By', a.assignedBy],
      ['Assigned', a.assignedDate],
      ['Due', a.dueDate],
      ['Recurrence', a.recurrence || 'None'],
      ['Status', a.status],
      ['Reviewed', a.reviewed ? 'Yes' : 'No'],
      ['Scales', a.scales.join(', ')],
    ].map(r => '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>').join('');
    const scoresHtml = a.results.length > 0
      ? '<h4 class="ah2-detail-results-title">Scores</h4><table class="ah2-detail-table"><thead><tr><th>Scale</th><th>Score</th><th>Interpretation</th></tr></thead><tbody>' +
        a.results.map(r => '<tr><td>' + r.scale + '</td><td><strong>' + r.score + '</strong></td><td>' + r.interp + '</td></tr>').join('') + '</tbody></table>'
      : '<p class="ah2-detail-noresults">No scores entered yet</p>';
    document.getElementById('ah2-detail-body').innerHTML = '<table class="ah2-detail-table"><tbody>' + rows + '</tbody></table>' + scoresHtml;
    document.getElementById('ah2-detail-modal').classList.remove('ah2-hidden');
  };

  const dueDefault = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const assignModalHtml =
    '<div class="ah2-modal-overlay ah2-hidden" id="ah2-assign-modal">' +
      '<div class="ah2-modal-box">' +
        '<div class="ah2-modal-header"><h2>Assign Assessment Bundle</h2>' +
        '<button class="ah2-modal-close" onclick="document.getElementById(\'ah2-assign-modal\').classList.add(\'ah2-hidden\')">&times;</button></div>' +
        '<div class="ah2-modal-body">' +
          '<div class="ah2-form-row"><label>Patient ID</label><input id="ah2-f-patient" type="text" class="ah2-input" placeholder="P-XXXX"/></div>' +
          '<div class="ah2-form-row"><label>Condition</label><select id="ah2-f-cond" class="ah2-input" onchange="window._ah2PreviewBundle()">' +
            '<option value="">Select condition</option>' +
            CATEGORIES.map(cat => '<optgroup label="' + cat + '">' + COND_BUNDLES.filter(c => c.category === cat).map(c => '<option value="' + c.id + '">' + c.name + '</option>').join('') + '</optgroup>').join('') +
          '</select></div>' +
          '<div class="ah2-form-row"><label>Phase</label><select id="ah2-f-phase" class="ah2-input" onchange="window._ah2PreviewBundle()">' + PHASES.map(p => '<option value="' + p + '">' + PHASE_LABELS[p] + '</option>').join('') + '</select></div>' +
          '<div class="ah2-form-row"><label>Due Date</label><input id="ah2-f-due" type="date" class="ah2-input" value="' + dueDefault + '"/></div>' +
          '<div class="ah2-form-row"><label>Recurrence</label><select id="ah2-f-recur" class="ah2-input"><option value="">None</option><option value="weekly">Weekly</option><option value="biweekly">Bi-weekly</option><option value="monthly">Monthly</option><option value="per-session">Per Session</option></select></div>' +
          '<div class="ah2-bundle-preview" id="ah2-bundle-preview">Select condition and phase to preview scales</div>' +
        '</div>' +
        '<div class="ah2-modal-footer"><button class="ah2-btn" onclick="window._ah2SaveAssign()">Assign</button><button class="ah2-btn ah2-btn-ghost" onclick="document.getElementById(\'ah2-assign-modal\').classList.add(\'ah2-hidden\')">Cancel</button></div>' +
      '</div>' +
    '</div>';

  const scoreModalHtml =
    '<div class="ah2-modal-overlay ah2-hidden" id="ah2-score-modal">' +
      '<div class="ah2-modal-box">' +
        '<div class="ah2-modal-header"><h2>Enter Assessment Scores</h2>' +
        '<button class="ah2-modal-close" onclick="document.getElementById(\'ah2-score-modal\').classList.add(\'ah2-hidden\')">&times;</button></div>' +
        '<div class="ah2-modal-body" id="ah2-score-body"></div>' +
        '<div class="ah2-modal-footer"><button class="ah2-btn" onclick="window._ah2SaveScores()">Save &amp; Complete</button><button class="ah2-btn ah2-btn-ghost" onclick="document.getElementById(\'ah2-score-modal\').classList.add(\'ah2-hidden\')">Cancel</button></div>' +
      '</div>' +
    '</div>';

  const detailModalHtml =
    '<div class="ah2-modal-overlay ah2-hidden" id="ah2-detail-modal">' +
      '<div class="ah2-modal-box">' +
        '<div class="ah2-modal-header"><h2>Assessment Detail</h2>' +
        '<button class="ah2-modal-close" onclick="document.getElementById(\'ah2-detail-modal\').classList.add(\'ah2-hidden\')">&times;</button></div>' +
        '<div class="ah2-modal-body" id="ah2-detail-body"></div>' +
        '<div class="ah2-modal-footer"><button class="ah2-btn ah2-btn-ghost" onclick="document.getElementById(\'ah2-detail-modal\').classList.add(\'ah2-hidden\')">Close</button></div>' +
      '</div>' +
    '</div>';

  const condInfoModalHtml =
    '<div class="ah2-modal-overlay ah2-hidden" id="ah2-condinfo-modal">' +
      '<div class="ah2-modal-box" style="max-width:520px">' +
        '<div class="ah2-modal-header"><h2 id="ah2-condinfo-title">Condition</h2>' +
        '<button class="ah2-modal-close" onclick="document.getElementById(\'ah2-condinfo-modal\').classList.add(\'ah2-hidden\')">&times;</button></div>' +
        '<div class="ah2-modal-body" id="ah2-condinfo-body"></div>' +
        '<div class="ah2-modal-footer"><button class="ah2-btn ah2-btn-ghost" onclick="document.getElementById(\'ah2-condinfo-modal\').classList.add(\'ah2-hidden\')">Close</button></div>' +
      '</div>' +
    '</div>';

  const previewModalHtml =
    '<div class="ah2-modal-overlay ah2-hidden" id="ah2-preview-modal">' +
      '<div class="ah2-modal-box" style="max-width:560px">' +
        '<div class="ah2-modal-header"><h2 id="ah2-preview-title">Preview</h2>' +
        '<button class="ah2-modal-close" onclick="document.getElementById(\'ah2-preview-modal\').classList.add(\'ah2-hidden\')">&times;</button></div>' +
        '<div class="ah2-modal-body" id="ah2-preview-body"></div>' +
        '<div class="ah2-modal-footer"><button class="ah2-btn ah2-btn-ghost" onclick="document.getElementById(\'ah2-preview-modal\').classList.add(\'ah2-hidden\')">Close</button></div>' +
      '</div>' +
    '</div>';

  window._ah2CondInfo = function(condId) {
    const cond = COND_BUNDLES.find(c => c.id === condId);
    if (!cond) return;
    const hub = COND_HUB_META[condId];
    const meta = hub && hub.links && hub.links.length ? hub : { links: [] };
    const rawIds = collectAllScaleTokens(cond);
    const truth = partitionScalesByImplementationTruth(rawIds, ASSESS_REGISTRY);
    const rows = enumerateBundleScales(cond, PHASES);
    let html = '<p style="font-size:12px;color:var(--text-tertiary);margin:0 0 12px">' + _hubEscHtml(cond.id) + ' — scale list is suggestive; align with your protocol and licensing.</p>';
    html += '<h4 style="margin:0 0 8px;font-size:12.5px;font-weight:700">Scales in this bundle</h4>';
    html += '<div style="font-size:12px;line-height:1.65;margin-bottom:14px">';
    rows.forEach(({ raw, meta: sm }) => {
      html += '<div style="margin-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.06);padding-bottom:6px">';
      html += formatScaleWithImplementationBadgeHtml(raw, ASSESS_REGISTRY);
      if (sm.display_name && sm.display_name !== raw) {
        html += '<div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">' + _hubEscHtml(sm.display_name) + '</div>';
      }
      if (sm.scoring_note) {
        html += '<div style="font-size:10.5px;color:var(--text-tertiary);margin-top:4px;line-height:1.45">' + _hubEscHtml(sm.scoring_note) + '</div>';
      }
      html += '</div>';
    });
    html += '</div>';
    html += '<h4 style="margin:0 0 6px;font-size:12.5px;font-weight:700">Grouped by entry type</h4>';
    html +=
      '<p style="font-size:12px;margin:0 0 6px"><strong>In-app item lists (implemented):</strong> ' +
      _hubEscHtml(truth.implementedItemChecklist.length ? truth.implementedItemChecklist.join(', ') : '—') +
      '</p>';
    if (truth.declaredMissingForm.length) {
      html +=
        '<p style="font-size:12px;color:var(--amber);margin:0 0 6px"><strong>Checklist pending wiring (enter total manually):</strong> ' +
        _hubEscHtml(truth.declaredMissingForm.join(', ')) +
        '</p>';
    }
    html +=
      '<p style="font-size:12px;margin:0 0 6px"><strong>Numeric totals in this app:</strong> ' +
      _hubEscHtml(truth.numericEntry.length ? truth.numericEntry.join(', ') : '—') +
      '</p>';
    html +=
      '<p style="font-size:12px;margin:0 0 12px"><strong>Clinician-rated / not itemized here:</strong> ' +
      _hubEscHtml(truth.clinicianEntry.length ? truth.clinicianEntry.join(', ') : '—') +
      '</p>';
    if (truth.unknown.length) {
      html +=
        '<p style="font-size:12px;color:var(--amber);margin:0 0 12px"><strong>Unlisted abbreviations:</strong> ' +
        _hubEscHtml(truth.unknown.join(', ')) +
        ' — confirm instrument and add registry metadata if needed.</p>';
    }
    html += '<h4 style="margin:0 0 6px;font-size:12.5px;font-weight:700">Condition references (education)</h4>';
    if (meta.links && meta.links.length) {
      html += '<ul style="margin:0;padding-left:18px;font-size:12.5px;line-height:1.55">';
      meta.links.forEach(L => {
        const u = String(L.url || '').replace(/[<>"']/g, '');
        html += '<li style="margin-bottom:4px"><a href="' + u + '" target="_blank" rel="noopener noreferrer">' + _hubEscHtml(L.title) + '</a></li>';
      });
      html += '</ul>';
    } else {
      html += '<p style="font-size:12.5px;color:var(--text-tertiary)">No vetted links configured for this bundle.</p>';
    }
    html += '<p style="font-size:10.5px;color:var(--text-tertiary);margin-top:14px;line-height:1.45">Educational links only. This app does not grant rights to proprietary instruments. Follow licensing, training, and local policy. Not medical advice.</p>';
    const ti = document.getElementById('ah2-condinfo-title');
    const bd = document.getElementById('ah2-condinfo-body');
    if (ti) ti.textContent = cond.name;
    if (bd) bd.innerHTML = html;
    document.getElementById('ah2-condinfo-modal')?.classList.remove('ah2-hidden');
  };

  window._ah2Refresh = async function() {
    await hydrate();
    render();
  };

  window._ah2Export = function() {
    const rows = [['Patient', 'Condition', 'Phase', 'Scale', 'Score', 'Interpretation', 'Assigned', 'Due', 'Completed', 'Status', 'Reviewed']];
    DATA.assignments.forEach(a => {
      if (a.results && a.results.length) {
        a.results.forEach(r => {
          rows.push([
            a.patientId, a.condName, PHASE_LABELS[a.phase] || a.phase,
            r.scale, r.score, r.interp,
            a.assignedDate, a.dueDate, a.completedDate || '',
            a.status, a.reviewed ? 'Yes' : 'No',
          ]);
        });
      } else {
        a.scales.forEach(sid => {
          rows.push([
            a.patientId, a.condName, PHASE_LABELS[a.phase] || a.phase,
            sid, '', '',
            a.assignedDate, a.dueDate, '',
            a.status, 'No',
          ]);
        });
      }
    });
    const csv = rows.map(row => row.map(v => {
      const s = v == null ? '' : String(v);
      return /[,"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const ts = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = 'assessments-' + ts + '.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    window._showNotifToast?.({ title: 'Export ready', body: rows.length - 1 + ' rows exported.', severity: 'success' });
  };

  const el = document.getElementById('content');
  if (!el) return;
  el.innerHTML = '<div class="ah2-wrap" id="ah2-root"></div>' + assignModalHtml + scoreModalHtml + detailModalHtml + condInfoModalHtml + previewModalHtml;
  render();          // shows loading skeleton immediately
  await hydrate();   // fetches live data from /api/v1/assessments
  render();          // swaps in real assignments
}
