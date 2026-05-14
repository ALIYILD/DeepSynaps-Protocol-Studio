/**
 * ClinicalDashboard Tests — DeepSynaps Protocol Studio
 * =====================================================
 * Tests dashboard layout, widget presence, refresh behavior,
 * and responsive grid structure.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ClinicalDashboard } from "../../dashboard/ClinicalDashboard";
import {
  createMockPendingProtocol,
  createMockActiveTreatment,
  createMockRecentAnalysis,
  createMockAiAlert,
} from "../utils/protocolMockData";

describe("ClinicalDashboard", () => {
  it("renders the dashboard with data-testid", () => {
    render(<ClinicalDashboard />);
    expect(screen.getByTestId("clinical-dashboard")).toBeInTheDocument();
  });

  it("displays the header title 'Clinical Dashboard'", () => {
    render(<ClinicalDashboard />);
    expect(screen.getByRole("heading", { name: /Clinical Dashboard/i })).toBeInTheDocument();
  });

  it("displays clinic name and date/time info", () => {
    render(<ClinicalDashboard clinicName="NeuroCare Institute" />);
    expect(screen.getByTestId("clinic-info")).toHaveTextContent("NeuroCare Institute");
  });

  it("renders the refresh button", () => {
    render(<ClinicalDashboard />);
    expect(screen.getByTestId("refresh-btn")).toBeInTheDocument();
    expect(screen.getByTestId("refresh-btn")).toHaveTextContent("Refresh");
  });

  it("renders all 5 widget components", () => {
    render(<ClinicalDashboard />);
    expect(screen.getByTestId("pending-protocols-widget")).toBeInTheDocument();
    expect(screen.getByTestId("active-treatments-widget")).toBeInTheDocument();
    expect(screen.getByTestId("recent-analyses-widget")).toBeInTheDocument();
    expect(screen.getByTestId("ai-alerts-widget")).toBeInTheDocument();
    expect(screen.getByTestId("quick-actions-widget")).toBeInTheDocument();
  });

  it("renders QuickActionsWidget with all 4 action buttons", () => {
    render(<ClinicalDashboard />);
    expect(screen.getByTestId("btn-generate-protocol")).toBeInTheDocument();
    expect(screen.getByTestId("btn-new-patient")).toBeInTheDocument();
    expect(screen.getByTestId("btn-schedule-session")).toBeInTheDocument();
    expect(screen.getByTestId("btn-view-reports")).toBeInTheDocument();
  });

  it("displays pending protocols from props", () => {
    const protocols = [
      createMockPendingProtocol({ patientInitials: "X.Y.", condition: "Test Condition" }),
    ];
    render(<ClinicalDashboard pendingProtocols={protocols} />);
    expect(screen.getByTestId("protocol-item-pp-001")).toHaveTextContent("X.Y.");
    expect(screen.getByTestId("protocol-item-pp-001")).toHaveTextContent("Test Condition");
  });

  it("displays active treatments from props", () => {
    const treatments = [
      createMockActiveTreatment({
        patientInitials: "Z.W.",
        protocolName: "Test Protocol",
        currentSession: 5,
        totalSessions: 10,
      }),
    ];
    render(<ClinicalDashboard activeTreatments={treatments} />);
    expect(screen.getByTestId("treatment-item-tx-001")).toHaveTextContent("Z.W.");
    expect(screen.getByTestId("progress-label-tx-001")).toHaveTextContent("Session 5/10");
  });

  it("displays recent analyses from props", () => {
    const analyses = [
      createMockRecentAnalysis({ patientInitials: "A.B.", type: "MRI", status: "completed" }),
    ];
    render(<ClinicalDashboard recentAnalyses={analyses} />);
    expect(screen.getByTestId("analysis-item-an-001")).toHaveTextContent("A.B.");
    expect(screen.getByTestId("analysis-type-an-001")).toHaveTextContent("MRI");
  });

  it("displays AI alerts from props", () => {
    const alerts = [
      createMockAiAlert({ message: "Test alert message", severity: "critical" }),
    ];
    render(<ClinicalDashboard aiAlerts={alerts} />);
    expect(screen.getByTestId("alert-item-al-001")).toHaveTextContent("Test alert message");
    expect(screen.getByTestId("alert-severity-al-001")).toHaveTextContent("critical");
  });

  it("calls onRefresh when refresh button is clicked", async () => {
    const onRefresh = vi.fn();
    render(<ClinicalDashboard onRefresh={onRefresh} />);

    fireEvent.click(screen.getByTestId("refresh-btn"));
    await waitFor(() => {
      expect(onRefresh).toHaveBeenCalledTimes(1);
    });
  });

  it("calls onGenerateProtocol when Generate Protocol button is clicked", () => {
    const onGenerateProtocol = vi.fn();
    render(<ClinicalDashboard onGenerateProtocol={onGenerateProtocol} />);

    fireEvent.click(screen.getByTestId("btn-generate-protocol"));
    expect(onGenerateProtocol).toHaveBeenCalledTimes(1);
  });

  it("calls onNewPatient when New Patient button is clicked", () => {
    const onNewPatient = vi.fn();
    render(<ClinicalDashboard onNewPatient={onNewPatient} />);

    fireEvent.click(screen.getByTestId("btn-new-patient"));
    expect(onNewPatient).toHaveBeenCalledTimes(1);
  });

  it("calls onScheduleSession when Schedule Session button is clicked", () => {
    const onScheduleSession = vi.fn();
    render(<ClinicalDashboard onScheduleSession={onScheduleSession} />);

    fireEvent.click(screen.getByTestId("btn-schedule-session"));
    expect(onScheduleSession).toHaveBeenCalledTimes(1);
  });

  it("calls onViewReports when View Reports button is clicked", () => {
    const onViewReports = vi.fn();
    render(<ClinicalDashboard onViewReports={onViewReports} />);

    fireEvent.click(screen.getByTestId("btn-view-reports"));
    expect(onViewReports).toHaveBeenCalledTimes(1);
  });

  it("calls onReviewProtocol when Review button is clicked on a protocol", () => {
    const onReviewProtocol = vi.fn();
    const protocols = [createMockPendingProtocol({ id: "pp-custom", patientInitials: "T.T." })];
    render(<ClinicalDashboard pendingProtocols={protocols} onReviewProtocol={onReviewProtocol} />);

    fireEvent.click(screen.getByTestId("review-btn-pp-custom"));
    expect(onReviewProtocol).toHaveBeenCalledWith("pp-custom");
  });

  it("calls onDismissAlert when dismiss button is clicked on an alert", () => {
    const onDismissAlert = vi.fn();
    const alerts = [createMockAiAlert({ id: "al-custom", message: "Dismiss me" })];
    render(<ClinicalDashboard aiAlerts={alerts} onDismissAlert={onDismissAlert} />);

    fireEvent.click(screen.getByTestId("dismiss-btn-al-custom"));
    expect(onDismissAlert).toHaveBeenCalledWith("al-custom");
  });

  it("calls onViewAllTreatments when View all is clicked in treatments widget", () => {
    const onViewAllTreatments = vi.fn();
    render(<ClinicalDashboard onViewAllTreatments={onViewAllTreatments} />);

    fireEvent.click(screen.getByTestId("view-all-link"));
    expect(onViewAllTreatments).toHaveBeenCalledTimes(1);
  });

  it("shows loading state on all widgets when isLoading is true", () => {
    render(<ClinicalDashboard isLoading />);

    // All widgets should show skeleton pulse state
    const widgets = [
      "pending-protocols-widget",
      "active-treatments-widget",
      "recent-analyses-widget",
      "ai-alerts-widget",
      "quick-actions-widget",
    ];
    widgets.forEach((id) => {
      expect(screen.getByTestId(id)).toHaveClass("animate-pulse");
    });
  });

  it("shows empty state for pending protocols when list is empty", () => {
    render(<ClinicalDashboard pendingProtocols={[]} />);
    expect(screen.getByTestId("empty-state")).toHaveTextContent(
      "No pending protocols — all caught up!"
    );
  });

  it("shows empty state for active treatments when list is empty", () => {
    render(<ClinicalDashboard activeTreatments={[]} />);
    expect(screen.getByTestId("empty-state")).toHaveTextContent("No active treatments");
  });

  it("shows empty state for AI alerts when list is empty", () => {
    render(<ClinicalDashboard aiAlerts={[]} />);
    expect(screen.getByTestId("empty-state")).toHaveTextContent("All clear — no active alerts");
  });

  it("shows empty state for recent analyses when list is empty", () => {
    render(<ClinicalDashboard recentAnalyses={[]} />);
    expect(screen.getByTestId("empty-state")).toHaveTextContent("No recent analyses");
  });

  it("shows 0 badge on pending protocols when list is empty", () => {
    render(<ClinicalDashboard pendingProtocols={[]} />);
    const badge = screen.getByTestId("pending-count-badge");
    expect(badge).toHaveTextContent("0");
    expect(badge.className).toContain("bg-green-100");
  });

  it("shows 0 badge on AI alerts when list is empty", () => {
    render(<ClinicalDashboard aiAlerts={[]} />);
    const badge = screen.getByTestId("alerts-count-badge");
    expect(badge).toHaveTextContent("0");
    expect(badge.className).toContain("bg-green-100");
  });

  it("shows correct count badge for pending protocols", () => {
    const protocols = [
      createMockPendingProtocol({ id: "pp-1" }),
      createMockPendingProtocol({ id: "pp-2" }),
      createMockPendingProtocol({ id: "pp-3" }),
    ];
    render(<ClinicalDashboard pendingProtocols={protocols} />);
    expect(screen.getByTestId("pending-count-badge")).toHaveTextContent("3");
  });

  it("shows correct count badge for active treatments", () => {
    const treatments = [createMockActiveTreatment({ id: "tx-1" }), createMockActiveTreatment({ id: "tx-2" })];
    render(<ClinicalDashboard activeTreatments={treatments} />);
    expect(screen.getByTestId("active-count-badge")).toHaveTextContent("2");
  });

  it("uses default demo data when no props provided", () => {
    render(<ClinicalDashboard />);

    // Should show default demo data
    expect(screen.getByTestId("protocol-list")).toBeInTheDocument();
    expect(screen.getByTestId("treatment-list")).toBeInTheDocument();
    expect(screen.getByTestId("analysis-list")).toBeInTheDocument();
    expect(screen.getByTestId("alert-list")).toBeInTheDocument();
  });

  it("has responsive grid layout classes", () => {
    render(<ClinicalDashboard />);
    const dashboard = screen.getByTestId("clinical-dashboard");
    expect(dashboard).toHaveClass("bg-gray-50");
    expect(dashboard).toHaveClass("p-4");
  });

  it("calls onViewInStudio when View in Studio button is clicked on a completed analysis", () => {
    const onViewInStudio = vi.fn();
    const analyses = [createMockRecentAnalysis({ id: "an-complete", status: "completed" })];
    render(<ClinicalDashboard recentAnalyses={analyses} onViewInStudio={onViewInStudio} />);

    fireEvent.click(screen.getByTestId("view-studio-btn-an-complete"));
    expect(onViewInStudio).toHaveBeenCalledWith("an-complete");
  });

  it("calls onViewAllAlerts when View all is clicked in alerts widget", () => {
    const onViewAllAlerts = vi.fn();
    render(<ClinicalDashboard onViewAllAlerts={onViewAllAlerts} />);

    fireEvent.click(screen.getAllByTestId("view-all-link")[0]);
    expect(onViewAllAlerts).toHaveBeenCalledTimes(1);
  });
});
