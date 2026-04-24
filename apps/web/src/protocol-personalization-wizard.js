// ---------------------------------------------------------------------------
// protocol-personalization-wizard.js -- Personalization Wizard for Protocol Builder
// Multi-step form: Patient Profile > Condition Adjustments > Device Params >
//                  Safety Overrides > Review & Explain
// ---------------------------------------------------------------------------
import {
  CONDITIONS, DEVICES, PROTOCOL_TYPES, GOVERNANCE_LABELS, EVIDENCE_GRADES,
  PROTOCOL_LIBRARY, getCondition, getDevice,
} from './protocols-data.js';
import { CONDITION_EVIDENCE, getConditionEvidence } from './evidence-dataset.js';
import {
  toPersistedPersonalizationExplainability,
  computeWizardDraftFingerprint,
} from './personalization-explainability.js';

// -- helpers -----------------------------------------------------------------
const _esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

const _deviceLabel = id => DEVICES.find(d => d.id === id)?.label || id;
const _deviceIcon  = id => DEVICES.find(d => d.id === id)?.icon  || '\u25CE';
const _condLabel   = id => CONDITIONS.find(c => c.id === id)?.label || id;

const STEP_LABELS = [
  'Patient Profile',
  'Condition Adjustments',
  'Device Parameters',
  'Safety Overrides',
  'Review & Explain',
];

// -- severity / chronicity / resistance enums --------------------------------
const SEVERITY_LEVELS  = ['mild','moderate','severe'];
const CHRONICITY_OPTS  = ['acute (<3 mo)','sub-acute (3-12 mo)','chronic (1-5 yr)','chronic (>5 yr)'];
const RESISTANCE_OPTS  = ['none','partial (1 agent)','moderate (2-3 agents)','high (4+ agents / ECT failure)'];
const AGE_RANGES       = ['18-25','26-35','36-45','46-55','56-65','66-75','75+'];
const SEX_OPTS         = ['Male','Female','Other / Prefer not to say'];
const HAND_OPTS        = ['Right','Left','Ambidextrous'];
const MED_STATUS_OPTS  = ['No current medications','Stable medication','Recent medication change (<4 wk)','Medication washout'];
const NEUROMOD_HIST    = ['None','TMS - prior course','tDCS - prior course','VNS','DBS','Neurofeedback','Other'];

const INTENSITY_LEVELS = ['conservative','standard','aggressive'];

// -- seizure risk heuristic --------------------------------------------------
function _seizureRiskLevel(draft, wiz) {
  let risk = 0;
  if (wiz.medStatus === 'Recent medication change (<4 wk)') risk += 1;
  if (wiz.resistance === 'high (4+ agents / ECT failure)') risk += 1;
  if ((draft.contraindications || []).some(c => /seizure/i.test(c))) risk += 2;
  if (draft.device === 'tms') risk += 1;
  if (wiz.severity === 'severe') risk += 1;
  if (risk >= 4) return { level:'high',   color:'#ef4444', label:'High' };
  if (risk >= 2) return { level:'medium', color:'#f59e0b', label:'Medium' };
  return { level:'low', color:'#22c55e', label:'Low' };
}

// -- medication interaction warnings -----------------------------------------
function _medInteractionWarnings(wiz, draft) {
  const warnings = [];
  if (wiz.medStatus === 'Recent medication change (<4 wk)') {
    warnings.push('Recent medication change may alter seizure threshold or treatment response. Re-evaluate after stabilization.');
  }
  if (wiz.medStatus === 'Medication washout') {
    warnings.push('Patient is in medication washout. Monitor closely for symptom exacerbation during neuromodulation course.');
  }
  if (draft.device === 'tms' && wiz.medStatus !== 'No current medications') {
    warnings.push('TMS with concurrent medications: verify no drugs that significantly lower seizure threshold (e.g., clozapine, bupropion at high dose, theophylline).');
  }
  if (draft.device === 'tavns') {
    warnings.push('taVNS: confirm no concurrent cardiac medications that affect vagal tone (e.g., beta-blockers at high dose).');
  }
  return warnings;
}

