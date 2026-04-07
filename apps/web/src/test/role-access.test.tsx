import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchAuditTrailForRole, submitReviewAction } from "../lib/api/services";
import { renderApp } from "./renderApp";

vi.mock("../lib/api/services", () => ({
  fetchAuditTrailForRole: vi.fn(),
  submitReviewAction: vi.fn(),
}));

const mockedFetchAuditTrailForRole = vi.mocked(fetchAuditTrailForRole);
const mockedSubmitReviewAction = vi.mocked(submitReviewAction);

describe("Role switch access changes", () => {
  beforeEach(() => {
    mockedFetchAuditTrailForRole.mockReset();
    mockedSubmitReviewAction.mockReset();
  });

  it("updates governance access when the role changes from guest to admin", async () => {
    mockedFetchAuditTrailForRole.mockResolvedValue({
      items: [],
      disclaimers: {
        professionalUseOnly: "For professional use only.",
        clinicianJudgment: "Not a substitute for clinician judgment.",
      },
    });

    const user = userEvent.setup();
    renderApp({ route: "/governance-safety", state: { role: "guest" } });

    expect(screen.getByText("Admin governance view required")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Role switcher"), "admin");

    expect(await screen.findByText("Audit trail preview")).toBeInTheDocument();
    expect(mockedFetchAuditTrailForRole).toHaveBeenCalledWith("admin");
  });
});
