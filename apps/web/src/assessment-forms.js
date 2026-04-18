// Patient-fillable self-report assessment forms.
// Each entry is a config consumed by renderLikertForm() in pages-patient.js.
//
// Shape:
//   {
//     formKey:     string  // state namespace + cache key
//     templateId:  string  // submitted to api.submitAssessment as template_id
//     header:      string  // small caps header above the question list
//     questions:   string[]
//     options:     [{ value, label }]  // shared across all questions
//     maxScore:    number              // for the "N / max" live counter
//     severityFn:  (score) => ({ label, color })
//   }
//
// Severity colors use the same CSS variable palette as PHQ-9:
//   var(--green)  minimal / none / normal
//   var(--teal)   mild / subthreshold
//   var(--blue)   moderate
//   var(--amber)  moderately severe / high-risk screen
//   #ff6b6b       severe / extremely severe / probable PTSD

// ── Shared option banks ────────────────────────────────────────────────────

// PHQ-family + GAD-family: 4-point "how often in last 2 weeks" scale
const OPTS_PHQ_GAD = [
  { value: 0, label: 'Not at all' },
  { value: 1, label: 'Several days' },
  { value: 2, label: 'More than half the days' },
  { value: 3, label: 'Nearly every day' },
];

// PCL-5: 5-point "how much bothered" scale
const OPTS_PCL5 = [
  { value: 0, label: 'Not at all' },
  { value: 1, label: 'A little bit' },
  { value: 2, label: 'Moderately' },
  { value: 3, label: 'Quite a bit' },
  { value: 4, label: 'Extremely' },
];

// ISI: 5-point severity scale (simplified — in the clinical scale
// options differ per question but share the same 0–4 numeric weights)
const OPTS_ISI = [
  { value: 0, label: 'None' },
  { value: 1, label: 'Mild' },
  { value: 2, label: 'Moderate' },
  { value: 3, label: 'Severe' },
  { value: 4, label: 'Very severe' },
];

// DASS-21: 4-point "applied to me over past week" scale
const OPTS_DASS21 = [
  { value: 0, label: 'Did not apply to me at all' },
  { value: 1, label: 'Applied to me to some degree' },
  { value: 2, label: 'Applied to me to a considerable degree' },
  { value: 3, label: 'Applied to me very much' },
];

// ── Question banks ────────────────────────────────────────────────────────

// PHQ-9 — 9 items. Kept here so the refactored renderer has a single source
// of truth; the existing i18n-backed version remains the runtime default.
const Q_PHQ9 = [
  'Little interest or pleasure in doing things',
  'Feeling down, depressed, or hopeless',
  'Trouble falling or staying asleep, or sleeping too much',
  'Feeling tired or having little energy',
  'Poor appetite or overeating',
  'Feeling bad about yourself — or that you are a failure or have let yourself or your family down',
  'Trouble concentrating on things, such as reading the newspaper or watching television',
  'Moving or speaking so slowly that other people could have noticed? Or being so fidgety or restless that you have been moving more than usual',
  'Thoughts that you would be better off dead, or of hurting yourself in some way',
];

// GAD-7 — 7 items.
const Q_GAD7 = [
  'Feeling nervous, anxious, or on edge',
  'Not being able to stop or control worrying',
  'Worrying too much about different things',
  'Trouble relaxing',
  'Being so restless that it is hard to sit still',
  'Becoming easily annoyed or irritable',
  'Feeling afraid as if something awful might happen',
];

// GAD-2 = first 2 items of GAD-7.
const Q_GAD2 = Q_GAD7.slice(0, 2);

// PHQ-2 = first 2 items of PHQ-9.
const Q_PHQ2 = Q_PHQ9.slice(0, 2);

