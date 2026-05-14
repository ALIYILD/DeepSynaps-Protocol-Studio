/**
 * SafetyChecklist Tests — DeepSynaps Protocol Studio
 * ===================================================
 * Tests checklist behavior, progress tracking, enable/disable logic.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SafetyChecklist } from "../../protocol/SafetyChecklist";
import {
  createMockSafetyCheckItem,
} from "../utils/protocolMockData";
import type { SafetyCheckItem } from "../../protocol/types";

describe("SafetyChecklist", () => {
  const createDefaultChecks = (): SafetyCheckItem[] => [
    createMockSafetyCheckItem({
      id: "sc-001",
      description: "Check for metal implants",
      status: "pending",
      required: true,
    }),
    createMockSafetyCheckItem({
      id: "sc-002",
      description: "Verify seizure history",
      status: "pending",
      required: true,
    }),
    createMockSafetyCheckItem({
      id: "sc-003",
      description: "Review current medications",
      status: "pending",
      required: true,
    }),
  ];

  it("renders the checklist with all items", () => {
    const checks = createDefaultChecks();
    render(<SafetyChecklist checks={checks} />);

    expect(screen.getByTestId("safety-checklist")).toBeInTheDocument();
    expect(screen.getByTestId("check-item-sc-001")).toBeInTheDocument();
    expect(screen.getByTestId("check-item-sc-002")).toBeInTheDocument();
    expect(screen.getByTestId("check-item-sc-003")).toBeInTheDocument();
  });

  it("displays 'Incomplete' status badge when not all checks pass", () => {
    const checks = createDefaultChecks();
    render(<SafetyChecklist checks={checks} />);

    const badge = screen.getByTestId("safety-status-badge");
    expect(badge).toHaveTextContent("Incomplete");
    expect(badge.className).toContain("bg-yellow-100");
  });

  it("shows progress at 0% when all checks are pending", () => {
    const checks = createDefaultChecks();
    render(<SafetyChecklist checks={checks} />);

    expect(screen.getByTestId("safety-progress-text")).toHaveTextContent("0%");
  });

  it("cycles status from pending to pass when a required check is clicked", () => {
    const checks = createDefaultChecks();
    const onToggleCheck = vi.fn();
    render(<SafetyChecklist checks={checks} onToggleCheck={onToggleCheck} />);

    const statusBtn = screen.getByTestId("check-status-btn-sc-001");
    expect(statusBtn).toHaveTextContent("Pending");

    fireEvent.click(statusBtn);
    expect(onToggleCheck).toHaveBeenCalledWith("sc-001", "pass");
  });

  it("shows 'Complete' status badge when all required checks pass", () => {
    const checks: SafetyCheckItem[] = [
      createMockSafetyCheckItem({ id: "sc-001", description: "Check 1", status: "pass", required: true }),
      createMockSafetyCheckItem({ id: "sc-002", description: "Check 2", status: "pass", required: true }),
      createMockSafetyCheckItem({ id: "sc-003", description: "Check 3", status: "pass", required: true }),
    ];
    render(<SafetyChecklist checks={checks} />);

    const badge = screen.getByTestId("safety-status-badge");
    expect(badge).toHaveTextContent("Complete");
    expect(badge.className).toContain("bg-green-100");
  });

  it("shows 100% progress when all required checks pass", () => {
    const checks: SafetyCheckItem[] = [
      createMockSafetyCheckItem({ id: "sc-001", description: "Check 1", status: "pass", required: true }),
      createMockSafetyCheckItem({ id: "sc-002", description: "Check 2", status: "pass", required: true }),
    ];
    render(<SafetyChecklist checks={checks} />);

    expect(screen.getByTestId("safety-progress-text")).toHaveTextContent("100%");
    expect(screen.getByTestId("safety-progress-bar")).toHaveStyle("width: 100%");
  });

  it("shows green progress bar at 100%", () => {
    const checks: SafetyCheckItem[] = [
      createMockSafetyCheckItem({ id: "sc-001", description: "Check 1", status: "pass", required: true }),
    ];
    render(<SafetyChecklist checks={checks} />);

    expect(screen.getByTestId("safety-progress-bar").className).toContain("bg-green-500");
  });

  it("shows yellow progress bar between 50-99%", () => {
    const checks: SafetyCheckItem[] = [
      createMockSafetyCheckItem({ id: "sc-001", description: "Check 1", status: "pass", required: true }),
      createMockSafetyCheckItem({ id: "sc-002", description: "Check 2", status: "pending", required: true }),
    ];
    render(<SafetyChecklist checks={checks} />);

    expect(screen.getByTestId("safety-progress-text")).toHaveTextContent("50%");
    expect(screen.getByTestId("safety-progress-bar").className).toContain("bg-yellow-500");
  });

  it("shows red progress bar below 50%", () => {
    const checks: SafetyCheckItem[] = [
      createMockSafetyCheckItem({ id: "sc-001", description: "Check 1", status: "pass", required: true }),
      createMockSafetyCheckItem({ id: "sc-002", description: "Check 2", status: "pending", required: true }),
      createMockSafetyCheckItem({ id: "sc-003", description: "Check 3", status: "pending", required: true }),
      createMockSafetyCheckItem({ id: "sc-004", description: "Check 4", status: "pending", required: true }),
    ];
    render(<SafetyChecklist checks={checks} />);

    expect(screen.getByTestId("safety-progress-text")).toHaveTextContent("25%");
    expect(screen.getByTestId("safety-progress-bar").className).toContain("bg-red-500");
  });

  it("disables check toggling when checklist is disabled", () => {
    const checks = createDefaultChecks();
    const onToggleCheck = vi.fn();
    render(<SafetyChecklist checks={checks} onToggleCheck={onToggleCheck} disabled />);

    expect(screen.getByTestId("safety-checklist")).toHaveClass("opacity-60");

    const statusBtn = screen.getByTestId("check-status-btn-sc-001");
    fireEvent.click(statusBtn);
    expect(onToggleCheck).not.toHaveBeenCalled();
  });

  it("marks optional checks with (opt) label", () => {
    const checks: SafetyCheckItem[] = [
      createMockSafetyCheckItem({
        id: "sc-001",
        description: "Optional check",
        status: "pending",
        required: false,
      }),
    ];
    render(<SafetyChecklist checks={checks} />);

    expect(screen.getByTestId("check-item-sc-001")).toHaveTextContent("(opt)");
  });

  it("does not toggle optional checks (buttons disabled)", () => {
    const checks: SafetyCheckItem[] = [
      createMockSafetyCheckItem({
        id: "sc-001",
        description: "Optional check",
        status: "pending",
        required: false,
      }),
    ];
    const onToggleCheck = vi.fn();
    render(<SafetyChecklist checks={checks} onToggleCheck={onToggleCheck} />);

    const statusBtn = screen.getByTestId("check-status-btn-sc-001");
    expect(statusBtn).toBeDisabled();
  });

  it("ignores optional checks in progress calculation", () => {
    const checks: SafetyCheckItem[] = [
      createMockSafetyCheckItem({ id: "sc-001", description: "Required", status: "pending", required: true }),
      createMockSafetyCheckItem({ id: "sc-002", description: "Optional", status: "pending", required: false }),
    ];
    render(<SafetyChecklist checks={checks} />);

    // Only 1 required check, it's pending → 0%
    expect(screen.getByTestId("safety-progress-text")).toHaveTextContent("0%");
  });

  it("counts N/A status as passing for progress", () => {
    const checks: SafetyCheckItem[] = [
      createMockSafetyCheckItem({ id: "sc-001", description: "Check 1", status: "na", required: true }),
      createMockSafetyCheckItem({ id: "sc-002", description: "Check 2", status: "pending", required: true }),
    ];
    render(<SafetyChecklist checks={checks} />);

    expect(screen.getByTestId("safety-progress-text")).toHaveTextContent("50%");
  });

  it("displays hint message when incomplete", () => {
    const checks = createDefaultChecks();
    render(<SafetyChecklist checks={checks} />);

    expect(screen.getByTestId("safety-hint")).toHaveTextContent(
      "Complete all required safety checks to enable protocol generation."
    );
  });

  it("displays success hint message when complete", () => {
    const checks: SafetyCheckItem[] = [
      createMockSafetyCheckItem({ id: "sc-001", description: "Check 1", status: "pass", required: true }),
    ];
    render(<SafetyChecklist checks={checks} />);

    expect(screen.getByTestId("safety-hint")).toHaveTextContent(
      "All required checks passed. Protocol generation enabled."
    );
  });

  it("renders fail status with red styling", () => {
    const checks: SafetyCheckItem[] = [
      createMockSafetyCheckItem({ id: "sc-001", description: "Check 1", status: "fail", required: true }),
    ];
    render(<SafetyChecklist checks={checks} />);

    const statusBtn = screen.getByTestId("check-status-btn-sc-001");
    expect(statusBtn).toHaveTextContent("Fail");
    expect(statusBtn.className).toContain("bg-red-100");
  });

  it("renders na status with gray styling", () => {
    const checks: SafetyCheckItem[] = [
      createMockSafetyCheckItem({ id: "sc-001", description: "Check 1", status: "na", required: true }),
    ];
    render(<SafetyChecklist checks={checks} />);

    const statusBtn = screen.getByTestId("check-status-btn-sc-001");
    expect(statusBtn).toHaveTextContent("N/A");
    expect(statusBtn.className).toContain("bg-gray-100");
  });
});
