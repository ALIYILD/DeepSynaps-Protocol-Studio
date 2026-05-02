// ─────────────────────────────────────────────────────────────────────────────
// video-assessment-protocol.js — MVP task library + session factory
// Video Assessments for Virtual Care (guided capture + clinician review).
// Not a diagnostic engine; structured observation capture for remote review.
// ─────────────────────────────────────────────────────────────────────────────

/** @typedef {'tremor'|'upper_limb'|'lower_limb'|'balance_gait'|'coordination'|'face_speech'} TaskGroup */

/**
 * @typedef {Object} VideoAssessmentTaskDef
 * @property {string} task_id
 * @property {string} task_name
 * @property {TaskGroup} task_group
 * @property {number} task_order
 * @property {string} clinical_purpose
 * @property {string} patient_instructions
 * @property {string} camera_setup
 * @property {number} duration_seconds
 * @property {'low'|'moderate'|'high'} safety_level
 * @property {string} safety_warning
 * @property {string|null} demo_asset
 * @property {Record<string, unknown>} structured_clinician_fields
 * @property {string} future_automation_notes
 * @property {Object} script
 * @property {string} script.title
 * @property {string} script.what_this_checks
 * @property {string} script.how_to_do
 * @property {string} script.camera_position
 * @property {string} script.safety
 * @property {string} script.voice_prompt
 * @property {string[]} script.success_checklist
 */

const BASE_REVIEW_KEYS = [
  'video_quality',
  'patient_compliance',
  'task_completed',
  'repeat_needed',
  'free_text_comment',
];

function tremorScores() {
  return {
    tremor_present: ['yes', 'no'],
    tremor_severity: ['none', 'slight', 'mild', 'moderate', 'severe'],
    side_predominance: ['left', 'right', 'bilateral', 'none'],
  };
}

function limbKineticScores(side) {
  const L = side === 'left' ? 'left' : 'right';
  return {
    ['bradykinesia_severity_' + L]: ['none', 'mild', 'moderate', 'severe'],
    ['amplitude_decrement_' + L]: ['yes', 'no'],
    interruptions_present: ['yes', 'no'],
  };
}