// PCL-5 — 20 items. Standard DSM-5 PTSD Checklist wording.
const Q_PCL5 = [
  'Repeated, disturbing, and unwanted memories of the stressful experience',
  'Repeated, disturbing dreams of the stressful experience',
  'Suddenly feeling or acting as if the stressful experience were actually happening again',
  'Feeling very upset when something reminded you of the stressful experience',
  'Having strong physical reactions when something reminded you of the stressful experience (for example, heart pounding, trouble breathing, sweating)',
  'Avoiding memories, thoughts, or feelings related to the stressful experience',
  'Avoiding external reminders of the stressful experience (for example, people, places, conversations, activities, objects, or situations)',
  'Trouble remembering important parts of the stressful experience',
  'Having strong negative beliefs about yourself, other people, or the world',
  'Blaming yourself or someone else for the stressful experience or what happened after it',
  'Having strong negative feelings such as fear, horror, anger, guilt, or shame',
  'Loss of interest in activities that you used to enjoy',
  'Feeling distant or cut off from other people',
  'Trouble experiencing positive feelings',
  'Irritable behavior, angry outbursts, or acting aggressively',
  'Taking too many risks or doing things that could cause you harm',
  'Being "super alert" or watchful or on guard',
  'Feeling jumpy or easily startled',
  'Having difficulty concentrating',
  'Trouble falling or staying asleep',
];

// ISI — 7 items. Simplified single-option set (see comment on OPTS_ISI).
const Q_ISI = [
  'Difficulty falling asleep',
  'Difficulty staying asleep',
  'Problems waking up too early',
  'How satisfied/dissatisfied are you with your current sleep pattern?',
  'How noticeable to others is your sleep problem in terms of impairing the quality of your life?',
  'How worried/distressed are you about your current sleep problem?',
  'To what extent do you consider your sleep problem to interfere with your daily functioning?',
];

// DASS-21 — 21 items in canonical order.
const Q_DASS21 = [
  'I found it hard to wind down',
  'I was aware of dryness of my mouth',
  'I couldn\u2019t seem to experience any positive feeling at all',
  'I experienced breathing difficulty (e.g. excessively rapid breathing, breathlessness in the absence of physical exertion)',
  'I found it difficult to work up the initiative to do things',
  'I tended to over-react to situations',
  'I experienced trembling (e.g. in the hands)',
  'I felt that I was using a lot of nervous energy',
  'I was worried about situations in which I might panic and make a fool of myself',
  'I felt that I had nothing to look forward to',
  'I found myself getting agitated',
  'I found it difficult to relax',
  'I felt down-hearted and blue',
  'I was intolerant of anything that kept me from getting on with what I was doing',
  'I felt I was close to panic',
  'I was unable to become enthusiastic about anything',
  'I felt I wasn\u2019t worth much as a person',
  'I felt that I was rather touchy',
  'I was aware of the action of my heart in the absence of physical exertion (e.g. sense of heart rate increase, heart missing a beat)',
  'I felt scared without any good reason',
  'I felt that life was meaningless',
];

// ── Severity bands ────────────────────────────────────────────────────────

function sevPHQ9(score) {
  if (score <= 4)  return { label: 'Minimal',           color: 'var(--green)' };
  if (score <= 9)  return { label: 'Mild',              color: 'var(--teal)'  };
  if (score <= 14) return { label: 'Moderate',          color: 'var(--blue)'  };
  if (score <= 19) return { label: 'Moderately severe', color: 'var(--amber)' };
  return               { label: 'Severe',             color: '#ff6b6b'        };
}

function sevGAD7(score) {
  if (score <= 4)  return { label: 'Minimal',  color: 'var(--green)' };
  if (score <= 9)  return { label: 'Mild',     color: 'var(--teal)'  };
  if (score <= 14) return { label: 'Moderate', color: 'var(--blue)'  };
  return               { label: 'Severe',    color: '#ff6b6b'        };
}

// GAD-2 / PHQ-2: ≥3 is a positive screen.
function sevQuickScreen(label) {
  return function(score) {
    if (score < 3) return { label: 'Negative screen', color: 'var(--green)' };
    return             { label: label,              color: 'var(--amber)'  };
  };
}

