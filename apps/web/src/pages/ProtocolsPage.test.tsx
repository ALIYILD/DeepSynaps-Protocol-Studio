import { screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { ApiError } from "../lib/api/client";
import { generateProtocolDraft } from "../lib/api/services";
import { renderApp } from "../test/renderApp";

vi.mock("../lib/api/services", () => ({
  generateProtocolDraft: vi.fn(),
}));

const mockedGenerateProtocolDraft = vi.mocked(generateProtocolDraft);

describe("ProtocolsPage", () => {
  beforeEach(() => {
    mockedGenerateProtocolDraft.mockReset();
  });

  it("shows a loading state before rendering the protocol preview", async () => {
    mockedGenerateProtocolDraft.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                rationale: "Deterministic rationale.",
                targetRegion: "Motor network review zone",
                sessionFrequency: "2 supervised sessions per week",
                duration: "25 minutes",
                escalationLogic: ["Escalate when needed."],
                monitoringPlan: ["Track trends weekly."],
                contraindications: ["Implant status not reviewed"],
                patientCommunicationNotes: ["Set expectations clearly."],
                evidenceGrade: "Systematic Review",
                approvalStatusBadge: "clinician-reviewed draft",
                offLabelReviewRequired: false,
                disclaimers: {
                  professionalUseOnly: "For professional use only.",
                  clinicianJudgment: "Not a substitute for clinician judgment.",
                },
              }),
            0,
          ),
        ),
    );

    renderApp({ route: "/protocols", state: { role: "clinician" } });

    expect(screen.getByText("Generating deterministic protocol draft from the API.")).toBeInTheDocument();
    expect(await screen.findByText("Generated protocol preview")).toBeInTheDocument();
  });

  it("shows protected-state messaging for unauthorized protocol generation", async () => {
    mockedGenerateProtocolDraft.mockRejectedValue(
      new ApiError({
        code: "forbidden_off_label",
        message: "Guest users cannot access off-label mode.",
        status: 403,
        warnings: ["Off-label pathways require independent clinical review."],
      }),
    );

    renderApp({ route: "/protocols", state: { role: "guest" } });

    expect(await screen.findByText("Protected workflow")).toBeInTheDocument();
    expect(screen.getByText("Off-label pathways require independent clinical review.")).toBeInTheDocument();
  });
});