/** @type {VideoAssessmentTaskDef[]} */
export const VIDEO_ASSESSMENT_TASKS = [
  {
    task_id: 'rest_tremor',
    task_name: 'Rest Tremor',
    task_group: 'tremor',
    task_order: 1,
    clinical_purpose: 'Observes tremor at rest, which can reflect Parkinsonism and related disorders when present.',
    patient_instructions: 'Sit comfortably with hands resting in your lap or on the chair arms. Stay as relaxed and still as you can for the full recording.',
    camera_setup: 'Frame from the waist up so both hands and your face are visible. Light should come from in front of you, not behind.',
    duration_seconds: 15,
    safety_level: 'low',
    safety_warning: 'If you feel dizzy or unwell, stop and skip this task.',
    demo_asset: null,
    structured_clinician_fields: { ...tremorScores(), tremor_context: ['rest', 'not_applicable'] },
    future_automation_notes: 'Rest tremor band power (e.g. 4–6 Hz), displacement amplitude, laterality index.',
    script: {
      title: 'Rest tremor',
      what_this_checks: 'Whether your hands or fingers shake when you are relaxed and not trying to move on purpose.',
      how_to_do: 'Sit comfortably. Rest your hands in your lap or on the chair arms. When the timer starts, stay relaxed and as still as you can.',
      camera_position: 'Sit about arm\'s length from the camera. Waist-up view with both hands clearly visible.',
      safety: 'If you feel faint, in pain, or unsafe, stop moving and skip this task.',
      voice_prompt: 'Sit comfortably. Rest your hands in your lap. When you hear the beep, stay relaxed and still for fifteen seconds. Do not try to hold your hands stiff—just rest naturally.',
      success_checklist: ['Waist-up framing', 'Both hands visible', 'Face lit from the front', 'Quiet background if possible'],
    },
  },
  {
    task_id: 'postural_tremor',
    task_name: 'Postural Tremor',
    task_group: 'tremor',
    task_order: 2,
    clinical_purpose: 'Observes tremor when maintaining posture, helping distinguish essential tremor patterns from rest tremor in context.',
    patient_instructions: 'Hold both arms straight out in front of you at shoulder height with elbows extended for the full recording.',
    camera_setup: 'Step back until your upper body and full arms are in frame. Side lighting can help show hand position.',
    duration_seconds: 15,
    safety_level: 'moderate',
    safety_warning: 'If your shoulders hurt, you feel off-balance, or you cannot hold the posture safely, skip this task.',
    demo_asset: null,
    structured_clinician_fields: { ...tremorScores(), tremor_context: ['postural', 'not_applicable'] },
    future_automation_notes: 'Postural hold tremor envelope, frequency peak, drift / fatigue slope.',
    script: {
      title: 'Postural tremor',
      what_this_checks: 'Whether your arms or hands shake when you hold them up against gravity.',
      how_to_do: 'Raise both arms straight in front of you to shoulder height. Keep elbows straight and hold steady until the timer ends.',
      camera_position: 'Step back so head, torso, and arms fit in the frame. Hands should be visible at shoulder height.',
      safety: 'Use a sturdy chair behind you for balance. If you cannot hold your arms up safely, skip.',
      voice_prompt: 'Stand or sit with space in front of you. When the timer starts, raise both arms straight in front at shoulder height and hold. Keep your elbows straight until you hear the finish tone.',
      success_checklist: ['Sturdy chair or support nearby', 'Full arms visible in frame', 'Shoulders relaxed as possible', 'Stop if painful'],
    },
  },
  ...['left', 'right'].map((side, i) => ({
    task_id: 'finger_tap_' + side,
    task_name: 'Finger Tapping — ' + (side === 'left' ? 'Left' : 'Right'),
    task_group: /** @type {TaskGroup} */ ('upper_limb'),
    task_order: 3 + i,
    clinical_purpose: 'Assesses speed and regularity of repetitive finger movement on one side, useful for bradykinesia and asymmetry.',
    patient_instructions: 'Use your ' + (side === 'left' ? 'left' : 'right') + ' hand. Tap your index finger and thumb together as quickly and regularly as you can, with as large an opening as you comfortably can.',
    camera_setup: 'Place the camera so your ' + (side === 'left' ? 'left' : 'right') + ' hand and wrist fill most of the frame. Avoid backlight.',
    duration_seconds: 15,
    safety_level: 'low',
    safety_warning: 'Stop if you feel cramping, joint pain, or lose control of the movement.',
    demo_asset: null,
    structured_clinician_fields: limbKineticScores(side),
    future_automation_notes: 'Tap count, inter-tap interval, decay rate, freezing episodes via pose keypoints.',
    script: {
      title: 'Finger tapping — ' + (side === 'left' ? 'left hand' : 'right hand'),
      what_this_checks: 'How fast and steady you can open and close your fingers on one side.',
      how_to_do: 'Rest your forearm on a table or your lap. Tap your index finger and thumb together quickly and evenly. Make each opening as big as is comfortable.',
      camera_position: 'Close-up on the ' + (side === 'left' ? 'left' : 'right') + ' hand and wrist. Bright, even light on the hand.',
      safety: 'If your hand cramps or hurts, stop and skip.',
      voice_prompt: 'Use only your ' + (side === 'left' ? 'left' : 'right') + ' hand. When the timer starts, tap your index and thumb together as fast and evenly as you can, with big comfortable openings. Keep going until the timer stops.',
      success_checklist: ['Hand fills most of the frame', 'Forearm supported', 'No tight fist—tap smoothly', 'Pause if pain'],
    },
  })),
  ...['left', 'right'].map((side, i) => ({
    task_id: 'hand_open_close_' + side,
    task_name: 'Hand Open-Close — ' + (side === 'left' ? 'Left' : 'Right'),
    task_group: /** @type {TaskGroup} */ ('upper_limb'),
    task_order: 5 + i,
    clinical_purpose: 'Tests repetitive opening and closing of the full hand, highlighting rigidity, slowness, or amplitude loss.',
    patient_instructions: 'With your ' + (side === 'left' ? 'left' : 'right') + ' hand, fully open your fingers wide, then make a fist, and repeat as quickly as you can.',
    camera_setup: 'Same close-up as finger tapping: palm and fingers clearly visible.',
    duration_seconds: 15,
    safety_level: 'low',
    safety_warning: 'Do not force through sharp joint pain; skip if unsafe.',
    demo_asset: null,
    structured_clinician_fields: limbKineticScores(side),
    future_automation_notes: 'Cycle count, joint angular velocity from hand landmarks, amplitude decay.',
    script: {
      title: 'Hand open and close — ' + (side === 'left' ? 'left' : 'right'),
      what_this_checks: 'How quickly you can open your hand wide and then close it into a fist, over and over.',
      how_to_do: 'Rest your forearm. Spread your fingers wide, then close into a comfortable fist. Repeat quickly and smoothly.',
      camera_position: 'Close-up on the active hand. Keep the full hand in frame.',
      safety: 'Do not squeeze so hard that it hurts. Skip if joints feel unstable.',
      voice_prompt: 'Using your ' + (side === 'left' ? 'left' : 'right') + ' hand only, when the timer starts, open your hand wide and then close to a fist again and again as fast as you comfortably can. Keep a large motion.',
      success_checklist: ['Full hand visible', 'Large open and close', 'Steady rhythm if you can', 'Stop if pain'],
    },
  })),
  ...['left', 'right'].map((side, i) => ({
    task_id: 'pronation_supination_' + side,
    task_name: 'Pronation-Supination — ' + (side === 'left' ? 'Left' : 'Right'),
    task_group: /** @type {TaskGroup} */ ('upper_limb'),
    task_order: 7 + i,
    clinical_purpose: 'Assesses alternating forearm rotation, sensitive to bradykinesia and coordination.',
    patient_instructions: 'Bend your elbow 90° at your side. Turn your palm up and down as fast as you can, keeping the elbow still.',
    camera_setup: 'Frame the active forearm and hand from the side so rotation is easy to see.',
    duration_seconds: 15,
    safety_level: 'low',
    safety_warning: 'Skip if elbow or wrist injury makes rotation unsafe.',
    demo_asset: null,
    structured_clinician_fields: limbKineticScores(side),
    future_automation_notes: 'Rotation frequency, range of motion, arrest spells.',
    script: {
      title: 'Turn the palm up and down — ' + (side === 'left' ? 'left arm' : 'right arm'),
      what_this_checks: 'How fast you can rotate your forearm so your palm faces up, then down.',
      how_to_do: 'Tuck your elbow at your side with the bend at ninety degrees. Flip the palm up, then down, as quickly as you can without moving your elbow away from your body.',
      camera_position: 'Side view of the forearm and hand. Keep the whole movement in frame.',
      safety: 'If your elbow or wrist hurts, stop and skip.',
      voice_prompt: 'Bend your ' + (side === 'left' ? 'left' : 'right') + ' elbow ninety degrees with the elbow tucked at your side. When the timer starts, rotate your palm up, then down, as fast as you can. Keep the elbow still.',
      success_checklist: ['Elbow stays at your side', 'Side camera angle', 'Full turns visible', 'Stop if pain'],
    },
  })),
  ...['left', 'right'].map((side, i) => ({
    task_id: 'foot_tap_' + side,
    task_name: 'Foot Tapping — ' + (side === 'left' ? 'Left' : 'Right'),
    task_group: /** @type {TaskGroup} */ ('lower_limb'),
    task_order: 9 + i,
    clinical_purpose: 'Evaluates lower-limb repetitive movement and lateral asymmetry relevant to Parkinsonism.',
    patient_instructions: 'Sit tall with feet flat. Tap your ' + (side === 'left' ? 'left' : 'right') + ' heel on the floor in front of you as quickly as you can, keeping the other foot relaxed.',
    camera_setup: 'Camera low enough to see knees, feet, and floor. Side angle often works best.',
    duration_seconds: 15,
    safety_level: 'moderate',
    safety_warning: 'Use a sturdy chair. Skip if you might fall or have recent lower-limb injury.',
    demo_asset: null,
    structured_clinician_fields: limbKineticScores(side),
    future_automation_notes: 'Heel tap rate, height decay, freezing detection from leg pose.',
    script: {
      title: 'Foot tapping — ' + (side === 'left' ? 'left' : 'right'),
      what_this_checks: 'How quickly you can tap one heel on the floor in front of you.',
      how_to_do: 'Sit in a stable chair, feet on the floor. Use only the ' + (side === 'left' ? 'left' : 'right') + ' foot to tap the heel up and down in front of your chair as fast as you can.',
      camera_position: 'Show both legs from mid-thigh down. A slight side angle helps see the tap.',
      safety: 'Hold the chair if needed. If you feel unsteady, skip.',
      voice_prompt: 'Sit tall in a sturdy chair. When the timer starts, tap your ' + (side === 'left' ? 'left' : 'right') + ' heel on the floor in front of you as fast as you can. Keep the other foot quiet.',
      success_checklist: ['Sturdy chair', 'Feet and floor visible', 'Hand on chair arm optional', 'Skip if balance feels unsafe'],
    },
  })),
  {
    task_id: 'sit_to_stand',
    task_name: 'Sit-to-Stand',
    task_group: 'balance_gait',
    task_order: 11,
    clinical_purpose: 'Observes transition from sitting to standing, a functional measure of leg power, balance, and compensatory arm use.',
    patient_instructions: 'Start seated in a sturdy chair without arm push-off if you can. Stand up at a normal pace when prompted, then pause standing.',
    camera_setup: 'Place the camera 6–10 feet away to capture full body from the side.',
    duration_seconds: 30,
    safety_level: 'high',
    safety_warning: 'Only perform if a caregiver is present when you normally need help to stand. Clear obstacles; skip if dizzy.',
    demo_asset: null,
    structured_clinician_fields: {
      uses_arms: ['yes', 'no'],
      transfer_difficulty: ['none', 'mild', 'moderate', 'severe'],
      postural_stability: ['normal', 'mild_impairment', 'moderate_impairment', 'severe_impairment'],
    },
    future_automation_notes: 'Trunk flexion angle, rise time, COP proxy from pose if stable camera.',
    script: {
      title: 'Sit to stand',
      what_this_checks: 'How you get up from a chair, which shows leg strength and balance for everyday tasks.',
      how_to_do: 'Sit toward the front of a sturdy chair. When the timer starts, stand up at your usual speed. You may use arms if that is how you normally rise. Then stay standing briefly.',
      camera_position: 'Full-body side view from several meters away. Remove rugs or clutter around the chair.',
      safety: 'Have help nearby if you usually need it. Stop if dizzy or weak.',
      voice_prompt: 'Sit in a sturdy chair with feet under you. When you hear begin, stand up in your normal way. Pause once upright. If standing is unsafe today, skip this task.',
      success_checklist: ['Clear floor space', 'Sturdy chair', 'Supervision if needed', 'Skip if unsafe'],
    },
  },
  {
    task_id: 'standing_balance',
    task_name: 'Standing Balance / Quiet Standing',
    task_group: 'balance_gait',
    task_order: 12,
    clinical_purpose: 'Screens quiet stance and postural sway when standing still, relevant to balance disorders.',
    patient_instructions: 'Stand comfortably with feet hip-width apart. Hold still with arms at your sides for the recording.',
    camera_setup: 'Full-body frontal or slight angle view; feet must be visible.',
    duration_seconds: 20,
    safety_level: 'high',
    safety_warning: 'Stand near a counter or have someone nearby if you have fall risk. Skip if unsafe to stand unsupported.',
    demo_asset: null,
    structured_clinician_fields: {
      sway_impression: ['none', 'mild', 'moderate', 'severe'],
      stance_base: ['normal', 'widened', 'tandem_not_attempted'],
    },
    future_automation_notes: 'COM sway path length, ML/AP RMS from pose (camera as weak proxy).',
    script: {
      title: 'Quiet standing',
      what_this_checks: 'How steady you are when you stand still with your feet on the floor.',
      how_to_do: 'Face the camera. Feet about hip width. Arms relaxed at your sides. When the timer starts, stand as still as you comfortably can.',
      camera_position: 'Full body visible including feet. Good light; avoid dark silhouette.',
      safety: 'Stand within reach of a stable surface or person if you might lose balance. Sit down if dizzy.',
      voice_prompt: 'Stand facing the camera with feet comfortably apart. When the timer starts, hold quiet standing with arms at your sides. Try not to talk or step.',
      success_checklist: ['Support within reach', 'Feet visible', 'Stop if dizzy', 'Skip if standing alone is unsafe'],
    },
  },
  {
    task_id: 'gait_away_back',
    task_name: 'Gait Away and Back',
    task_group: 'balance_gait',
    task_order: 13,
    clinical_purpose: 'Observes walking pace, stride, arm swing, and stability over a short distance.',
    patient_instructions: 'Walk smoothly away from the camera for several steps, turn, and walk back toward the camera at your usual pace.',
    camera_setup: 'Clear a straight path at least 4 meters. Camera at one end, full-body framing.',
    duration_seconds: 45,
    safety_level: 'high',
    safety_warning: 'Clear tripping hazards. Use assistive device if that is your baseline. Skip if walking is unsafe today.',
    demo_asset: null,
    structured_clinician_fields: {
      gait_speed: ['normal', 'slowed', 'markedly_slowed'],
      arm_swing: ['normal', 'reduced_left', 'reduced_right', 'bilateral_reduction'],
      shuffling: ['yes', 'no'],
      freezing_concern: ['yes', 'no'],
      turn_quality: ['normal', 'slow', 'unstable'],
    },
    future_automation_notes: 'Step length, cadence, arm swing angle, double-support fraction.',
    script: {
      title: 'Walk away and back',
      what_this_checks: 'Your walking pattern when you move in a straight line and turn around.',
      how_to_do: 'When the timer starts, walk at your normal pace away from the camera for a few steps, turn carefully, and walk back toward the camera. Use a cane or walker if that is normal for you.',
      camera_position: 'Place the camera at the end of a clear hallway or long room. Show the full body while walking.',
      safety: 'Remove rugs and obstacles. Have someone nearby if you fall easily.',
      voice_prompt: 'Start behind the camera view if needed. When the timer starts, walk forward away from the camera, turn, and walk back. Move at your usual speed and stop if you feel unsteady.',
      success_checklist: ['Clear path', 'Assistive device if usual', 'Room to turn', 'Skip if unsafe'],
    },
  },
  {
    task_id: 'turn_in_place',
    task_name: 'Turn in Place',
    task_group: 'balance_gait',
    task_order: 14,
    clinical_purpose: 'Highlights turning strategy and stability during pivots, relevant to freezing and fall risk.',
    patient_instructions: 'Stand and slowly turn a full circle in one direction, then optionally the other as instructed on screen.',
    camera_setup: 'Full-body view with space to turn 360° without leaving frame if possible.',
    duration_seconds: 25,
    safety_level: 'high',
    safety_warning: 'Turn slowly; hold support if needed. Skip if pivoting is unsafe.',
    demo_asset: null,
    structured_clinician_fields: {
      turn_quality: ['normal', 'slow', 'unstable'],
      steps_to_turn: ['0-1', '2-3', '4_or_more'],
      freezing_concern: ['yes', 'no'],
    },
    future_automation_notes: 'Turn duration, number of steps, head-trunk dissociation.',
    script: {
      title: 'Turn in place',
      what_this_checks: 'How you turn your body when you cannot take a long walking path.',
      how_to_do: 'Stand with feet ready to pivot. When the timer starts, turn slowly in a full circle on the spot. If asked, repeat turning the other way.',
      camera_position: 'Full body in frame with room to rotate. Stand back from furniture corners.',
      safety: 'Move slowly. Use a hand on a counter if needed. Skip if turning makes you dizzy.',
      voice_prompt: 'Stand with space to turn. When the timer starts, make a slow full turn in place. Stop if you feel unsteady. If there is time, turn the other direction the same way.',
      success_checklist: ['Space to pivot', 'Support nearby', 'Slow controlled turn', 'Skip if dizzy'],
    },
  },
  {
    task_id: 'finger_to_nose',
    task_name: 'Finger-to-Nose',
    task_group: 'coordination',
    task_order: 15,
    clinical_purpose: 'Screens upper-limb coordination and intention tremor with a classic bedside maneuver adapted for video.',
    patient_instructions: 'Extend one arm, touch your index finger to your nose, then touch the tip of your opposite index finger, and repeat smoothly.',
    camera_setup: 'Waist-up, three-quarter view so nose, hands, and depth of movement are visible.',
    duration_seconds: 25,
    safety_level: 'moderate',
    safety_warning: 'Do not perform if you cannot raise your arm safely or have shoulder precautions.',
    demo_asset: null,
    structured_clinician_fields: {
      dysmetria: ['none', 'mild', 'moderate', 'severe'],
      intention_tremor: ['none', 'mild', 'moderate', 'severe'],
      side_worse: ['left', 'right', 'equal', 'not_applicable'],
    },
    future_automation_notes: 'Endpoint error from nose/finger keypoints, movement arc smoothness.',
    script: {
      title: 'Finger to nose',
      what_this_checks: 'Coordination when you aim your finger to your nose and to your other hand.',
      how_to_do: 'Hold one arm out to the side. Touch your index finger to the tip of your nose, then stretch to touch the tip of your opposite index finger. Repeat in a steady rhythm.',
      camera_position: 'Waist-up at an angle so both hands and your nose are visible.',
      safety: 'Use a shorter reach if your shoulder hurts. Skip if aiming movements feel unsafe.',
      voice_prompt: 'Reach one arm out. When the timer starts, touch your index finger to your nose, then reach to touch the opposite index finger, and repeat smoothly. Follow the on-screen arm if we highlight one side.',
      success_checklist: ['Nose and hands visible', 'Comfortable reach', 'Slow smooth rhythm', 'Stop if shoulder pain'],
    },
  },
  {
    task_id: 'facial_expression_speech',
    task_name: 'Facial Expression + Speech Sample',
    task_group: 'face_speech',
    task_order: 16,
    clinical_purpose: 'Captures facial mobility and a short speech sample for hypomonia and articulation impression when reviewed clinically.',
    patient_instructions: 'Make a few expressive faces as prompted, then read a short sentence aloud clearly at a comfortable volume.',
    camera_setup: 'Face and shoulders fill most of the frame. Quiet room; microphone unobstructed.',
    duration_seconds: 45,
    safety_level: 'low',
    safety_warning: 'Stop if you become breathless or distressed during speech.',
    demo_asset: null,
    structured_clinician_fields: {
      facial_expression: ['normal', 'reduced_expressivity', 'asymmetry'],
      speech_clarity: ['normal', 'mildly_reduced', 'moderately_reduced', 'severely_reduced'],
      hypophonia_present: ['yes', 'no'],
    },
    future_automation_notes: 'Facial action units (optional), speech loudness / MFCC features with consent.',
    script: {
      title: 'Face and speech',
      what_this_checks: 'How your face moves with expression and how clearly your voice comes through on a short clip.',
      how_to_do: 'When prompted, smile big, raise your eyebrows, and open your eyes wide—then relax. Then read the sentence on the screen aloud in your normal voice.',
      camera_position: 'Face centered; shoulders visible. Reduce background noise.',
      safety: 'Pause if you feel short of breath. Skip if speaking aloud is unsafe today.',
      voice_prompt: 'First, smile as widely as you can, then raise your eyebrows, then open your eyes wide. Relax. Then read the sentence on the screen aloud at your normal volume: “The quick brown fox jumps over the lazy dog.”',
      success_checklist: ['Face well lit', 'Quiet room', 'Microphone not covered', 'Stop if breathless'],
    },
  },
];

