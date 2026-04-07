import {
  AssessmentTemplate,
  DeviceRecord,
  EvidenceItem,
  FeatureMatrixRow,
  GovernanceItem,
  KnowledgeNote,
  PricingTier,
  ReviewQueueItem,
  RoleProfile,
  UploadedAsset,
  WorkspaceAlert,
  WorkspaceDocument,
  WorkspaceMetric,
} from "../types/domain";

export const roleProfiles: RoleProfile[] = [
  {
    role: "guest",
    label: "Guest",
    description: "Read-only workspace access with strong clinical boundary language.",
    permissions: ["Browse evidence and pricing", "Inspect sample device records", "See gated workflows"],
  },
  {
    role: "clinician",
    label: "Verified Clinician",
    description: "Professional workspace access for evidence review, assessment drafting, and upload triage.",
    permissions: [
      "Use assessment builder",
      "Inspect clinician library content",
      "Review staged uploads and case summaries",
    ],
  },
  {
    role: "admin",
    label: "Admin",
    description: "Operational control over review workflows, governance views, and access policies.",
    permissions: [
      "Manage evidence governance",
      "Review audit trail previews",
      "Configure access posture and enterprise visibility",
    ],
  },
];

export const workspaceMetrics: WorkspaceMetric[] = [
  {
    id: "m1",
    label: "Evidence-backed records",
    value: "42",
    delta: "6 newly curated",
    detail: "Clinical library entries with structured evidence summaries and regulatory posture notes.",
  },
  {
    id: "m2",
    label: "Staged assessments",
    value: "14",
    delta: "3 saved this week",
    detail: "In-memory drafts across intake, symptom tracking, and readiness workflows.",
  },
  {
    id: "m3",
    label: "Uploads awaiting review",
    value: "5",
    delta: "2 flagged red",
    detail: "Professional review queue items staged without permanent storage in the MVP.",
  },
];

export const workspaceAlerts: WorkspaceAlert[] = [
  {
    id: "a1",
    title: "Clinical use boundary",
    body: "DeepSynaps Studio supports evidence review and documentation. It is not an autonomous diagnosis or treatment system.",
    tone: "warning",
  },
  {
    id: "a2",
    title: "Upload review notice",
    body: "Staged uploads remain transient in this MVP and require clinician interpretation before any operational use.",
    tone: "info",
  },
  {
    id: "a3",
    title: "Governance policy synced",
    body: "Off-label labeling language and human review guidance are current across the workspace.",
    tone: "success",
  },
];

export const workspaceDocuments: WorkspaceDocument[] = [
  {
    id: "d1",
    title: "Parkinson's disease intake builder pack",
    section: "Assessment Builder",
    status: "approved",
    audience: "Clinician",
    updatedAt: "2 hours ago",
    owner: "Movement Disorders Team",
    summary: "Structured intake package with readiness checks, contraindication prompts, and professional review framing.",
    evidence: "Guideline",
  },
  {
    id: "d2",
    title: "Motor symptom modulation library note",
    section: "Evidence Library",
    status: "review",
    audience: "Clinician",
    updatedAt: "Today",
    owner: "Evidence Curation Unit",
    summary: "Curated evidence entry comparing structured methods, contraindications, and approved versus emerging posture.",
    evidence: "Systematic Review",
  },
  {
    id: "d3",
    title: "Device registry sample set",
    section: "Device Registry",
    status: "approved",
    audience: "Professional",
    updatedAt: "Yesterday",
    owner: "Clinical Operations",
    summary: "Sample-only device catalog with clear notice that entries are MVP data rather than real regulatory claims.",
    evidence: "Registry",
  },
  {
    id: "d4",
    title: "Clinician upload workspace brief",
    section: "Upload Review",
    status: "restricted",
    audience: "Clinician",
    updatedAt: "1 hour ago",
    owner: "Review Queue",
    summary: "Simulated upload review with case summary generation from staged metadata only.",
    evidence: "Consensus",
  },
  {
    id: "d5",
    title: "Governance and safety handbook",
    section: "Governance / Safety",
    status: "approved",
    audience: "Admin",
    updatedAt: "4 days ago",
    owner: "Governance Office",
    summary: "Human review workflow, audit trail preview, evidence grading rules, and off-label labeling policy.",
    evidence: "Guideline",
  },
];

