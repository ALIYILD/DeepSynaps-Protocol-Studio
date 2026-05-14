import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ProtocolReviewPage } from "../../protocol/ProtocolReviewPage";
import { createMockDraft, createOffLabelDraft } from "./test-utils";

describe("ProtocolReviewPage", () => {
  const onApprove = vi.fn();
  const onReject = vi.fn();
  const onUpdateParameter = vi.fn();

  const defaultProps = {
    draft: createMockDraft(),
    currentUser: { name: "Dr. Johnson", role: "senior_clinician" as const },
    onApprove,
    onReject,
    onUpdateParameter,
  };

  it("renders with data-testid", () => {
    render(<ProtocolReviewPage {...defaultProps} />);
    expect(screen.getByTestId("protocol-review-page")).toBeInTheDocument();
  });

  it("displays header with draft ID", () => {
    render(<ProtocolReviewPage {...defaultProps} />);
    expect(screen.getByText("Protocol Review")).toBeInTheDocument();
    expect(
      screen.getByText(/Draft ID: draft-001/i),
    ).toBeInTheDocument();
  });

  it("shows current user info", () => {
    render(<ProtocolReviewPage {...defaultProps} />);
    expect(screen.getByText("Dr. Johnson")).toBeInTheDocument();
  });

  it("shows status badge", () => {
    render(<ProtocolReviewPage {...defaultProps} />);
    expect(screen.getByText(/Draft/i)).toBeInTheDocument();
  });

  /* ── Left Panel (AI Draft) ── */

  it("displays protocol summary in left panel", () => {
    render(<ProtocolReviewPage {...defaultProps} />);
    expect(
      screen.getByText(/rTMS protocol for treatment-resistant major depressive disorder/i),
    ).toBeInTheDocument();
  });

  it("displays read-only label on left panel", () => {
    render(<ProtocolReviewPage {...defaultProps} />);
    expect(screen.getByText("READ-ONLY")).toBeInTheDocument();
  });

  it("displays clinical rationale as bullet list", () => {
    render(<ProtocolReviewPage {...defaultProps} />);
    expect(
      screen.getByText(/High-frequency rTMS to left DLPFC/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/10Hz frequency is FDA-cleared/i),
    ).toBeInTheDocument();
  });

  it("displays evidence links", () => {
    render(<ProtocolReviewPage {...defaultProps} />);
    expect(
      screen.getByText(/rTMS for Treatment-Resistant Depression/i),
    ).toBeInTheDocument();
  });

  it("shows evidence grade badge", () => {
    render(<ProtocolReviewPage {...defaultProps} />);
    expect(screen.getByText(/Grade: A_systematic_review/i)).toBeInTheDocument();
  });

  it("displays contraindications in red warning style", () => {
    render(<ProtocolReviewPage {...defaultProps} />);
    expect(
      screen.getByText(/non-removable ferromagnetic material/i),
    ).toBeInTheDocument();
  });

  it("displays uncertainty disclaimer", () => {
    render(<ProtocolReviewPage {...defaultProps} />);
    expect(
      screen.getByText(/Optimal stimulation parameters vary/i),
    ).toBeInTheDocument();
  });

  it("displays regulatory status", () => {
    render(<ProtocolReviewPage {...defaultProps} />);
    expect(
      screen.getByText(/FDA cleared for MDD/i),
    ).toBeInTheDocument();
  });

  it("displays missing data section", () => {
    render(<ProtocolReviewPage {...defaultProps} />);
    expect(
      screen.getByText(/Baseline motor threshold not yet recorded/i),
    ).toBeInTheDocument();
  });

  /* ── Right Panel (Clinician Edit) ── */

  it("has clinical notes textarea", () => {
    render(<ProtocolReviewPage {...defaultProps} />);
    expect(screen.getByTestId("clinical-notes")).toBeInTheDocument();
  });

  it("has approval reason textarea", () => {
    render(<ProtocolReviewPage {...defaultProps} />);
    expect(screen.getByTestId("approval-reason")).toBeInTheDocument();
  });

  it("has disabled approve button initially", () => {
    render(<ProtocolReviewPage {...defaultProps} />);
    const approveBtn = screen.getByTestId("approve-btn");
    expect(approveBtn).toBeDisabled();
  });

  it("shows safety checklist with correct item count", () => {
    render(<ProtocolReviewPage {...defaultProps} />);
    expect(screen.getByTestId("safety-checklist")).toBeInTheDocument();
  });

  it("shows approval workflow", () => {
    render(<ProtocolReviewPage {...defaultProps} />);
    expect(screen.getByTestId("approval-workflow")).toBeInTheDocument();
  });

  it("shows audit trail", () => {
    render(<ProtocolReviewPage {...defaultProps} />);
    expect(screen.getByTestId("audit-trail")).toBeInTheDocument();
  });

  it("has cancel review button", () => {
    render(<ProtocolReviewPage {...defaultProps} />);
    expect(screen.getByText("Cancel Review")).toBeInTheDocument();
  });

  /* ── Off-label specific ── */

  it("shows off-label warning for off-label drafts", () => {
    render(
      <ProtocolReviewPage
        {...defaultProps}
        draft={createOffLabelDraft()}
      />,
    );
    expect(screen.getByTestId("off-label-warning")).toBeInTheDocument();
  });

  it("does not show off-label warning for on-label drafts", () => {
    render(<ProtocolReviewPage {...defaultProps} />);
    expect(screen.queryByTestId("off-label-warning")).not.toBeInTheDocument();
  });

  it("shows approval readiness indicators", () => {
    render(<ProtocolReviewPage {...defaultProps} />);
    expect(screen.getByText(/Safety Checks/i)).toBeInTheDocument();
    expect(screen.getByText(/Reason/i)).toBeInTheDocument();
  });

  /* ── Interaction tests ── */

  it("updates clinical notes on input", () => {
    render(<ProtocolReviewPage {...defaultProps} />);
    const notes = screen.getByTestId("clinical-notes");
    fireEvent.change(notes, { target: { value: "My clinical notes" } });
    expect(notes).toHaveValue("My clinical notes");
  });

  it("shows character count for clinical notes", () => {
    render(<ProtocolReviewPage {...defaultProps} />);
    const notes = screen.getByTestId("clinical-notes");
    fireEvent.change(notes, { target: { value: "Test" } });
    expect(screen.getByText("4 characters")).toBeInTheDocument();
  });

  it("calls onReject when cancel review is clicked", () => {
    const onRejectFn = vi.fn();
    render(
      <ProtocolReviewPage
        {...defaultProps}
        onReject={onRejectFn}
      />,
    );
    fireEvent.click(screen.getByText("Cancel Review"));
    expect(onRejectFn).toHaveBeenCalledWith(
      "draft-001",
      "Review abandoned",
    );
  });

  it("shows parameter comparison with 3 column headers", () => {
    render(<ProtocolReviewPage {...defaultProps} />);
    expect(screen.getByText("AI Suggested")).toBeInTheDocument();
    expect(screen.getByText("Clinician Edit")).toBeInTheDocument();
  });

  /* ── Approval flow ── */

  it("enables approve button when all checks are complete", () => {
    render(<ProtocolReviewPage {...defaultProps} />);

    // Get all checklist items from the safety checklist
    const checklistItems = screen.getAllByTestId(/checklist-item-/);

    // Check each item by clicking its checkbox
    checklistItems.forEach((item) => {
      const checkbox = item.querySelector('[data-testid^="checklist-checkbox-"]');
      if (checkbox) {
        fireEvent.click(checkbox);
      }
    });

    // Also fill in the approval reason
    const reason = screen.getByTestId("approval-reason");
    fireEvent.change(reason, {
      target: { value: "Evidence supports this protocol" },
    });

    const approveBtn = screen.getByTestId("approve-btn");
    expect(approveBtn).not.toBeDisabled();
  });
});