VIDEO_ASSESSMENT_TASKS.sort((a, b) => a.task_order - b.task_order);

export const VIDEO_ASSESSMENT_PROTOCOL = {
  protocol_name: 'virtual_care_motor_mvp_v1',
  protocol_version: '1.0.0',
  title: 'Video Assessments — Virtual Care Motor MVP',
  base_review_fields: BASE_REVIEW_KEYS,
  tasks: VIDEO_ASSESSMENT_TASKS,
};

/** @returns {Record<string, unknown>} */
export function createEmptySession(overrides = {}) {
  const id = overrides.id || ('vas_' + Math.random().toString(36).slice(2, 12));
  const patientId = overrides.patient_id || 'demo-patient';
  const encounterId = overrides.encounter_id || null;
  const mode = overrides.mode || 'patient_capture';

  const tasks = VIDEO_ASSESSMENT_TASKS.map((def) => ({
    task_id: def.task_id,
    task_name: def.task_name,
    task_group: def.task_group,
    task_order: def.task_order,
    instructions: {
      patient: def.patient_instructions,
      camera: def.camera_setup,
      duration_seconds: def.duration_seconds,
      safety_warning: def.safety_warning,
      script: def.script,
    },
    demo_asset: def.demo_asset,
    duration_seconds: def.duration_seconds,
    safety_level: def.safety_level,
    recording_status: 'pending',
    skip_reason: null,
    unsafe_flag: false,
    recording_asset_id: null,
    ai_analysis_status: 'not_requested',
    clinician_review: null,
  }));

  return {
    id,
    patient_id: patientId,
    encounter_id: encounterId,
    protocol_name: VIDEO_ASSESSMENT_PROTOCOL.protocol_name,
    protocol_version: VIDEO_ASSESSMENT_PROTOCOL.protocol_version,
    mode,
    started_at: new Date().toISOString(),
    completed_at: null,
    overall_status: 'in_progress',
    safety_flags: [],
    tasks,
    summary: {
      tasks_completed: 0,
      tasks_skipped: 0,
      tasks_needing_repeat: 0,
      review_completion_percent: 0,
      clinician_impression: null,
      recommended_followup: null,
    },
    future_ai_metrics_placeholder: {
      pose_metrics: null,
      movement_counts: null,
      speed_metrics: null,
      amplitude_metrics: null,
      symmetry_metrics: null,
      longitudinal_comparison: null,
    },
    ...overrides,
  };
}

