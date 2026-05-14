import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ApprovalWorkflow } from "../../protocol/ApprovalWorkflow";
import type {
  WorkflowState,
  WorkflowComment,
  ProtocolVersion,
  ClinicalRole,
} from "../../protocol/protocolTypes";

describe("ApprovalWorkflow", () => {
  const mockComments: WorkflowComment[] = [
    {
      id: "c1",
      timestamp: "2024-01-15T11:00:00Z",
      author: "Dr. Smith",
      authorRole: "reviewing_clinician",
      state: "under_review",
      message: "Beginning review.",
    },
  ];

  const mockVersions: ProtocolVersion[] = [
    {
      version: 1,
      createdAt: "2024-01-15T10:30:00Z",
      createdBy: "AI System",
      changes: "Initial draft",
      draft: {} as Record<string, unknown>,
    },
  ];

  const defaultProps = {
    currentState: "under_review" as WorkflowState,
    comments: mockComments,
    versions: mockVersions,
    onStateTransition: vi.fn(),
    onAddComment: vi.fn(),
    currentUser: { name: "Dr. Johnson", role: "senior_clinician" as ClinicalRole },
  };

  it("renders with data-testid", () => {
    render(<ApprovalWorkflow {...defaultProps} />);
    expect(screen.getByTestId("approval-workflow")).toBeInTheDocument();
  });

  it("displays all workflow steps", () => {
    render(<ApprovalWorkflow {...defaultProps} />);

    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByText("Under Review")).toBeInTheDocument();
    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.getByText("Prescribed")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("highlights current state step", () => {
    render(<ApprovalWorkflow {...defaultProps} />);
    const currentStep = screen.getByTestId("workflow-step-under_review");
    expect(currentStep).toBeInTheDocument();
  });

  it("has reject button always available", () => {
    render(<ApprovalWorkflow {...defaultProps} />);
    expect(screen.getByTestId("reject-btn")).toBeInTheDocument();
  });

  it("shows rejection panel with reason textarea when reject clicked", () => {
    render(<ApprovalWorkflow {...defaultProps} />);

    fireEvent.click(screen.getByTestId("reject-btn"));
    expect(screen.getByTestId("rejection-panel")).toBeInTheDocument();
    expect(screen.getByTestId("rejection-reason")).toBeInTheDocument();
  });

  it("requires reason for rejection", () => {
    render(<ApprovalWorkflow {...defaultProps} />);

    fireEvent.click(screen.getByTestId("reject-btn"));
    const confirmBtn = screen.getByTestId("confirm-rejection-btn");

    // Should be disabled initially (check class)
    expect(confirmBtn.className).toContain("cursor-not-allowed");
  });

  it("calls onStateTransition with rejected when rejection confirmed", () => {
    const onStateTransition = vi.fn();
    render(
      <ApprovalWorkflow
        {...defaultProps}
        onStateTransition={onStateTransition}
      />,
    );

    fireEvent.click(screen.getByTestId("reject-btn"));
    fireEvent.change(screen.getByTestId("rejection-reason"), {
      target: { value: "Evidence insufficient" },
    });
    fireEvent.click(screen.getByTestId("confirm-rejection-btn"));

    expect(onStateTransition).toHaveBeenCalledWith(
      "rejected",
      "Evidence insufficient",
    );
  });

  it("has version dropdown button", () => {
    render(<ApprovalWorkflow {...defaultProps} />);
    expect(screen.getByTestId("version-dropdown-btn")).toBeInTheDocument();
  });

  it("shows version dropdown when clicked", () => {
    render(<ApprovalWorkflow {...defaultProps} />);

    fireEvent.click(screen.getByTestId("version-dropdown-btn"));
    expect(screen.getByTestId("version-dropdown")).toBeInTheDocument();
    expect(screen.getByText("Initial draft")).toBeInTheDocument();
  });

  it("displays comments thread", () => {
    render(<ApprovalWorkflow {...defaultProps} />);
    expect(screen.getByText("Beginning review.")).toBeInTheDocument();
  });

  it("allows adding a comment", () => {
    const onAddComment = vi.fn();
    render(
      <ApprovalWorkflow {...defaultProps} onAddComment={onAddComment} />,
    );

    const input = screen.getByPlaceholderText(/Add a comment/i);
    fireEvent.change(input, { target: { value: "New comment" } });
    fireEvent.click(screen.getByText("Post"));

    expect(onAddComment).toHaveBeenCalledWith("New comment");
  });

  it("displays role badges for each step", () => {
    render(<ApprovalWorkflow {...defaultProps} />);

    expect(screen.getByText("AI System")).toBeInTheDocument();
    expect(screen.getByText("Reviewing Clinician")).toBeInTheDocument();
    expect(screen.getByText("Senior Clinician")).toBeInTheDocument();
    expect(screen.getByText("Prescribing Physician")).toBeInTheDocument();
  });

  it("shows step descriptions", () => {
    render(<ApprovalWorkflow {...defaultProps} />);
    expect(
      screen.getByText(/Clinician reviewing protocol/i),
    ).toBeInTheDocument();
  });

  it("shows comment count indicator on steps with comments", () => {
    render(
      <ApprovalWorkflow
        {...defaultProps}
        comments={[
          ...mockComments,
          {
            id: "c2",
            timestamp: "2024-01-15T12:00:00Z",
            author: "Dr. Smith",
            authorRole: "reviewing_clinician",
            state: "under_review",
            message: "Updated comment.",
          },
        ]}
      />,
    );

    expect(screen.getByTestId("step-comments-under_review")).toHaveTextContent("2");
  });
});