function sevPCL5(score) {
  if (score < 33) return { label: 'Below threshold', color: 'var(--green)' };
  return              { label: 'Probable PTSD',    color: '#ff6b6b'        };
}

function sevISI(score) {
  if (score <= 7)  return { label: 'No clinically significant insomnia', color: 'var(--green)' };
  if (score <= 14) return { label: 'Subthreshold insomnia',              color: 'var(--teal)'  };
  if (score <= 21) return { label: 'Moderate insomnia',                   color: 'var(--blue)'  };
  return               { label: 'Severe insomnia',                      color: '#ff6b6b'        };
}

// DASS-21 total severity uses the Depression subscale bands (×2 convention).
// Since we report a composite total here (range 0–63), mirror the severity
// cut-offs clinics typically see for the Depression scale after ×2 doubling.
function sevDASS21(score) {
  if (score <= 9)  return { label: 'Normal',             color: 'var(--green)' };
  if (score <= 13) return { label: 'Mild',               color: 'var(--teal)'  };
  if (score <= 20) return { label: 'Moderate',           color: 'var(--blue)'  };
  if (score <= 27) return { label: 'Severe',             color: 'var(--amber)' };
  return               { label: 'Extremely severe',    color: '#ff6b6b'        };
}

// ── Exported config registry ──────────────────────────────────────────────

export const ASSESSMENT_FORMS = {
  phq9: {
    formKey:    'phq9',
    templateId: 'PHQ-9',
    header:     'Over the last 2 weeks, how often have you been bothered by any of the following?',
    questions:  Q_PHQ9,
    options:    OPTS_PHQ_GAD,
    maxScore:   27,
    severityFn: sevPHQ9,
  },
  gad7: {
    formKey:    'gad7',
    templateId: 'GAD-7',
    header:     'Over the last 2 weeks, how often have you been bothered by the following problems?',
    questions:  Q_GAD7,
    options:    OPTS_PHQ_GAD,
    maxScore:   21,
    severityFn: sevGAD7,
  },
  gad2: {
    formKey:    'gad2',
    templateId: 'GAD-2',
    header:     'Over the last 2 weeks, how often have you been bothered by the following problems?',
    questions:  Q_GAD2,
    options:    OPTS_PHQ_GAD,
    maxScore:   6,
    severityFn: sevQuickScreen('Positive anxiety screen'),
  },
  phq2: {
    formKey:    'phq2',
    templateId: 'PHQ-2',
    header:     'Over the last 2 weeks, how often have you been bothered by any of the following?',
    questions:  Q_PHQ2,
    options:    OPTS_PHQ_GAD,
    maxScore:   6,
    severityFn: sevQuickScreen('Positive depression screen'),
  },
  pcl5: {
    formKey:    'pcl5',
    templateId: 'PCL-5',
    header:     'In the past month, how much were you bothered by:',
    questions:  Q_PCL5,
    options:    OPTS_PCL5,
    maxScore:   80,
    severityFn: sevPCL5,
  },
  isi: {
    formKey:    'isi',
    templateId: 'ISI',
    header:     'Please rate the current severity of your sleep difficulties over the past 2 weeks.',
    questions:  Q_ISI,
    options:    OPTS_ISI,
    maxScore:   28,
    severityFn: sevISI,
  },
  dass21: {
    formKey:    'dass21',
    templateId: 'DASS-21',
    header:     'Please read each statement and indicate how much it applied to you over the past week.',
    questions:  Q_DASS21,
    options:    OPTS_DASS21,
    maxScore:   63,
    severityFn: sevDASS21,
  },
};

// Forms the patient can fill in-app. Used as a gate by the renderer
// dispatcher in pages-patient.js.
export const SUPPORTED_FORMS = Object.freeze({
  phq9:   true,
  gad7:   true,
  gad2:   true,
  phq2:   true,
  pcl5:   true,
  isi:    true,
  dass21: true,
});

export function getAssessmentConfig(formKey) {
  return ASSESSMENT_FORMS[formKey] || null;
}