export const reviewQueue: ReviewQueueItem[] = [
  {
    id: "r1",
    fileName: "motor-assessment-scan.pdf",
    submittedBy: "Clinic North",
    submittedAt: "Today, 08:10",
    state: "pending",
    reviewerNote: "Match findings against structured motor symptom evidence before internal use.",
  },
  {
    id: "r2",
    fileName: "qeeg-summary-sessionA.pdf",
    submittedBy: "Ops Admin",
    submittedAt: "Yesterday, 16:40",
    state: "escalated",
    reviewerNote: "Requires clinician review because the upload suggests cognitive fatigue with mixed red flags.",
  },
  {
    id: "r3",
    fileName: "reviewed-readiness-checklist.pdf",
    submittedBy: "Verified Clinician",
    submittedAt: "Yesterday, 11:05",
    state: "accepted",
    reviewerNote: "Accepted as a sample readiness reference for the workspace.",
  },
];

export const knowledgeNotes: KnowledgeNote[] = [
  {
    id: "k1",
    title: "Professional interpretation boundary",
    category: "Governance",
    summary: "Workspace content informs professional interpretation and review. It never replaces clinician judgment.",
    evidence: "Guideline",
  },
  {
    id: "k2",
    title: "Deterministic MVP posture",
    category: "Platform Model",
    summary: "The MVP remains registry-driven and in-memory, with no permanent storage and no generative treatment composition.",
    evidence: "Registry",
  },
  {
    id: "k3",
    title: "Evidence grading overview",
    category: "Safety Layer",
    summary: "Evidence strength, regulatory posture, and contraindication status are shown together for review consistency.",
    evidence: "Consensus",
  },
];

export const evidenceLibrary: EvidenceItem[] = [
  {
    id: "e1",
    title: "Parkinson's motor symptom neuromodulation review",
    condition: "Parkinson's disease",
    symptomCluster: "Motor symptoms",
    modality: "TPS",
    evidenceLevel: "Systematic Review",
    regulatoryStatus: "Emerging",
    summary: "Structured review of motor symptom support with strongest signals around gait and motor initiation in supervised use.",
    evidenceStrength: "Moderate evidence for supervised professional exploration with selective patient matching.",
    supportedMethods: [
      "Structured clinician intake",
      "Motor symptom baseline review",
      "Session-by-session monitoring",
    ],
    contraindications: [
      "Unreviewed implant status",
      "Unstable neurologic presentation without specialist oversight",
      "Poor tolerability history with prior neuromodulation",
    ],
    references: [
      "Movement Disorders Review 2024",
      "Neuromodulation Methods Consensus 2023",
      "Internal Evidence Curation Memo A-17",
    ],
    relatedDevices: ["NEUROLITH", "PulseArc Clinical"],
    approvedNotes: [
      "Use only inside clinician-led workflows.",
      "Monitoring and adverse event capture are expected for each session block.",
    ],
    emergingNotes: [
      "Target specificity remains an evolving area.",
      "Longitudinal follow-up evidence is still comparatively limited.",
    ],
  },
  {
    id: "e2",
    title: "Attention regulation support profile",
    condition: "ADHD",
    symptomCluster: "Attention regulation",
    modality: "Neurofeedback",
    evidenceLevel: "Consensus",
    regulatoryStatus: "Research Use",
    summary: "Professional consensus supports structured baseline review, symptom tracking, and supervised iterative adjustments.",
    evidenceStrength: "Developing but clinically organized evidence with high dependence on protocol quality.",
    supportedMethods: ["Baseline review", "Session adherence tracking", "Clinician interpretation of progress trends"],
    contraindications: [
      "Insufficient baseline data quality",
      "Inability to maintain session consistency",
      "Concurrent instability requiring acute review",
    ],
    references: [
      "Clinical Neurofeedback Forum 2024",
      "Practice Parameters Summary 2022",
    ],
    relatedDevices: ["CogniTrace NF", "FocusLoop Hybrid"],
    approvedNotes: [
      "Use structured symptom tracking rather than informal subjective logging alone.",
    ],
    emergingNotes: [
      "Comparative modality selection still varies across clinics and evidence bodies.",
    ],
  },
  {
    id: "e3",
    title: "Mood symptom modulation evidence map",
    condition: "Depression",
    symptomCluster: "Mood symptoms",
    modality: "TMS",
    evidenceLevel: "Guideline",
    regulatoryStatus: "Approved",
    summary: "Guideline-backed evidence profile with clearer operational maturity, contraindication review requirements, and established clinician oversight expectations.",
    evidenceStrength: "High evidence strength within governed professional pathways.",
    supportedMethods: [
      "Contraindication checklist",
      "Structured readiness assessment",
      "Adverse event monitoring",
    ],
    contraindications: [
      "Seizure risk not assessed",
      "Medication interaction review incomplete",
      "No supervising professional pathway in place",
    ],
    references: [
      "Professional Neuromodulation Guideline 2025",
      "Clinical Safety Statement 2024",
    ],
    relatedDevices: ["PulseArc Clinical", "CortexLine 8"],
    approvedNotes: [
      "Operational pathways are mature when review workflows are followed.",
    ],
    emergingNotes: [
      "Symptom cluster personalization is still evolving beyond established baseline protocols.",
    ],
  },
];

