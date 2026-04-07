import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderApp } from "./renderApp";

vi.mock("../lib/api/services", () => ({
  fetchEvidenceLibrary: vi.fn().mockResolvedValue({
    items: [],
    disclaimers: {
      professionalUseOnly: "For professional use only.",
      clinicianJudgment: "Not a substitute for clinician judgment.",
    },
  }),
  fetchDeviceRegistry: vi.fn().mockResolvedValue({
    items: [],
    disclaimers: {
      professionalUseOnly: "For professional use only.",
      clinicianJudgment: "Not a substitute for clinician judgment.",
    },
  }),
  generateCaseSummary: vi.fn().mockResolvedValue({
    presentingSymptoms: [],
    relevantFindings: [],
    redFlags: [],
    possibleTargets: [],
    suggestedModalities: [],
  }),
  generateProtocolDraft: vi.fn().mockResolvedValue({
    rationale: "Deterministic protocol rationale.",
    targetRegion: "Motor network review zone",
    sessionFrequency: "2 supervised sessions per week",
    duration: "25 minutes",
    escalationLogic: ["Escalate when needed."],
    monitoringPlan: ["Track weekly trend direction."],
    contraindications: ["Implant status not reviewed"],
    patientCommunicationNotes: ["Set review expectations clearly."],
    evidenceGrade: "Systematic Review",
    approvalStatusBadge: "clinician-reviewed draft",
    offLabelReviewRequired: false,
    disclaimers: {
      professionalUseOnly: "For professional use only.",
      clinicianJudgment: "Not a substitute for clinician judgment.",
    },
  }),
  generateHandbook: vi.fn().mockResolvedValue({
    document: {
      documentType: "clinician_handbook",
      title: "Clinician handbook",
      overview: "Overview",
      eligibility: ["Eligibility"],
      setup: ["Setup"],
      sessionWorkflow: ["Session workflow"],
      safety: ["Safety"],
      troubleshooting: ["Troubleshooting"],
      escalation: ["Escalation"],
      references: ["References"],
    },
    disclaimers: {
      professionalUseOnly: "For professional use only.",
      draftSupportOnly: "Draft support only.",
      clinicianJudgment: "Not a substitute for clinician judgment.",
    },
    exportTargets: ["pdf", "docx"],
  }),
  submitReviewAction: vi.fn().mockResolvedValue({
    event: {
      eventId: "evt-1001",
      targetId: "sample",
      targetType: "upload",
      action: "reviewed",
      role: "admin",
      note: "Saved.",
      createdAt: "2026-04-07T08:32:04Z",
    },
    disclaimers: {
      professionalUseOnly: "For professional use only.",
      clinicianJudgment: "Not a substitute for clinician judgment.",
    },
  }),
  fetchAuditTrailForRole: vi.fn().mockResolvedValue({
    items: [],
    disclaimers: {
      professionalUseOnly: "For professional use only.",
      clinicianJudgment: "Not a substitute for clinician judgment.",
    },
  }),
}));

describe("App route smoke tests", () => {
  it.each([
    ["/", "Premium clinical operations workspace"],
    ["/evidence-library", "Structured evidence review"],
    ["/device-registry", "Sample registry for professional review"],
    ["/assessment-builder", "Structured assessment drafting"],
    ["/protocols", "Deterministic protocol drafting"],
    ["/handbooks", "Deterministic document generator"],
    ["/upload-review", "Clinician-gated upload staging"],
    ["/governance-safety", "Human review and safety layer"],
    ["/pricing-access", "Access models for professional users"],
  ])("renders %s", async (route, title) => {
    renderApp({ route, state: { role: "admin" } });
    expect(await screen.findByText(title)).toBeInTheDocument();
  });
});
