/**
 * GenerationWizard Tests — DeepSynaps Protocol Studio
 * ====================================================
 * Tests wizard step navigation, mode selection, and form validation.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GenerationWizard } from "../../protocol/GenerationWizard";
import {
  createMockConditionItem,
  createMockModalityItem,
} from "../utils/protocolMockData";

describe("GenerationWizard", () => {
  it("renders the wizard with all 5 step buttons", () => {
    render(<GenerationWizard />);

    expect(screen.getByTestId("generation-wizard")).toBeInTheDocument();
    expect(screen.getByTestId("wizard-steps")).toBeInTheDocument();
    expect(screen.getByTestId("wizard-step-btn-patient")).toBeInTheDocument();
    expect(screen.getByTestId("wizard-step-btn-condition")).toBeInTheDocument();
    expect(screen.getByTestId("wizard-step-btn-mode")).toBeInTheDocument();
    expect(screen.getByTestId("wizard-step-btn-parameters")).toBeInTheDocument();
    expect(screen.getByTestId("wizard-step-btn-review")).toBeInTheDocument();
  });

  it("starts at step 1 (patient selection) with active styling", () => {
    render(<GenerationWizard />);

    const patientStepBtn = screen.getByTestId("wizard-step-btn-patient");
    expect(patientStepBtn.className).toContain("bg-blue-600");
    expect(patientStepBtn.className).toContain("text-white");
    expect(screen.getByTestId("wizard-step-content")).toBeInTheDocument();
  });

  it("shows step description for the active step", () => {
    render(<GenerationWizard />);
    expect(screen.getByTestId("wizard-step-description")).toHaveTextContent(
      "Select patient and confirm context"
    );
  });

  it("validates patient selection before proceeding to next step", () => {
    render(<GenerationWizard />);

    const nextBtn = screen.getByTestId("wizard-next-btn");
    fireEvent.click(nextBtn);

    expect(screen.getByTestId("error-patientId")).toHaveTextContent(
      "Please select a patient"
    );
  });

  it("advances to next step when patient is selected and Next is clicked", () => {
    render(<GenerationWizard />);

    const patientSelect = screen.getByTestId("patient-select");
    fireEvent.change(patientSelect, { target: { value: "pt-001" } });

    const nextBtn = screen.getByTestId("wizard-next-btn");
    fireEvent.click(nextBtn);

    // Should now be on condition step
    expect(screen.getByTestId("condition-select")).toBeInTheDocument();
  });

  it("advances through all steps with valid data and calls onComplete", async () => {
    const onComplete = vi.fn();
    render(<GenerationWizard onComplete={onComplete} />);

    // Step 1: Patient
    fireEvent.change(screen.getByTestId("patient-select"), { target: { value: "pt-001" } });
    fireEvent.click(screen.getByTestId("wizard-next-btn"));

    // Step 2: Condition
    await waitFor(() => {
      expect(screen.getByTestId("condition-select")).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId("condition-select"), { target: { value: "cond-001" } });
    fireEvent.click(screen.getByTestId("wizard-next-btn"));

    // Step 3: Mode
    await waitFor(() => {
      expect(screen.getByTestId("mode-options")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("mode-option-rTMS"));
    fireEvent.click(screen.getByTestId("wizard-next-btn"));

    // Step 4: Parameters
    await waitFor(() => {
      expect(screen.getByTestId("target-region-input")).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId("target-region-input"), { target: { value: "DLPFC" } });
    fireEvent.click(screen.getByTestId("wizard-next-btn"));

    // Step 5: Review
    await waitFor(() => {
      expect(screen.getByTestId("review-summary")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("confirm-safety-checkbox"));
    fireEvent.click(screen.getByTestId("wizard-complete-btn"));

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    const calledData = onComplete.mock.calls[0][0];
    expect(calledData.patientId).toBe("pt-001");
    expect(calledData.conditionId).toBe("cond-001");
    expect(calledData.mode).toBe("rTMS");
    expect(calledData.targetRegion).toBe("DLPFC");
    expect(calledData.confirmSafety).toBe(true);
  });

  it("allows mode selection by clicking mode option buttons", () => {
    render(<GenerationWizard />);

    // Navigate to mode step
    fireEvent.change(screen.getByTestId("patient-select"), { target: { value: "pt-001" } });
    fireEvent.click(screen.getByTestId("wizard-next-btn"));
    fireEvent.change(screen.getByTestId("condition-select"), { target: { value: "cond-001" } });
    fireEvent.click(screen.getByTestId("wizard-next-btn"));

    const rTmsOption = screen.getByTestId("mode-option-rTMS");
    fireEvent.click(rTmsOption);

    expect(rTmsOption.className).toContain("border-blue-500");
    expect(rTmsOption.className).toContain("bg-blue-50");
  });

  it("validates condition selection on step 2", () => {
    render(<GenerationWizard />);

    // Go to step 2
    fireEvent.change(screen.getByTestId("patient-select"), { target: { value: "pt-001" } });
    fireEvent.click(screen.getByTestId("wizard-next-btn"));

    // Try to proceed without selecting condition
    fireEvent.click(screen.getByTestId("wizard-next-btn"));
    expect(screen.getByTestId("error-conditionId")).toHaveTextContent(
      "Please select a condition"
    );
  });

  it("validates mode selection on step 3", () => {
    render(<GenerationWizard />);

    // Navigate to mode step
    fireEvent.change(screen.getByTestId("patient-select"), { target: { value: "pt-001" } });
    fireEvent.click(screen.getByTestId("wizard-next-btn"));
    fireEvent.change(screen.getByTestId("condition-select"), { target: { value: "cond-001" } });
    fireEvent.click(screen.getByTestId("wizard-next-btn"));

    // Try to proceed without selecting mode
    fireEvent.click(screen.getByTestId("wizard-next-btn"));
    expect(screen.getByTestId("error-mode")).toHaveTextContent(
      "Please select a stimulation mode"
    );
  });

  it("validates target region on step 4", () => {
    render(<GenerationWizard />);

    // Navigate to parameters step
    fireEvent.change(screen.getByTestId("patient-select"), { target: { value: "pt-001" } });
    fireEvent.click(screen.getByTestId("wizard-next-btn"));
    fireEvent.change(screen.getByTestId("condition-select"), { target: { value: "cond-001" } });
    fireEvent.click(screen.getByTestId("wizard-next-btn"));
    fireEvent.click(screen.getByTestId("mode-option-rTMS"));
    fireEvent.click(screen.getByTestId("wizard-next-btn"));

    // Try to proceed without target region
    fireEvent.click(screen.getByTestId("wizard-next-btn"));
    expect(screen.getByTestId("error-targetRegion")).toHaveTextContent(
      "Target region is required"
    );
  });

  it("validates safety confirmation on review step", () => {
    render(<GenerationWizard />);

    // Navigate to review step
    fireEvent.change(screen.getByTestId("patient-select"), { target: { value: "pt-001" } });
    fireEvent.click(screen.getByTestId("wizard-next-btn"));
    fireEvent.change(screen.getByTestId("condition-select"), { target: { value: "cond-001" } });
    fireEvent.click(screen.getByTestId("wizard-next-btn"));
    fireEvent.click(screen.getByTestId("mode-option-rTMS"));
    fireEvent.click(screen.getByTestId("wizard-next-btn"));
    fireEvent.change(screen.getByTestId("target-region-input"), { target: { value: "DLPFC" } });
    fireEvent.click(screen.getByTestId("wizard-next-btn"));

    // Try to complete without confirming safety
    fireEvent.click(screen.getByTestId("wizard-complete-btn"));
    expect(screen.getByTestId("error-confirmSafety")).toHaveTextContent(
      "You must confirm safety checks"
    );
  });

  it("goes back to previous step when Back button is clicked", () => {
    render(<GenerationWizard />);

    // Go to step 2
    fireEvent.change(screen.getByTestId("patient-select"), { target: { value: "pt-001" } });
    fireEvent.click(screen.getByTestId("wizard-next-btn"));

    expect(screen.getByTestId("condition-select")).toBeInTheDocument();

    // Go back
    fireEvent.click(screen.getByTestId("wizard-back-btn"));
    expect(screen.getByTestId("patient-select")).toBeInTheDocument();
  });

  it("disables Back button on the first step", () => {
    render(<GenerationWizard />);

    const backBtn = screen.getByTestId("wizard-back-btn");
    expect(backBtn).toBeDisabled();
  });

  it("calls onCancel when cancel button is clicked", () => {
    const onCancel = vi.fn();
    render(<GenerationWizard onCancel={onCancel} />);

    fireEvent.click(screen.getByTestId("wizard-cancel-btn"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("renders with provided conditions and modalities props", () => {
    const conditions = createMockConditionItem();
    const modalities = createMockModalityItem();

    render(<GenerationWizard conditions={conditions} modalities={modalities} />);
    expect(screen.getByTestId("generation-wizard")).toBeInTheDocument();
  });

  it("shows review summary with entered values", () => {
    render(<GenerationWizard />);

    // Fill all steps
    fireEvent.change(screen.getByTestId("patient-select"), { target: { value: "pt-001" } });
    fireEvent.click(screen.getByTestId("wizard-next-btn"));
    fireEvent.change(screen.getByTestId("condition-select"), { target: { value: "cond-001" } });
    fireEvent.click(screen.getByTestId("wizard-next-btn"));
    fireEvent.click(screen.getByTestId("mode-option-rTMS"));
    fireEvent.click(screen.getByTestId("wizard-next-btn"));
    fireEvent.change(screen.getByTestId("target-region-input"), { target: { value: "DLPFC" } });
    fireEvent.click(screen.getByTestId("wizard-next-btn"));

    expect(screen.getByTestId("review-patient")).toHaveTextContent("pt-001");
    expect(screen.getByTestId("review-condition")).toHaveTextContent("cond-001");
    expect(screen.getByTestId("review-mode")).toHaveTextContent("rTMS");
    expect(screen.getByTestId("review-target")).toHaveTextContent("DLPFC");
  });
});