export const deviceRegistry: DeviceRecord[] = [
  {
    id: "dev1",
    name: "NEUROLITH",
    manufacturer: "Sample Clinical Systems",
    modality: "TPS",
    channels: 1,
    useType: "Clinic",
    regions: ["EU sample", "UK sample"],
    regulatoryStatus: "Emerging",
    summary: "Sample clinic-based TPS entry used to demonstrate registry search, filters, and review detail patterns.",
    bestFor: ["Supervised professional workflows", "Motor symptom exploration", "Device setup training"],
    constraints: [
      "Sample MVP entry only",
      "Requires clinician review of contraindications and target logic",
      "Not a real regulatory claim",
    ],
    sampleDataNotice: "This registry entry is example MVP data and does not represent a real device clearance claim.",
  },
  {
    id: "dev2",
    name: "PulseArc Clinical",
    manufacturer: "NeuroAxis Demo",
    modality: "TMS",
    channels: 8,
    useType: "Clinic",
    regions: ["US sample", "EU sample"],
    regulatoryStatus: "Approved",
    summary: "Sample clinic-facing TMS system record for comparing workflows, channels, and access tiers.",
    bestFor: ["Mood symptom programs", "Clinic team scheduling", "Supervised protocol review"],
    constraints: [
      "Clinician supervision expected",
      "Sample-only data for UI demonstration",
    ],
    sampleDataNotice: "This registry entry is sample MVP data, not a statement of actual regulatory standing.",
  },
  {
    id: "dev3",
    name: "FocusLoop Hybrid",
    manufacturer: "Attention Labs Demo",
    modality: "Neurofeedback",
    channels: 16,
    useType: "Hybrid",
    regions: ["Canada sample", "EU sample"],
    regulatoryStatus: "Research Use",
    summary: "Hybrid neurofeedback sample record highlighting both professional oversight and staged home follow-up patterns.",
    bestFor: ["Attention regulation", "Baseline review", "Tracking adherence"],
    constraints: [
      "Research-oriented sample posture",
      "Requires explicit professional interpretation",
    ],
    sampleDataNotice: "This registry entry is illustrative MVP content rather than a real regulatory declaration.",
  },
  {
    id: "dev4",
    name: "LumaBand Home",
    manufacturer: "Photonics Demo",
    modality: "PBM",
    channels: 4,
    useType: "Home",
    regions: ["US sample"],
    regulatoryStatus: "Research Use",
    summary: "Home-use sample registry card included to show consumer-adjacent gating and clear evidence caution language.",
    bestFor: ["Guided follow-up workflows", "Professional review staging"],
    constraints: [
      "Home-use records require stricter role-based explanation",
      "Sample-only record for access matrix demonstrations",
    ],
    sampleDataNotice: "This registry entry is sample MVP content and must not be read as a real product claim.",
  },
];