// -- explainability reasons --------------------------------------------------
function _buildExplainabilityReasons(wiz, draft) {
  const reasons = [];
  // Patient profile
  if (wiz.ageRange) {
    const ageNum = parseInt(wiz.ageRange, 10);
    if (ageNum >= 66) reasons.push({ param: 'Intensity', reason: `Age ${wiz.ageRange}: conservative intensity recommended for older adults due to cortical atrophy and lower motor threshold.` });
    if (ageNum <= 25) reasons.push({ param: 'Monitoring', reason: `Age ${wiz.ageRange}: younger adults may show faster response trajectory; consider early assessment at session 5.` });
  }
  // Severity
  if (wiz.severity === 'severe') {
    reasons.push({ param: 'Session count', reason: 'Severe presentation: extended course (additional 10-20% sessions) recommended per meta-analytic data.' });
    reasons.push({ param: 'Monitoring frequency', reason: 'Severe case: weekly outcome monitoring with validated scales recommended.' });
  }
  if (wiz.severity === 'mild') {
    reasons.push({ param: 'Intensity', reason: 'Mild severity: standard intensity sufficient; aggressive parameters unlikely to yield additional benefit.' });
  }
  // Chronicity
  if (wiz.chronicity === 'chronic (>5 yr)') {
    reasons.push({ param: 'Course duration', reason: 'Chronic condition (>5 yr): consider extended treatment course and maintenance sessions. Response may be slower.' });
  }
  // Resistance
  if (wiz.resistance === 'high (4+ agents / ECT failure)') {
    reasons.push({ param: 'Protocol selection', reason: 'High treatment resistance: consider accelerated protocols (e.g., SAINT/iTBS) or multimodal combination.' });
    reasons.push({ param: 'Expectations', reason: 'Treatment-resistant profile: realistic response expectations ~30-40% based on TRD literature.' });
  }
  // Device intensity
  if (wiz.intensityLevel === 'aggressive') {
    reasons.push({ param: 'Intensity', reason: 'Aggressive parameters selected. Ensure adequate monitoring and seizure precautions per institutional protocol.' });
  }
  if (wiz.intensityLevel === 'conservative') {
    reasons.push({ param: 'Intensity', reason: 'Conservative parameters selected. Suitable for treatment-naive patients or those with risk factors.' });
  }
  // Comorbidities
  if (wiz.comorbidities?.length) {
    reasons.push({ param: 'Comorbidities', reason: `${wiz.comorbidities.length} comorbid condition(s) noted: ${wiz.comorbidities.map(_condLabel).join(', ')}. Protocol may need cross-condition optimization.` });
  }
  // Handedness for TMS
  if (draft.device === 'tms' && wiz.handedness === 'Left') {
    reasons.push({ param: 'Target laterality', reason: 'Left-handed patient: motor threshold determination and coil placement may require adjustment. Consider neuronavigation.' });
  }
  // Prior neuromodulation
  if (wiz.priorNeuromod?.length && !wiz.priorNeuromod.includes('None')) {
    reasons.push({ param: 'Prior treatment', reason: `Prior neuromodulation history: ${wiz.priorNeuromod.join(', ')}. Adjust expectations and consider alternative targets if prior course was ineffective.` });
  }
  // Evidence backing
  const ev = getConditionEvidence(draft.conditionId);
  if (ev) {
    reasons.push({ param: 'Evidence basis', reason: `${ev.paperCount.toLocaleString()} indexed papers for ${_condLabel(draft.conditionId)}; ${ev.rctCount} RCTs, ${ev.metaAnalysisCount} meta-analyses support parameter selection.` });
  }
  return reasons;
}

// -- intensity multiplier ----------------------------------------------------
function _intensityMultiplier(level) {
  if (level === 'conservative') return 0.85;
  if (level === 'aggressive') return 1.15;
  return 1.0;
}

// -- contraindication master list by device ----------------------------------
const CONTRAINDICATION_CHECKLISTS = {
  tms: [
    'Metal implants in skull (plates, clips, coils)',
    'Cochlear implants',
    'Cardiac pacemaker / defibrillator',
    'Active seizure disorder or history of seizures',
    'Pregnancy or planning pregnancy',
    'Intracranial pressure elevation',
    'Unstable medical condition',
    'Implanted medication pump',
  ],
  tdcs: [
    'Implanted electronic devices',
    'Skull defects or craniotomy',
    'Skin breakdown at electrode sites',
    'Pregnancy',
    'Active dermatological condition at site',
  ],
  tacs: [
    'Implanted electronic devices',
    'Cardiac pacemaker',
    'Epilepsy (relative)',
    'Pregnancy',
  ],
  ces: [
    'Cardiac pacemaker',
    'Implanted electrodes near treatment site',
  ],
  tavns: [
    'Bilateral vagotomy',
    'Active ear infection or lesion',
    'Severe cardiac arrhythmia',
    'Implanted cardiac devices',
  ],
  pbm: [
    'Active hemorrhage at treatment site',
    'Malignancy at treatment site',
    'Photosensitizing medications',
    'Retinal conditions (for transcranial)',
  ],
  pemf: [
    'Cardiac pacemaker',
    'Implanted electronic devices',
    'Pregnancy',
    'Active bleeding disorders',
  ],
  nf: [
    'Active psychosis (relative)',
    'Severe dissociative disorders',
  ],
  tps: [
    'Cardiac pacemaker',
    'Metal skull implants',
  ],
  tus: [
    'Metal skull implants',
    'Skull defects',
  ],
  dbs: [
    'Active infection',
    'Coagulopathy',
    'Inability to undergo surgery',
  ],
  vns: [
    'Bilateral vagotomy',
    'Cardiac conduction disorders',
  ],
  other: [],
};

