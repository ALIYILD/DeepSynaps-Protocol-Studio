/**
 * Test utilities and mock data for Protocol Review & Approval Workflow tests.
 */
import type {
  ProtocolDraft,
  ProtocolParameter,
  EvidenceLink,
  AuditEntry,
  WorkflowComment,
  ProtocolVersion,
  ChecklistItem,
} from "../../protocol/protocolTypes";

export const mockEvidenceLinks: EvidenceLink[] = [
  {
    id: "e1",
    link: "https://pubmed.ncbi.nlm.nih.gov/12345678",
    url: "https://pubmed.ncbi.nlm.nih.gov/12345678",
    title: "rTMS for Treatment-Resistant Depression: A Meta-Analysis",
    grade: "A",
    year: 2023,
    retrievalSource: "pubmed",
    retrievedAt: "2024-01-15T10:00:00Z",
  },
  {
    id: "e2",
    link: "https://pubmed.ncbi.nlm.nih.gov/87654321",
    url: "https://pubmed.ncbi.nlm.nih.gov/87654321",
    title: "Theta-Burst Stimulation: Randomized Controlled Trial",
    grade: "B",
    year: 2022,
    retrievalSource: "pubmed",
    retrievedAt: "2024-01-15T10:00:00Z",
  },
];

export const mockParameters: ProtocolParameter[] = [
  {
    id: "p1",
    name: "Frequency",
    value: 10,
    unit: "Hz",
    range: [1, 50],
    min: 1,
    max: 50,
    required: true,
    aiSuggested: 10,
    clinicianEdit: 10,
  },
  {
    id: "p2",
    name: "Intensity",
    value: 80,
    unit: "% RMT",
    range: [50, 120],
    min: 50,
    max: 120,
    required: true,
    aiSuggested: 80,
    clinicianEdit: 85,
  },
  {
    id: "p3",
    name: "Pulse Count",
    value: 3000,
    unit: "pulses",
    range: [1000, 5000],
    min: 1000,
    max: 5000,
    required: true,
    aiSuggested: 3000,
  },
];

export const createMockDraft = (
  overrides: Partial<ProtocolDraft> = {},
): ProtocolDraft => ({
  draftId: "draft-001",
  status: "draft_requires_review",
  mode: "evidence_search",
  protocolSummary:
    "Repetitive transcranial magnetic stimulation (rTMS) protocol for treatment-resistant major depressive disorder. High-frequency (10Hz) stimulation applied to the left dorsolateral prefrontal cortex. 30 sessions over 6 weeks.",
  parameters: mockParameters,
  rationale: [
    "High-frequency rTMS to left DLPFC shows robust antidepressant effects in meta-analyses",
    "10Hz frequency is FDA-cleared for treatment-resistant depression",
    "3000 pulses per session aligns with standard clinical protocols",
    "80% RMT is within the therapeutic window with acceptable safety profile",
  ],
  evidenceLinks: mockEvidenceLinks,
  evidenceGrade: "A",
  regulatoryStatus: "FDA cleared for MDD (on-label)",
  offLabel: false,
  contraindications: [
    "Presence of non-removable ferromagnetic material in head",
    "History of seizure disorder (relative contraindication)",
    "Active substance use disorder",
  ],
  missingData: ["Baseline motor threshold not yet recorded"],
  uncertainty:
    "Optimal stimulation parameters vary across individuals. Response rates range from 30-60%. Durability of effects beyond 6 months remains uncertain.",
  createdAt: "2024-01-15T10:30:00Z",
  ...overrides,
});

export const createOffLabelDraft = (): ProtocolDraft =>
  createMockDraft({
    status: "blocked_requires_review",
    offLabel: true,
    offLabelWarning:
      "rTMS for bipolar depression is not FDA-cleared. Evidence is limited to small observational studies.",
    regulatoryStatus: null,
    protocolSummary:
      "rTMS protocol for bipolar II depression. Off-label application of high-frequency stimulation.",
    rationale: [
      "Limited evidence from open-label studies suggests potential efficacy",
      "Mood switching risk must be monitored closely",
    ],
    evidenceGrade: "C",
    contraindications: [
      "Bipolar I disorder (mania risk)",
      "Recent manic episode (<6 months)",
      "Rapid cycling pattern",
    ],
  });

export const mockAuditEntries: AuditEntry[] = [
  {
    id: "a1",
    timestamp: "2024-01-15T10:30:00Z",
    actor: "AI System",
    actorRole: "system_ai",
    action: "created",
    reason: "Initial draft generation",
  },
  {
    id: "a2",
    timestamp: "2024-01-15T11:00:00Z",
    actor: "Dr. Smith",
    actorRole: "reviewing_clinician",
    action: "reviewed",
    reason: "Started clinical review",
  },
  {
    id: "a3",
    timestamp: "2024-01-15T14:20:00Z",
    actor: "Dr. Johnson",
    actorRole: "senior_clinician",
    action: "approved",
    reason: "Evidence supports use; parameters within safe ranges",
  },
];

export const mockComments: WorkflowComment[] = [
  {
    id: "c1",
    timestamp: "2024-01-15T11:00:00Z",
    author: "Dr. Smith",
    authorRole: "reviewing_clinician",
    state: "under_review",
    message: "Beginning review. Evidence looks solid.",
  },
  {
    id: "c2",
    timestamp: "2024-01-15T12:30:00Z",
    author: "Dr. Smith",
    authorRole: "reviewing_clinician",
    state: "under_review",
    message: "Increased intensity from 80% to 85% RMT based on patient tolerance.",
  },
];

export const mockVersions: ProtocolVersion[] = [
  {
    version: 1,
    createdAt: "2024-01-15T10:30:00Z",
    createdBy: "AI System",
    changes: "Initial draft",
    draft: createMockDraft(),
  },
];

export const mockChecklistItems: ChecklistItem[] = [
  { id: "check1", label: "Reviewed evidence", required: true },
  { id: "check2", label: "Checked contraindications", required: true },
  { id: "check3", label: "Verified patient identity", required: true },
];

export const mockCurrentUser = {
  name: "Dr. Johnson",
  role: "senior_clinician" as const,
};
