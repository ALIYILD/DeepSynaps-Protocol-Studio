/**
 * Protocol Mock Data Factory — DeepSynaps Protocol Studio
 * ========================================================
 * Provides factory functions for creating mock protocol-related data.
 * Use these for consistent, type-safe test fixtures.
 */

import type {
  ProtocolDraft,
  EvidenceLink,
  PatientContext,
  SafetyCheckItem,
  ConditionItem,
  ModalityItem,
  WizardStep,
} from "../../protocol/types";
import type { AiMessage, SuggestionChip, Citation } from "../../copilot/types";
import type {
  PendingProtocol,
  ActiveTreatment,
  RecentAnalysis,
  AiAlert,
} from "../../dashboard/types";

// ── IDs ───────────────────────────────────────────────────────────────
let idCounter = 0;
const nextId = (prefix: string) => `${prefix}-${String(++idCounter).padStart(3, "0")}`;

// ── ProtocolDraft ─────────────────────────────────────────────────────
export const createMockProtocolDraft = (
  overrides?: Partial<ProtocolDraft>
): ProtocolDraft => ({
  id: nextId("draft"),
  title: "rTMS Protocol for MDD",
  mode: "rTMS",
  targetRegion: "DLPFC",
  frequency: 10,
  intensity: 120,
  duration: 20,
  sessions: 20,
  interTrainInterval: 50,
  pulseCount: 3000,
  coilType: "Figure-8",
  evidenceLinks: [createMockEvidenceLink()],
  patientContext: createMockPatientContext(),
  safetyChecks: [
    createMockSafetyCheckItem({ category: "implants", description: "Check for metal implants" }),
    createMockSafetyCheckItem({ category: "seizure", description: "Verify seizure history" }),
    createMockSafetyCheckItem({ category: "medication", description: "Review current medications" }),
  ],
  status: "draft",
  createdAt: "2024-12-18T10:00:00Z",
  updatedAt: "2024-12-18T10:00:00Z",
  createdBy: "Dr. Smith",
  notes: "Initial draft for patient review",
  ...overrides,
});

// ── EvidenceLink ──────────────────────────────────────────────────────
export const createMockEvidenceLink = (
  overrides?: Partial<EvidenceLink>
): EvidenceLink => ({
  id: nextId("ev"),
  title: "High-frequency rTMS for treatment-resistant depression: a systematic review",
  authors: "Berlim MT, Van den Eynde F, Tovar-Perdomo S, Daskalakis ZJ",
  year: 2014,
  journal: "Neuropsychopharmacology",
  doi: "10.1038/npp.2013.326",
  grade: "A",
  level: "I",
  pmid: 24309930,
  url: "https://pubmed.ncbi.nlm.nih.gov/24309930/",
  summary: "Level I evidence supports the efficacy of high-frequency rTMS to the left DLPFC for treatment-resistant depression.",
  isExpanded: false,
  ...overrides,
});

// ── PatientContext ────────────────────────────────────────────────────
export const createMockPatientContext = (
  overrides?: Partial<PatientContext>
): PatientContext => ({
  id: nextId("pt"),
  initials: "J.D.",
  age: 42,
  gender: "M",
  primaryCondition: "Major Depressive Disorder",
  comorbidities: ["Generalized Anxiety Disorder"],
  medications: ["Sertraline 100mg", "Clonazepam 0.5mg"],
  previousTreatments: ["CBT", "Pharmacotherapy"],
  metalImplants: false,
  seizureHistory: false,
  pregnancyStatus: "not_pregnant",
  notes: "Treatment-resistant, failed 2+ medication trials",
  ...overrides,
});

// ── SafetyCheckItem ───────────────────────────────────────────────────
export const createMockSafetyCheckItem = (
  overrides?: Partial<SafetyCheckItem>
): SafetyCheckItem => ({
  id: nextId("sc"),
  category: "general",
  description: "Verify patient eligibility",
  status: "pending",
  required: true,
  notes: "",
  ...overrides,
});

// ── WizardStep ────────────────────────────────────────────────────────
export const createMockWizardStep = (
  overrides?: Partial<WizardStep>
): WizardStep => ({
  id: nextId("step"),
  label: "Patient Selection",
  description: "Select patient and confirm context",
  isComplete: false,
  isActive: false,
  ...overrides,
});

// ── AiMessage ─────────────────────────────────────────────────────────
export const createMockAiMessage = (
  overrides?: Partial<AiMessage>
): AiMessage => ({
  id: nextId("msg"),
  role: "assistant",
  content: "Based on the patient's history of treatment-resistant depression, I recommend considering high-frequency rTMS to the left DLPFC. This has Level I evidence support with response rates around 30-40%.",
  timestamp: "2024-12-18T10:30:00Z",
  citations: [createMockCitation()],
  isStreaming: false,
  suggestions: ["Show evidence", "Generate protocol", "View alternatives"],
  ...overrides,
});

