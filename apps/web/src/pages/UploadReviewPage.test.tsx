import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../lib/api/client";
import { generateCaseSummary, submitReviewAction } from "../lib/api/services";
import { renderApp } from "../test/renderApp";

vi.mock("../lib/api/services", () => ({
  generateCaseSummary: vi.fn(),
  submitReviewAction: vi.fn(),
}));

const mockedGenerateCaseSummary = vi.mocked(generateCaseSummary);
const mockedSubmitReviewAction = vi.mocked(submitReviewAction);

describe("UploadReviewPage", () => {
  beforeEach(() => {
    mockedGenerateCaseSummary.mockReset();
    mockedSubmitReviewAction.mockReset();
  });

  it("shows the core clinician warning banner", () => {
    renderApp({ route: "/upload-review", state: { role: "clinician" } });

    expect(screen.getByText(/staged files are simulated only, require clinician interpretation/i)).toBeInTheDocument();
  });

  it("shows backend warning details when case summary generation fails", async () => {
    mockedGenerateCaseSummary.mockRejectedValue(
      new ApiError({
        code: "insufficient_role",
        message: "Clinician access is required for this action.",
        status: 403,
        warnings: ["Upload review requires clinician or admin access."],
      }),
    );

    const user = userEvent.setup();
    renderApp({ route: "/upload-review", state: { role: "clinician" } });

    await user.click(screen.getByRole("button", { name: /add intake form/i }));

    expect(await screen.findByText("Summary unavailable")).toBeInTheDocument();
    expect(screen.getByText("Upload review requires clinician or admin access.")).toBeInTheDocument();
  });
});
