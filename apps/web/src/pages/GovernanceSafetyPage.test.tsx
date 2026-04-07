import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchAuditTrailForRole, submitReviewAction } from "../lib/api/services";
import { renderApp } from "../test/renderApp";

vi.mock("../lib/api/services", () => ({
  fetchAuditTrailForRole: vi.fn(),
  submitReviewAction: vi.fn(),
}));

const mockedFetchAuditTrailForRole = vi.mocked(fetchAuditTrailForRole);
const mockedSubmitReviewAction = vi.mocked(submitReviewAction);

describe("GovernanceSafetyPage", () => {
  beforeEach(() => {
    mockedFetchAuditTrailForRole.mockReset();
    mockedSubmitReviewAction.mockReset();
  });

  it("renders persisted audit entries for admin users", async () => {
    mockedFetchAuditTrailForRole.mockResolvedValue({
      items: [
        {
          eventId: "evt-1005",
          targetId: "proto-parkinsons-tps",
          targetType: "protocol",
          action: "reviewed",
          role: "clinician",
          note: "Clinician review completed during runtime verification.",
          createdAt: "2026-04-07T08:32:04Z",
        },
      ],
      disclaimers: {
        professionalUseOnly: "For professional use only.",
        clinicianJudgment: "Not a substitute for clinician judgment.",
      },
    });

    renderApp({ route: "/governance-safety", state: { role: "admin" } });

    expect(await screen.findByText(/2026-04-07T08:32:04Z \/ reviewed \/ clinician/i)).toBeInTheDocument();
  });
});