// ============================================================================
// renderPersonalizationWizard(protocolDraft, patientContext)
// Returns HTML string for the modal overlay.
// ============================================================================
export function renderPersonalizationWizard(protocolDraft, patientContext) {
  // Initialize wizard state on window for cross-call persistence
  if (!window._pwizState) {
    window._pwizState = {
      step: 0,
      // Step 1 — Patient Profile
      ageRange: patientContext?.ageRange || '',
      sex: patientContext?.sex || '',
      handedness: patientContext?.handedness || '',
      medStatus: patientContext?.medStatus || '',
      priorNeuromod: patientContext?.priorNeuromod || [],
      // Step 2 — Condition Adjustments
      severity: 'moderate',
      chronicity: '',
      comorbidities: [],
      resistance: 'none',
      // Step 3 — Device Parameters
      intensityLevel: 'standard',
      sessionDurationOverride: '',
      frequencyOverride: '',
      targetSiteRefinement: '',
      // Step 4 — Safety
      contraChecked: {},
      customContraNotes: '',
      // Meta
      draft: protocolDraft,
    };
  }
  const wiz = window._pwizState;
  wiz.draft = protocolDraft;  // refresh reference

  const cond = getCondition(protocolDraft.conditionId);
  const dev  = getDevice(protocolDraft.device);

  const _stepNav = () => {
    return `<div class="pwiz-steps">
      ${STEP_LABELS.map((lbl, i) => `
        <div class="pwiz-step-dot${wiz.step === i ? ' pwiz-step-active' : ''}${wiz.step > i ? ' pwiz-step-done' : ''}"
             onclick="window._pwizGoStep(${i})" title="${_esc(lbl)}">
          <span class="pwiz-step-num">${wiz.step > i ? '\u2713' : i + 1}</span>
          <span class="pwiz-step-lbl">${_esc(lbl)}</span>
        </div>
        ${i < STEP_LABELS.length - 1 ? '<div class="pwiz-step-line' + (wiz.step > i ? ' pwiz-step-line-done' : '') + '"></div>' : ''}
      `).join('')}
    </div>`;
  };

  // -- Step 1: Patient Profile -----------------------------------------------
  const _step1 = () => `
    <div class="pwiz-section">
      <div class="pwiz-section-title">Patient Profile</div>
      <p class="pwiz-hint">Demographics and history inform safe parameter boundaries and expected response trajectories.</p>

      <div class="pwiz-field-grid">
        <div>
          <label class="prot-b-lbl">Age Range</label>
          <select class="prot-b-input" onchange="window._pwizSet('ageRange',this.value)">
            <option value="">Select...</option>
            ${AGE_RANGES.map(a => `<option value="${a}"${wiz.ageRange===a?' selected':''}>${a}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="prot-b-lbl">Sex</label>
          <select class="prot-b-input" onchange="window._pwizSet('sex',this.value)">
            <option value="">Select...</option>
            ${SEX_OPTS.map(s => `<option value="${s}"${wiz.sex===s?' selected':''}>${s}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="prot-b-lbl">Handedness</label>
          <select class="prot-b-input" onchange="window._pwizSet('handedness',this.value)">
            <option value="">Select...</option>
            ${HAND_OPTS.map(h => `<option value="${h}"${wiz.handedness===h?' selected':''}>${h}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="prot-b-lbl">Medication Status</label>
          <select class="prot-b-input" onchange="window._pwizSet('medStatus',this.value)">
            <option value="">Select...</option>
            ${MED_STATUS_OPTS.map(m => `<option value="${_esc(m)}"${wiz.medStatus===m?' selected':''}>${_esc(m)}</option>`).join('')}
          </select>
        </div>
      </div>

      <label class="prot-b-lbl" style="margin-top:14px">Prior Neuromodulation History</label>
      <div class="pwiz-check-grid">
        ${NEUROMOD_HIST.map(n => `
          <label class="pwiz-check-item">
            <input type="checkbox" ${wiz.priorNeuromod.includes(n)?'checked':''} onchange="window._pwizToggleNeuromod('${_esc(n)}')">
            <span>${_esc(n)}</span>
          </label>
        `).join('')}
      </div>
    </div>`;

  // -- Step 2: Condition-Specific Adjustments ---------------------------------
  const _step2 = () => {
    // Comorbidity options: exclude the primary condition itself
    const comorbOpts = CONDITIONS.filter(c => c.id !== protocolDraft.conditionId);
    return `
    <div class="pwiz-section">
      <div class="pwiz-section-title">Condition-Specific Adjustments</div>
      <p class="pwiz-hint">For <strong>${_esc(cond?.label || protocolDraft.conditionId)}</strong> (${_esc(cond?.icd10 || '')})</p>

      <label class="prot-b-lbl">Severity</label>
      <div class="pwiz-radio-row">
        ${SEVERITY_LEVELS.map(s => `
          <label class="pwiz-radio-item${wiz.severity===s?' pwiz-radio-active':''}">
            <input type="radio" name="pwiz-severity" value="${s}" ${wiz.severity===s?'checked':''} onchange="window._pwizSet('severity',this.value)">
            <span class="pwiz-severity-dot pwiz-sev-${s}"></span>
            <span>${s.charAt(0).toUpperCase()+s.slice(1)}</span>
          </label>
        `).join('')}
      </div>

      <label class="prot-b-lbl">Chronicity</label>
      <select class="prot-b-input" onchange="window._pwizSet('chronicity',this.value)">
        <option value="">Select...</option>
        ${CHRONICITY_OPTS.map(c => `<option value="${_esc(c)}"${wiz.chronicity===c?' selected':''}>${_esc(c)}</option>`).join('')}
      </select>

      <label class="prot-b-lbl">Treatment Resistance Level</label>
      <select class="prot-b-input" onchange="window._pwizSet('resistance',this.value)">
        ${RESISTANCE_OPTS.map(r => `<option value="${_esc(r)}"${wiz.resistance===r?' selected':''}>${_esc(r)}</option>`).join('')}
      </select>

      <label class="prot-b-lbl" style="margin-top:14px">Comorbidities</label>
      <p class="pwiz-hint">Select any co-occurring conditions that may affect protocol parameters.</p>
      <div class="pwiz-comorb-list">
        ${comorbOpts.map(c => `
          <label class="pwiz-check-item pwiz-comorb-check${wiz.comorbidities.includes(c.id)?' pwiz-comorb-selected':''}">
            <input type="checkbox" ${wiz.comorbidities.includes(c.id)?'checked':''} onchange="window._pwizToggleComorb('${_esc(c.id)}')">
            <span>${_esc(c.shortLabel || c.label)}</span>
          </label>
        `).join('')}
      </div>
    </div>`;
  };

  // -- Step 3: Device Parameters ---------------------------------------------
  const _step3 = () => {
    const devParams = protocolDraft.parameters || {};
    const mult = _intensityMultiplier(wiz.intensityLevel);
    const subtypes = (dev?.subtypes || []);

    // Compute adjusted parameter previews
    const adjFreq = wiz.frequencyOverride
      ? parseFloat(wiz.frequencyOverride)
      : devParams.frequency_hz;
    const adjDuration = wiz.sessionDurationOverride
      ? parseFloat(wiz.sessionDurationOverride)
      : devParams.session_duration_min;

    // Intensity display varies by device
    let intensityDisplay = '';
    if (devParams.intensity_pct_rmt) {
      const adj = Math.round(devParams.intensity_pct_rmt * mult);
      intensityDisplay = `${adj}% RMT`;
    } else if (devParams.current_ma) {
      const adj = (devParams.current_ma * mult).toFixed(2);
      intensityDisplay = `${adj} mA`;
    } else if (devParams.current_ua) {
      const adj = Math.round(devParams.current_ua * mult);
      intensityDisplay = `${adj} \u00B5A`;
    }

    return `
    <div class="pwiz-section">
      <div class="pwiz-section-title">Device Parameters &mdash; ${_esc(dev?.icon || '')} ${_esc(dev?.label || protocolDraft.device)}</div>
      <p class="pwiz-hint">Adjust stimulation parameters based on patient profile and clinical judgment.</p>

      <label class="prot-b-lbl">Intensity Level</label>
      <div class="pwiz-radio-row">
        ${INTENSITY_LEVELS.map(l => `
          <label class="pwiz-radio-item${wiz.intensityLevel===l?' pwiz-radio-active':''}">
            <input type="radio" name="pwiz-intensity" value="${l}" ${wiz.intensityLevel===l?'checked':''} onchange="window._pwizSet('intensityLevel',this.value)">
            <span class="pwiz-intensity-dot pwiz-int-${l}"></span>
            <span>${l.charAt(0).toUpperCase()+l.slice(1)}</span>
          </label>
        `).join('')}
      </div>
      ${intensityDisplay ? `<div class="pwiz-param-preview">Adjusted intensity: <strong>${_esc(intensityDisplay)}</strong> (${wiz.intensityLevel} &times; ${mult.toFixed(2)})</div>` : ''}

      <div class="pwiz-field-grid" style="margin-top:14px">
        <div>
          <label class="prot-b-lbl">Session Duration Override (min)</label>
          <input class="prot-b-input" type="number" placeholder="${devParams.session_duration_min || 'N/A'}"
                 value="${_esc(wiz.sessionDurationOverride)}"
                 oninput="window._pwizSet('sessionDurationOverride',this.value)">
          <span class="pwiz-field-hint">Default: ${devParams.session_duration_min || 'N/A'} min</span>
        </div>
        <div>
          <label class="prot-b-lbl">Frequency Override (Hz)</label>
          <input class="prot-b-input" type="number" step="0.1" placeholder="${devParams.frequency_hz || 'N/A'}"
                 value="${_esc(wiz.frequencyOverride)}"
                 oninput="window._pwizSet('frequencyOverride',this.value)">
          <span class="pwiz-field-hint">Default: ${devParams.frequency_hz || 'N/A'} Hz</span>
        </div>
      </div>

      <label class="prot-b-lbl" style="margin-top:14px">Target Site Refinement</label>
      <input class="prot-b-input" type="text"
             placeholder="${_esc(protocolDraft.target || 'Enter refined target...')}"
             value="${_esc(wiz.targetSiteRefinement)}"
             oninput="window._pwizSet('targetSiteRefinement',this.value)">
      <span class="pwiz-field-hint">Original target: ${_esc(protocolDraft.target || 'Not specified')}</span>

      ${subtypes.length ? `
      <label class="prot-b-lbl" style="margin-top:14px">Available Subtypes</label>
      <div class="pwiz-subtype-chips">
        ${subtypes.map(s => `<span class="pwiz-subtype-chip${protocolDraft.subtype===s?' pwiz-subtype-active':''}">${_esc(s)}</span>`).join('')}
      </div>` : ''}

      <div class="pwiz-param-summary" style="margin-top:16px">
        <div class="pwiz-section-title" style="margin-bottom:8px">Adjusted Parameter Preview</div>
        <table class="prot-param-table">
          <tbody>
            ${adjFreq != null ? `<tr><td class="prot-param-lbl">Frequency</td><td class="prot-param-val">${adjFreq} Hz${wiz.frequencyOverride ? ' (overridden)' : ''}</td></tr>` : ''}
            ${intensityDisplay ? `<tr><td class="prot-param-lbl">Intensity</td><td class="prot-param-val">${_esc(intensityDisplay)}</td></tr>` : ''}
            ${adjDuration != null ? `<tr><td class="prot-param-lbl">Session Duration</td><td class="prot-param-val">${adjDuration} min${wiz.sessionDurationOverride ? ' (overridden)' : ''}</td></tr>` : ''}
            ${devParams.sessions_total ? `<tr><td class="prot-param-lbl">Total Sessions</td><td class="prot-param-val">${devParams.sessions_total}${wiz.severity==='severe'?' (+20% recommended)':''}</td></tr>` : ''}
            ${devParams.sessions_per_week ? `<tr><td class="prot-param-lbl">Sessions / Week</td><td class="prot-param-val">${devParams.sessions_per_week}</td></tr>` : ''}
            ${wiz.targetSiteRefinement ? `<tr><td class="prot-param-lbl">Refined Target</td><td class="prot-param-val">${_esc(wiz.targetSiteRefinement)}</td></tr>` : ''}
          </tbody>
        </table>
      </div>
    </div>`;
  };

  // -- Step 4: Safety Overrides -----------------------------------------------
  const _step4 = () => {
    const deviceKey = protocolDraft.device || 'other';
    const checklist = CONTRAINDICATION_CHECKLISTS[deviceKey] || CONTRAINDICATION_CHECKLISTS.other;
    const seizureRisk = _seizureRiskLevel(protocolDraft, wiz);
    const medWarnings = _medInteractionWarnings(wiz, protocolDraft);
    const flagged = Object.entries(wiz.contraChecked).filter(([,v]) => v).map(([k]) => k);

    return `
    <div class="pwiz-section">
      <div class="pwiz-section-title">Safety Overrides</div>
      <p class="pwiz-hint">Complete the contraindication checklist and review automated safety flags.</p>

      <div class="pwiz-safety-banner pwiz-risk-${seizureRisk.level}">
        <span class="pwiz-risk-icon">${seizureRisk.level === 'high' ? '\u26A0' : seizureRisk.level === 'medium' ? '\u26A0' : '\u2713'}</span>
        <div>
          <strong>Seizure Risk Assessment: ${_esc(seizureRisk.label)}</strong>
          <div class="pwiz-risk-detail">Based on device type, medications, severity, and contraindication profile.</div>
        </div>
      </div>

      ${medWarnings.length ? `
      <div class="pwiz-warnings-box">
        <div class="pwiz-warnings-title">\u26A0 Medication Interaction Warnings</div>
        <ul class="pwiz-warnings-list">
          ${medWarnings.map(w => `<li>${_esc(w)}</li>`).join('')}
        </ul>
      </div>` : ''}

      <label class="prot-b-lbl" style="margin-top:14px">Contraindication Checklist &mdash; ${_esc(_deviceLabel(deviceKey))}</label>
      <p class="pwiz-hint">Check any that apply to this patient. Flagged items will be highlighted in the review.</p>
      <div class="pwiz-contra-list">
        ${checklist.map((item, i) => {
          const key = `contra-${i}`;
          const checked = !!wiz.contraChecked[key];
          return `
          <label class="pwiz-contra-item${checked?' pwiz-contra-flagged':''}">
            <input type="checkbox" ${checked?'checked':''} onchange="window._pwizToggleContra('${key}')">
            <span>${_esc(item)}</span>
            ${checked ? '<span class="pwiz-contra-flag">\u26A0 FLAGGED</span>' : ''}
          </label>`;
        }).join('')}
      </div>

      ${flagged.length ? `
      <div class="pwiz-contra-alert">
        <strong>\u26D4 ${flagged.length} contraindication(s) flagged.</strong> This patient may not be eligible for ${_esc(_deviceLabel(deviceKey))}. Review with supervising clinician before proceeding.
      </div>` : ''}

      <label class="prot-b-lbl" style="margin-top:14px">Additional Safety Notes</label>
      <textarea class="prot-b-textarea" placeholder="Enter any additional safety considerations..."
                oninput="window._pwizSet('customContraNotes',this.value)">${_esc(wiz.customContraNotes)}</textarea>
    </div>`;
  };

  // -- Step 5: Review & Explain -----------------------------------------------
  const _step5 = () => {
    const reasons = _buildExplainabilityReasons(wiz, protocolDraft);
    const seizureRisk = _seizureRiskLevel(protocolDraft, wiz);
    const flaggedCount = Object.values(wiz.contraChecked).filter(Boolean).length;
    const mult = _intensityMultiplier(wiz.intensityLevel);
    const ev = getConditionEvidence(protocolDraft.conditionId);

    // Build personalization snapshot for persistence
    const draftFingerprint = computeWizardDraftFingerprint({
      conditionSlug: protocolDraft.conditionId,
      deviceSlug: protocolDraft.device,
      targetRegion: wiz.targetSiteRefinement || protocolDraft.target,
      frequencyHz: wiz.frequencyOverride || protocolDraft.parameters?.frequency_hz,
      intensityPct: protocolDraft.parameters?.intensity_pct_rmt ? Math.round(protocolDraft.parameters.intensity_pct_rmt * mult) : '',
      sessionsPerWeek: protocolDraft.parameters?.sessions_per_week,
      totalSessions: protocolDraft.parameters?.sessions_total,
      sessionDurationMin: wiz.sessionDurationOverride || protocolDraft.parameters?.session_duration_min,
    });

    return `
    <div class="pwiz-section">
      <div class="pwiz-section-title">Review & Explain</div>
      <p class="pwiz-hint">Summary of all personalization choices with evidence-backed explanations.</p>

      <div class="pwiz-review-grid">
        <div class="pwiz-review-card">
          <div class="pwiz-review-card-title">Patient Profile</div>
          <div class="pwiz-review-row"><span>Age:</span><span>${_esc(wiz.ageRange || 'Not set')}</span></div>
          <div class="pwiz-review-row"><span>Sex:</span><span>${_esc(wiz.sex || 'Not set')}</span></div>
          <div class="pwiz-review-row"><span>Handedness:</span><span>${_esc(wiz.handedness || 'Not set')}</span></div>
          <div class="pwiz-review-row"><span>Medication:</span><span>${_esc(wiz.medStatus || 'Not set')}</span></div>
          <div class="pwiz-review-row"><span>Prior neuromod:</span><span>${wiz.priorNeuromod.length ? _esc(wiz.priorNeuromod.join(', ')) : 'None'}</span></div>
        </div>

        <div class="pwiz-review-card">
          <div class="pwiz-review-card-title">Condition Adjustments</div>
          <div class="pwiz-review-row"><span>Condition:</span><span>${_esc(_condLabel(protocolDraft.conditionId))}</span></div>
          <div class="pwiz-review-row"><span>Severity:</span><span class="pwiz-sev-badge pwiz-sev-${wiz.severity}">${_esc(wiz.severity || 'moderate')}</span></div>
          <div class="pwiz-review-row"><span>Chronicity:</span><span>${_esc(wiz.chronicity || 'Not set')}</span></div>
          <div class="pwiz-review-row"><span>Resistance:</span><span>${_esc(wiz.resistance)}</span></div>
          <div class="pwiz-review-row"><span>Comorbidities:</span><span>${wiz.comorbidities.length ? _esc(wiz.comorbidities.map(_condLabel).join(', ')) : 'None'}</span></div>
        </div>

        <div class="pwiz-review-card">
          <div class="pwiz-review-card-title">Device Parameters</div>
          <div class="pwiz-review-row"><span>Device:</span><span>${_esc(_deviceIcon(protocolDraft.device))} ${_esc(_deviceLabel(protocolDraft.device))}</span></div>
          <div class="pwiz-review-row"><span>Intensity:</span><span>${_esc(wiz.intensityLevel)} (&times;${mult.toFixed(2)})</span></div>
          <div class="pwiz-review-row"><span>Duration:</span><span>${_esc(wiz.sessionDurationOverride || String(protocolDraft.parameters?.session_duration_min || 'N/A'))} min</span></div>
          <div class="pwiz-review-row"><span>Frequency:</span><span>${_esc(wiz.frequencyOverride || String(protocolDraft.parameters?.frequency_hz || 'N/A'))} Hz</span></div>
          <div class="pwiz-review-row"><span>Target:</span><span>${_esc(wiz.targetSiteRefinement || protocolDraft.target || 'N/A')}</span></div>
        </div>

        <div class="pwiz-review-card">
          <div class="pwiz-review-card-title">Safety Summary</div>
          <div class="pwiz-review-row"><span>Seizure risk:</span><span style="color:${seizureRisk.color};font-weight:600">${_esc(seizureRisk.label)}</span></div>
          <div class="pwiz-review-row"><span>Contraindications flagged:</span><span style="${flaggedCount ? 'color:#ef4444;font-weight:600' : ''}">${flaggedCount}</span></div>
          ${wiz.customContraNotes ? `<div class="pwiz-review-row"><span>Notes:</span><span>${_esc(wiz.customContraNotes)}</span></div>` : ''}
        </div>
      </div>

      <div class="pwiz-explain-panel">
        <div class="pwiz-explain-title">Explainability Panel</div>
        <p class="pwiz-explain-subtitle">Why each adjustment was made &mdash; evidence-backed reasoning</p>
        ${ev ? `<div class="pwiz-evidence-strip">
          <span class="pwiz-ev-chip">${ev.paperCount.toLocaleString()} papers</span>
          <span class="pwiz-ev-chip">${ev.rctCount} RCTs</span>
          <span class="pwiz-ev-chip">${ev.metaAnalysisCount} meta-analyses</span>
          <span class="pwiz-ev-chip">${ev.trialCount} trials</span>
        </div>` : ''}
        <div class="pwiz-reasons-list">
          ${reasons.length ? reasons.map(r => `
            <div class="pwiz-reason-item">
              <span class="pwiz-reason-param">${_esc(r.param)}</span>
              <span class="pwiz-reason-text">${_esc(r.reason)}</span>
            </div>
          `).join('') : '<div class="pwiz-hint">No specific adjustments detected. Using standard protocol parameters.</div>'}
        </div>
      </div>

      <div class="pwiz-fingerprint" title="Draft fingerprint for explainability persistence">
        <span style="font-family:var(--font-mono,monospace);font-size:10px;color:var(--text-tertiary,#64748b);word-break:break-all">
          Fingerprint: ${_esc(draftFingerprint.slice(0, 60))}${draftFingerprint.length > 60 ? '...' : ''}
        </span>
      </div>
    </div>`;
  };

  // -- Assemble modal --------------------------------------------------------
  const stepContent = [_step1, _step2, _step3, _step4, _step5][wiz.step]();

  return `
    <div class="pwiz-overlay" id="pwiz-overlay" onclick="if(event.target===this)window._pwizClose()">
      <div class="pwiz-modal" onclick="event.stopPropagation()">
        <div class="pwiz-modal-header">
          <div class="pwiz-modal-title">
            <span class="pwiz-modal-icon">\u2699</span>
            Personalization Wizard
            <span class="pwiz-proto-name">&mdash; ${_esc(protocolDraft.name || 'Protocol')}</span>
          </div>
          <button class="pwiz-close-btn" onclick="window._pwizClose()" title="Close">&times;</button>
        </div>
        ${_stepNav()}
        <div class="pwiz-body">
          ${stepContent}
        </div>
        <div class="pwiz-footer">
          <div class="pwiz-footer-left">
            ${wiz.step > 0 ? `<button class="prot-back-btn" onclick="window._pwizPrev()">\u2190 Back</button>` : ''}
          </div>
          <div class="pwiz-footer-right">
            ${wiz.step < 4
              ? `<button class="prot-detail-use-btn" onclick="window._pwizNext()">Next \u2192</button>`
              : `<button class="prot-detail-use-btn pwiz-apply-btn" onclick="window._pwizApply()">Apply Personalization</button>`
            }
          </div>
        </div>
      </div>
    </div>`;
}

// ============================================================================
// bindPersonalizationActions() — attach window handlers
// ============================================================================
export function bindPersonalizationActions() {
  // Navigation
  window._pwizGoStep = (step) => {
    if (!window._pwizState) return;
    window._pwizState.step = Math.max(0, Math.min(4, step));
    _rerender();
  };
  window._pwizNext = () => {
    if (!window._pwizState) return;
    window._pwizState.step = Math.min(4, window._pwizState.step + 1);
    _rerender();
  };
  window._pwizPrev = () => {
    if (!window._pwizState) return;
    window._pwizState.step = Math.max(0, window._pwizState.step - 1);
    _rerender();
  };

  // Field setter
  window._pwizSet = (key, val) => {
    if (!window._pwizState) return;
    window._pwizState[key] = val;
    _rerender();
  };

  // Toggle arrays
  window._pwizToggleNeuromod = (val) => {
    if (!window._pwizState) return;
    const arr = window._pwizState.priorNeuromod;
    if (arr.includes(val)) window._pwizState.priorNeuromod = arr.filter(x => x !== val);
    else window._pwizState.priorNeuromod = [...arr, val];
    _rerender();
  };

  window._pwizToggleComorb = (val) => {
    if (!window._pwizState) return;
    const arr = window._pwizState.comorbidities;
    if (arr.includes(val)) window._pwizState.comorbidities = arr.filter(x => x !== val);
    else window._pwizState.comorbidities = [...arr, val];
    _rerender();
  };

  window._pwizToggleContra = (key) => {
    if (!window._pwizState) return;
    window._pwizState.contraChecked[key] = !window._pwizState.contraChecked[key];
    _rerender();
  };

  // Close
  window._pwizClose = () => {
    const overlay = document.getElementById('pwiz-overlay');
    if (overlay) overlay.remove();
    window._pwizState = null;
  };

  // Apply — merge personalization into protocol and close
  window._pwizApply = () => {
    const wiz = window._pwizState;
    if (!wiz) return;
    const draft = wiz.draft;
    const mult = _intensityMultiplier(wiz.intensityLevel);

    // Build a personalization record to be consumed by the builder / course
    const personalization = {
      patient: {
        ageRange: wiz.ageRange,
        sex: wiz.sex,
        handedness: wiz.handedness,
        medStatus: wiz.medStatus,
        priorNeuromod: [...wiz.priorNeuromod],
      },
      condition: {
        severity: wiz.severity,
        chronicity: wiz.chronicity,
        comorbidities: [...wiz.comorbidities],
        resistance: wiz.resistance,
      },
      device: {
        intensityLevel: wiz.intensityLevel,
        intensityMultiplier: mult,
        sessionDurationOverride: wiz.sessionDurationOverride ? parseFloat(wiz.sessionDurationOverride) : null,
        frequencyOverride: wiz.frequencyOverride ? parseFloat(wiz.frequencyOverride) : null,
        targetSiteRefinement: wiz.targetSiteRefinement || null,
      },
      safety: {
        contraindications: Object.entries(wiz.contraChecked).filter(([,v]) => v).map(([k]) => k),
        seizureRisk: _seizureRiskLevel(draft, wiz),
        medWarnings: _medInteractionWarnings(wiz, draft),
        customNotes: wiz.customContraNotes,
      },
      explainability: _buildExplainabilityReasons(wiz, draft),
      appliedAt: new Date().toISOString(),
    };

    // Stash on window so the protocol builder can read it
    window._protocolPersonalization = personalization;

    // Fire toast
    window._showNotifToast?.({
      title: 'Personalization Applied',
      body: `${_buildExplainabilityReasons(wiz, draft).length} adjustments applied to "${draft.name || 'protocol'}".`,
      severity: 'success',
    });

    // Cleanup
    const overlay = document.getElementById('pwiz-overlay');
    if (overlay) overlay.remove();
    window._pwizState = null;
  };
}

// -- internal rerender -------------------------------------------------------
function _rerender() {
  const wiz = window._pwizState;
  if (!wiz || !wiz.draft) return;
  const overlay = document.getElementById('pwiz-overlay');
  if (!overlay) return;
  // Re-generate and replace the overlay content
  const tmp = document.createElement('div');
  tmp.innerHTML = renderPersonalizationWizard(wiz.draft, null);
  const newOverlay = tmp.firstElementChild;
  overlay.replaceWith(newOverlay);
}