export const assessmentTemplates: AssessmentTemplate[] = [
  {
    id: "intake-assessment",
    title: "Intake assessment",
    description: "Foundational clinician-facing intake template for initial history, goals, and review context.",
    sections: [
      {
        id: "context",
        title: "Clinical context",
        fields: [
          { id: "presenting-concern", label: "Presenting concern", type: "textarea", required: true, helpText: "Summarize the referral reason and immediate clinical context." },
          { id: "primary-condition", label: "Primary condition", type: "select", required: true, helpText: "Choose the condition anchor for this review.", options: ["Parkinson's disease", "ADHD", "Depression", "Anxiety"] },
          { id: "care-setting", label: "Care setting", type: "select", required: true, helpText: "Capture where the review is being performed.", options: ["Clinic", "Specialist practice", "Research program"] },
        ],
      },
      {
        id: "goals",
        title: "Treatment goals",
        fields: [
          { id: "goal-summary", label: "Goal summary", type: "textarea", required: true, helpText: "State the target outcomes in professional language." },
          { id: "baseline-severity", label: "Baseline severity", type: "number", required: true, helpText: "Use the team's preferred severity scale value." },
        ],
      },
    ],
  },
  {
    id: "symptom-tracking",
    title: "Symptom tracking",
    description: "Ongoing symptom and response review for structured follow-up.",
    sections: [
      {
        id: "tracking",
        title: "Tracking inputs",
        fields: [
          { id: "cluster", label: "Symptom cluster", type: "select", required: true, helpText: "Choose the tracked domain.", options: ["Motor symptoms", "Mood symptoms", "Attention regulation", "Sleep disturbance"] },
          { id: "trend", label: "Observed trend", type: "textarea", required: true, helpText: "Describe progression or change since the prior review." },
          { id: "severity", label: "Current severity", type: "number", required: true, helpText: "Enter the current structured severity score." },
        ],
      },
    ],
  },
  {
    id: "contraindication-checklist",
    title: "Contraindication checklist",
    description: "Structured confirmation of contraindication status before advancing a workflow.",
    sections: [
      {
        id: "screening",
        title: "Screening",
        fields: [
          { id: "implant-review", label: "Implant review completed", type: "checkbox", required: false, helpText: "Confirm implant and hardware status was reviewed." },
          { id: "medication-review", label: "Medication review completed", type: "checkbox", required: false, helpText: "Confirm medication interactions were reviewed." },
          { id: "notes", label: "Contraindication notes", type: "textarea", required: true, helpText: "Capture any findings that require escalation." },
        ],
      },
    ],
  },
  {
    id: "adverse-event-monitoring",
    title: "Adverse event monitoring",
    description: "Structured adverse event capture and escalation review.",
    sections: [
      {
        id: "event-log",
        title: "Event log",
        fields: [
          { id: "event-summary", label: "Event summary", type: "textarea", required: true, helpText: "Describe the event, timing, and observed response." },
          { id: "severity-band", label: "Severity band", type: "select", required: true, helpText: "Choose the seriousness tier.", options: ["Low", "Moderate", "High"] },
          { id: "escalated", label: "Escalated for review", type: "checkbox", required: false, helpText: "Mark whether a senior clinician review was triggered." },
        ],
      },
    ],
  },
  {
    id: "treatment-readiness",
    title: "Treatment readiness checklist",
    description: "Readiness checklist used before entering an active protocol phase.",
    sections: [
      {
        id: "readiness",
        title: "Readiness status",
        fields: [
          { id: "informed-review", label: "Informed review completed", type: "checkbox", required: false, helpText: "Confirm the professional review conversation is complete." },
          { id: "baseline-complete", label: "Baseline complete", type: "checkbox", required: false, helpText: "Confirm the baseline assessment is sufficiently complete." },
          { id: "readiness-summary", label: "Readiness summary", type: "textarea", required: true, helpText: "Summarize why the case is or is not ready." },
        ],
      },
    ],
  },
  {
    id: "neurofeedback-baseline",
    title: "Neurofeedback baseline review",
    description: "Baseline review template for neurofeedback-oriented professional workflows.",
    sections: [
      {
        id: "baseline",
        title: "Baseline review",
        fields: [
          { id: "signal-quality", label: "Signal quality", type: "select", required: true, helpText: "Capture the quality of baseline inputs.", options: ["Good", "Mixed", "Poor"] },
          { id: "baseline-notes", label: "Baseline notes", type: "textarea", required: true, helpText: "Describe any baseline interpretation caveats." },
          { id: "follow-up-focus", label: "Follow-up focus", type: "text", required: true, helpText: "State the planned area of monitoring emphasis." },
        ],
      },
    ],
  },
];

export const stagedUploadExamples: UploadedAsset[] = [
  {
    id: "u1",
    type: "PDF",
    fileName: "history-summary.pdf",
    status: "staged",
    summary: "Referral history summary noting progressive motor slowing and gait hesitation.",
  },
  {
    id: "u2",
    type: "qEEG Summary",
    fileName: "qeeg-map-session1.pdf",
    status: "staged",
    summary: "Baseline qEEG summary with mixed frontal asymmetry comments and interpretive caveats.",
  },
  {
    id: "u3",
    type: "MRI Report",
    fileName: "brain-mri-report.pdf",
    status: "staged",
    summary: "Imaging note highlighting structural review completion and recommendation for clinician interpretation.",
  },
  {
    id: "u4",
    type: "Intake Form",
    fileName: "structured-intake-form.pdf",
    status: "staged",
    summary: "Completed intake form referencing balance concerns, medication history, and treatment goals.",
  },
  {
    id: "u5",
    type: "Clinician Notes",
    fileName: "consult-notes.docx",
    status: "reviewed",
    summary: "Consult note emphasizing symptom clustering, red flag watchpoints, and need for supervised progression.",
  },
];

