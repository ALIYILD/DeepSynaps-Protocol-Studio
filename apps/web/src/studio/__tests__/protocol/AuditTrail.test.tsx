import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AuditTrail } from "../../protocol/AuditTrail";
import type { AuditEntry } from "../../protocol/protocolTypes";

describe("AuditTrail", () => {
  const mockEntries: AuditEntry[] = [
    {
      id: "a1",
      timestamp: "2024-01-15T10:30:00Z",
      actor: "AI System",
      actorRole: "system_ai",
      action: "created",
      reason: "Initial draft generation",
      metadata: { mode: "auto_ai" },
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
      reason: "Evidence supports use",
    },
    {
      id: "a4",
      timestamp: "2024-01-16T09:00:00Z",
      actor: "Dr. Patel",
      actorRole: "prescribing_physician",
      action: "prescribed",
      reason: "Patient consented",
    },
  ];

  it("renders with data-testid", () => {
    render(
      <AuditTrail entries={mockEntries} protocolId="draft-001" />,
    );
    expect(screen.getByTestId("audit-trail")).toBeInTheDocument();
  });

  it("displays all audit entries", () => {
    render(
      <AuditTrail entries={mockEntries} protocolId="draft-001" />,
    );

    mockEntries.forEach((entry) => {
      expect(
        screen.getByTestId(`audit-entry-${entry.id}`),
      ).toBeInTheDocument();
    });
  });

  it("displays actor names and roles", () => {
    render(
      <AuditTrail entries={mockEntries} protocolId="draft-001" />,
    );

    expect(screen.getByText("AI System")).toBeInTheDocument();
    expect(screen.getByText("(system_ai)")).toBeInTheDocument();
    expect(screen.getByText("Dr. Smith")).toBeInTheDocument();
    expect(screen.getByText("(reviewing_clinician)")).toBeInTheDocument();
  });

  it("shows action type badges", () => {
    render(
      <AuditTrail entries={mockEntries} protocolId="draft-001" />,
    );

    expect(screen.getByText("Created")).toBeInTheDocument();
    expect(screen.getByText("Reviewed")).toBeInTheDocument();
    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.getByText("Prescribed")).toBeInTheDocument();
  });

  it("shows reasons for actions", () => {
    render(
      <AuditTrail entries={mockEntries} protocolId="draft-001" />,
    );

    expect(screen.getByText("Initial draft generation")).toBeInTheDocument();
    expect(screen.getByText("Evidence supports use")).toBeInTheDocument();
  });

  it("has filter dropdown", () => {
    render(
      <AuditTrail entries={mockEntries} protocolId="draft-001" />,
    );
    expect(screen.getByTestId("audit-filter")).toBeInTheDocument();
  });

  it("filters entries by action type", () => {
    render(
      <AuditTrail entries={mockEntries} protocolId="draft-001" />,
    );

    const filter = screen.getByTestId("audit-filter");
    fireEvent.change(filter, { target: { value: "approved" } });

    // Should only show approved entry
    expect(screen.getByTestId("audit-entry-a3")).toBeInTheDocument();
    expect(screen.queryByTestId("audit-entry-a1")).not.toBeInTheDocument();
  });

  it("has export button", () => {
    render(
      <AuditTrail entries={mockEntries} protocolId="draft-001" />,
    );
    expect(screen.getByTestId("audit-export-btn")).toBeInTheDocument();
  });

  it("shows empty state when no entries match filter", () => {
    render(
      <AuditTrail entries={[]} protocolId="draft-001" />,
    );
    expect(
      screen.getByText(/No audit entries found/i),
    ).toBeInTheDocument();
  });

  it("displays protocol ID in footer", () => {
    render(
      <AuditTrail entries={mockEntries} protocolId="draft-001" />,
    );
    expect(screen.getByText(/Protocol ID: draft-001/i)).toBeInTheDocument();
  });

  it("shows entry count in footer", () => {
    render(
      <AuditTrail entries={mockEntries} protocolId="draft-001" />,
    );
    expect(screen.getByText(/Showing 4 of 4 entries/i)).toBeInTheDocument();
  });
});