/**
 * Merge API session JSON with local task definitions (instructions, scripts).
 * Server seed rows may omit rich ``instructions`` — fill from VIDEO_ASSESSMENT_TASKS.
 * @param {Record<string, unknown>} serverDoc
 * @returns {Record<string, unknown>}
 */
export function mergeServerDocument(serverDoc) {
  const byId = new Map(VIDEO_ASSESSMENT_TASKS.map((d) => [d.task_id, d]));
  const tasks = Array.isArray(serverDoc.tasks) ? serverDoc.tasks.map((t) => {
    const def = byId.get(t.task_id);
    if (!def) return t;
    const merged = { ...t };
    if (!merged.instructions || typeof merged.instructions !== 'object') {
      merged.instructions = {
        patient: def.patient_instructions,
        camera: def.camera_setup,
        duration_seconds: def.duration_seconds,
        safety_warning: def.safety_warning,
        script: def.script,
      };
    }
    if (merged.duration_seconds == null) merged.duration_seconds = def.duration_seconds;
    if (merged.safety_level == null) merged.safety_level = def.safety_level;
    if (merged.demo_asset === undefined) merged.demo_asset = def.demo_asset;
    if (!merged.task_name) merged.task_name = def.task_name;
    if (!merged.task_group) merged.task_group = def.task_group;
    if (merged.task_order == null) merged.task_order = def.task_order;
    return merged;
  }) : [];
  return { ...serverDoc, tasks };
}

export function summarizeSession(session) {
  const tasks = session.tasks || [];
  let completed = 0;
  let skipped = 0;
  let needRepeat = 0;
  let reviewed = 0;
  const safety = [];

  for (const t of tasks) {
    if (t.recording_status === 'recorded' || t.recording_status === 'accepted') completed++;
    if (t.recording_status === 'skipped' || t.recording_status === 'unsafe_skipped') {
      skipped++;
      if (t.unsafe_flag || t.skip_reason === 'unsafe') safety.push(t.task_id);
    }
    const rev = t.clinician_review;
    if (rev && rev.reviewed_at) {
      reviewed++;
      if (rev.repeat_needed === 'yes') needRepeat++;
    }
  }

  const reviewPct = tasks.length ? Math.round((reviewed / tasks.length) * 100) : 0;

  return {
    tasks_completed: completed,
    tasks_skipped: skipped,
    tasks_needing_repeat: needRepeat,
    review_completion_percent: reviewPct,
    clinician_impression: session.summary?.clinician_impression ?? null,
    recommended_followup: session.summary?.recommended_followup ?? null,
    safety_task_ids: safety,
  };
}