export const governanceItems: GovernanceItem[] = [
  {
    id: "g1",
    title: "Evidence grading framework",
    body: "Every workspace artifact is presented with evidence level, regulatory posture, and clinical caveat language together.",
    bullets: [
      "Guideline and systematic review content appears with the strongest visual confidence.",
      "Consensus and registry materials remain available with explicit interpretation caution.",
      "Emerging content is marked separately and never presented as settled practice.",
    ],
  },
  {
    id: "g2",
    title: "Human review workflow",
    body: "Clinical content and staged uploads require human review before operational use.",
    bullets: [
      "Guest users see workflow framing but not gated review details.",
      "Verified clinicians can inspect staged case summaries and review notes.",
      "Admins can view governance posture, audit previews, and access layers.",
    ],
  },
  {
    id: "g3",
    title: "Off-label labeling policy",
    body: "Off-label or emerging material must be visually distinct and described without marketing or certainty language.",
    bullets: [
      "Approved versus emerging notes are always shown side by side.",
      "Evidence language must remain descriptive rather than prescriptive.",
      "Workspace output supports review, not autonomous treatment selection.",
    ],
  },
];

export const pricingTiers: PricingTier[] = [
  {
    id: "p1",
    name: "Free Explorer",
    price: "£0",
    description: "Read-only clinical workspace tour for professional evaluation and procurement review.",
    audience: "Individual evaluator",
    features: ["Dashboard", "Evidence library browsing", "Device registry sample view"],
  },
  {
    id: "p2",
    name: "Pro Clinician",
    price: "£89 / user / month",
    description: "Single professional seat with access to assessment drafting and upload review workflows.",
    audience: "Independent clinician",
    features: ["Assessment builder", "Handbook access", "Upload review workspace"],
  },
  {
    id: "p3",
    name: "Clinic Team",
    price: "£349 / month",
    description: "Team workspace for clinics that need shared review posture and internal governance visibility.",
    audience: "Clinic operations",
    features: ["Multi-role workspace", "Governance view", "Shared review queue"],
  },
  {
    id: "p4",
    name: "Enterprise / Manufacturer",
    price: "Custom",
    description: "Expanded access for organizations requiring enterprise governance, manufacturer collaboration, or procurement review.",
    audience: "Enterprise and manufacturer teams",
    features: ["Enterprise review posture", "Access governance", "Expanded commercial support"],
  },
];

export const featureMatrix: FeatureMatrixRow[] = [
  {
    feature: "Evidence Library",
    availability: {
      "Free Explorer": "Included",
      "Pro Clinician": "Included",
      "Clinic Team": "Included",
      "Enterprise / Manufacturer": "Included",
    },
  },
  {
    feature: "Device Registry sample view",
    availability: {
      "Free Explorer": "Included",
      "Pro Clinician": "Included",
      "Clinic Team": "Included",
      "Enterprise / Manufacturer": "Included",
    },
  },
  {
    feature: "Assessment Builder drafts",
    availability: {
      "Free Explorer": "Preview only",
      "Pro Clinician": "Included",
      "Clinic Team": "Included",
      "Enterprise / Manufacturer": "Included",
    },
  },
  {
    feature: "Upload Review Workspace",
    availability: {
      "Free Explorer": "Gated",
      "Pro Clinician": "Included",
      "Clinic Team": "Included",
      "Enterprise / Manufacturer": "Included",
    },
  },
  {
    feature: "Governance / Safety layer",
    availability: {
      "Free Explorer": "Summary only",
      "Pro Clinician": "Review view",
      "Clinic Team": "Included",
      "Enterprise / Manufacturer": "Included",
    },
  },
];

export const protocolGeneratorOptions = {
  conditions: ["Parkinson's disease", "ADHD", "Depression"] as const,
  symptomClusters: [
    "Motor symptoms",
    "Attention regulation",
    "Mood symptoms",
    "Cognitive fatigue",
  ] as const,
  modalities: ["TPS", "TMS", "Neurofeedback", "PBM"] as const,
  settings: ["Clinic", "Home"] as const,
  evidenceThresholds: ["Guideline", "Systematic Review", "Consensus", "Registry"] as const,
};

export const handbookKinds = [
  "Clinician handbook",
  "Patient guide",
  "Technician SOP",
] as const;