// ── Citation ──────────────────────────────────────────────────────────
export const createMockCitation = (overrides?: Partial<Citation>): Citation => ({
  id: nextId("cite"),
  title: "Efficacy and safety of transcranial magnetic stimulation in the acute treatment of major depression",
  authors: "Janicak PG, O'Reardon JP, Sampson SM, et al.",
  year: 2008,
  source: "Biological Psychiatry",
  url: "https://pubmed.ncbi.nlm.nih.gov/18502989/",
  quote: "Active TMS was statistically superior to sham in treatment-resistant major depression.",
  ...overrides,
});

// ── SuggestionChip ────────────────────────────────────────────────────
export const createMockSuggestionChip = (
  overrides?: Partial<SuggestionChip>
): SuggestionChip => ({
  id: nextId("sug"),
  label: "Generate Protocol",
  type: "protocol",
  icon: "beaker",
  ...overrides,
});

// ── ConditionItem ─────────────────────────────────────────────────────
export const createMockConditionItem = (): ConditionItem[] => [
  {
    id: "cond-001",
    name: "Major Depressive Disorder",
    category: "Mood Disorders",
    icd10Code: "F33",
    commonModes: ["rTMS", "tDCS"],
    description: "Persistent feelings of sadness and loss of interest",
  },
  {
    id: "cond-002",
    name: "Generalized Anxiety Disorder",
    category: "Anxiety Disorders",
    icd10Code: "F41.1",
    commonModes: ["tDCS", "neurofeedback"],
    description: "Excessive, uncontrollable worry about everyday things",
  },
  {
    id: "cond-003",
    name: "ADHD",
    category: "Neurodevelopmental",
    icd10Code: "F90.0",
    commonModes: ["neurofeedback", "tDCS"],
    description: "Inattention, hyperactivity, and impulsivity",
  },
  {
    id: "cond-004",
    name: "PTSD",
    category: "Trauma Disorders",
    icd10Code: "F43.10",
    commonModes: ["rTMS", "tDCS"],
    description: "Post-traumatic stress disorder",
  },
  {
    id: "cond-005",
    name: "Schizophrenia",
    category: "Psychotic Disorders",
    icd10Code: "F20.9",
    commonModes: ["rTMS", "tDCS"],
    description: "Auditory hallucinations, negative symptoms",
  },
  {
    id: "cond-006",
    name: "Chronic Pain",
    category: "Pain Disorders",
    icd10Code: "G89.2",
    commonModes: ["rTMS", "tDCS"],
    description: "Persistent pain syndromes",
  },
];

// ── ModalityItem ──────────────────────────────────────────────────────
export const createMockModalityItem = (): ModalityItem[] => [
  {
    id: "mod-001",
    name: "Repetitive Transcranial Magnetic Stimulation",
    mode: "rTMS",
    description: "Non-invasive brain stimulation using magnetic pulses",
    contraindications: ["Metal implants near coil", "Seizure disorder", "Pacemaker"],
    typicalDuration: "20-40 minutes",
    frequency: "Daily, 5 days/week",
  },
  {
    id: "mod-002",
    name: "Transcranial Direct Current Stimulation",
    mode: "tDCS",
    description: "Low-intensity constant current stimulation",
    contraindications: ["Skull defects", "Skin lesions under electrodes"],
    typicalDuration: "20 minutes",
    frequency: "Daily or every other day",
  },
  {
    id: "mod-003",
    name: "Neurofeedback",
    mode: "neurofeedback",
    description: "Real-time EEG feedback for self-regulation training",
    contraindications: ["Inability to follow instructions"],
    typicalDuration: "30-45 minutes",
    frequency: "2-3 times/week",
  },
  {
    id: "mod-004",
    name: "Transcranial Alternating Current Stimulation",
    mode: "tACS",
    description: "Oscillating current at specific frequencies",
    contraindications: ["Epilepsy", "Brain lesions"],
    typicalDuration: "20 minutes",
    frequency: "Daily or every other day",
  },
];

// ── Dashboard Mock Helpers ────────────────────────────────────────────
export const createMockPendingProtocol = (
  overrides?: Partial<PendingProtocol>
): PendingProtocol => ({
  id: nextId("pp"),
  patientInitials: "J.D.",
  condition: "Major Depressive Disorder",
  mode: "rTMS",
  submittedDate: "2024-12-18",
  status: "pending_review",
  priority: "normal",
  ...overrides,
});

export const createMockActiveTreatment = (
  overrides?: Partial<ActiveTreatment>
): ActiveTreatment => ({
  id: nextId("tx"),
  patientInitials: "R.L.",
  protocolName: "DLPFC rTMS Depression",
  currentSession: 18,
  totalSessions: 20,
  mode: "rTMS",
  startDate: "2024-11-01",
  ...overrides,
});

export const createMockRecentAnalysis = (
  overrides?: Partial<RecentAnalysis>
): RecentAnalysis => ({
  id: nextId("an"),
  type: "qEEG",
  patientInitials: "J.D.",
  date: "2024-12-18 09:30",
  status: "completed",
  summary: "Elevated frontal theta",
  ...overrides,
});

export const createMockAiAlert = (overrides?: Partial<AiAlert>): AiAlert => ({
  id: nextId("al"),
  message: "Elevated seizure risk detected",
  severity: "warning",
  timestamp: "15 min ago",
  source: "SafetyMonitor",
  dismissed: false,
  ...overrides,
});
