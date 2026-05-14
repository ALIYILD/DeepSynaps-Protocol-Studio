/**
 * GenerationWizard — DeepSynaps Protocol Studio
 * ==============================================
 * Multi-step wizard for protocol generation with step navigation,
 * mode selection, form validation, and progress tracking.
 */

import React, { useState, useCallback } from "react";
import type { ProtocolMode, WizardStep, ConditionItem, ModalityItem } from "./types";

interface GenerationWizardProps {
  steps?: WizardStep[];
  conditions?: ConditionItem[];
  modalities?: ModalityItem[];
  onComplete?: (data: WizardFormData) => void;
  onCancel?: () => void;
}

export interface WizardFormData {
  patientId: string;
  conditionId: string;
  mode: ProtocolMode | "";
  targetRegion: string;
  notes: string;
  confirmSafety: boolean;
}

const defaultSteps: WizardStep[] = [
  { id: "patient", label: "Patient", description: "Select patient", isComplete: false, isActive: true },
  { id: "condition", label: "Condition", description: "Select condition", isComplete: false, isActive: false },
  { id: "mode", label: "Mode", description: "Choose stimulation mode", isComplete: false, isActive: false },
  { id: "parameters", label: "Parameters", description: "Configure parameters", isComplete: false, isActive: false },
  { id: "review", label: "Review", description: "Review and confirm", isComplete: false, isActive: false },
];

const modeOptions: { value: ProtocolMode; label: string }[] = [
  { value: "rTMS", label: "rTMS (Repetitive TMS)" },
  { value: "tDCS", label: "tDCS (Transcranial Direct Current)" },
  { value: "tACS", label: "tACS (Transcranial Alternating Current)" },
  { value: "tRNS", label: "tRNS (Transcranial Random Noise)" },
  { value: "neurofeedback", label: "Neurofeedback" },
  { value: "EEG", label: "EEG" },
];

export const GenerationWizard: React.FC<GenerationWizardProps> = ({
  steps: propSteps,
  conditions = [],
  modalities = [],
  onComplete,
  onCancel,
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [formData, setFormData] = useState<WizardFormData>({
    patientId: "",
    conditionId: "",
    mode: "",
    targetRegion: "",
    notes: "",
    confirmSafety: false,
  });
  const [errors, setErrors] = useState<Partial<Record<keyof WizardFormData, string>>>({});
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());

  const steps = propSteps ?? defaultSteps;

  const validateStep = useCallback((): boolean => {
    const newErrors: Partial<Record<keyof WizardFormData, string>> = {};

    switch (currentStepIndex) {
      case 0: // Patient
        if (!formData.patientId) newErrors.patientId = "Please select a patient";
        break;
      case 1: // Condition
        if (!formData.conditionId) newErrors.conditionId = "Please select a condition";
        break;
      case 2: // Mode
        if (!formData.mode) newErrors.mode = "Please select a stimulation mode";
        break;
      case 3: // Parameters
        if (!formData.targetRegion.trim()) newErrors.targetRegion = "Target region is required";
        break;
      case 4: // Review
        if (!formData.confirmSafety) newErrors.confirmSafety = "You must confirm safety checks";
        break;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [currentStepIndex, formData]);

  const goToStep = useCallback(
    (index: number) => {
      if (index < 0 || index >= steps.length) return;
      // Only allow going back or to next completed/current step
      if (index > currentStepIndex && !validateStep()) return;
      if (index < currentStepIndex || (index === currentStepIndex + 1 && validateStep())) {
        setCurrentStepIndex(index);
      }
    },
    [currentStepIndex, steps.length, validateStep]
  );

  const handleNext = useCallback(() => {
    if (!validateStep()) return;
    setCompletedSteps((prev) => new Set(prev).add(steps[currentStepIndex].id));
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    }
  }, [validateStep, currentStepIndex, steps]);

  const handleBack = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  }, [currentStepIndex]);

  const handleComplete = useCallback(() => {
    if (!validateStep()) return;
    onComplete?.(formData);
  }, [validateStep, formData, onComplete]);

  const updateField = useCallback(
    <K extends keyof WizardFormData>(field: K, value: WizardFormData[K]) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    },
    []
  );

  const isLastStep = currentStepIndex === steps.length - 1;

  return (
    <div
      className="bg-white rounded-lg border border-gray-200 p-4 max-w-2xl"
      data-testid="generation-wizard"
    >
      {/* Wizard header */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Generate Protocol</h2>
        {onCancel && (
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 p-1 rounded"
            data-testid="wizard-cancel-btn"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Step indicator */}
      <nav className="mb-6" data-testid="wizard-steps">
        <ol className="flex items-center gap-1">
          {steps.map((step, index) => {
            const isActive = index === currentStepIndex;
            const isCompleted = completedSteps.has(step.id);
            const isClickable = index <= currentStepIndex || isCompleted;

            return (
              <li key={step.id} className="flex-1" data-testid={`wizard-step-${step.id}`}>
                <button
                  onClick={() => isClickable && goToStep(index)}
                  disabled={!isClickable}
                  className={`w-full text-center py-2 px-1 rounded-md text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-blue-600 text-white"
                      : isCompleted
                      ? "bg-green-100 text-green-800 hover:bg-green-200"
                      : "bg-gray-100 text-gray-400 cursor-not-allowed"
                  }`}
                  data-testid={`wizard-step-btn-${step.id}`}
                  aria-current={isActive ? "step" : undefined}
                >
                  <span className="block">{step.label}</span>
                </button>
                {isActive && (
                  <p className="text-xs text-gray-500 mt-1 text-center" data-testid="wizard-step-description">
                    {step.description}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Step content */}
      <div className="min-h-[180px]" data-testid="wizard-step-content">
        {/* Step 1: Patient */}
        {currentStepIndex === 0 && (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">Select Patient</label>
            <select
              value={formData.patientId}
              onChange={(e) => updateField("patientId", e.target.value)}
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.patientId ? "border-red-300" : "border-gray-300"
              }`}
              data-testid="patient-select"
            >
              <option value="">Choose a patient...</option>
              <option value="pt-001">J.D. (42M) — MDD</option>
              <option value="pt-002">A.S. (35F) — GAD</option>
              <option value="pt-003">M.K. (28M) — ADHD</option>
            </select>
            {errors.patientId && (
              <p className="text-xs text-red-600 mt-1" data-testid="error-patientId">
                {errors.patientId}
              </p>
            )}
          </div>
        )}

        {/* Step 2: Condition */}
        {currentStepIndex === 1 && (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">Select Condition</label>
            <select
              value={formData.conditionId}
              onChange={(e) => updateField("conditionId", e.target.value)}
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.conditionId ? "border-red-300" : "border-gray-300"
              }`}
              data-testid="condition-select"
            >
              <option value="">Choose a condition...</option>
              {conditions.length > 0 ? (
                conditions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.icd10Code})
                  </option>
                ))
              ) : (
                <>
                  <option value="cond-001">Major Depressive Disorder (F33)</option>
                  <option value="cond-002">Generalized Anxiety Disorder (F41.1)</option>
                  <option value="cond-003">ADHD (F90.0)</option>
                </>
              )}
            </select>
            {errors.conditionId && (
              <p className="text-xs text-red-600 mt-1" data-testid="error-conditionId">
                {errors.conditionId}
              </p>
            )}
          </div>
        )}

        {/* Step 3: Mode */}
        {currentStepIndex === 2 && (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">Stimulation Mode</label>
            <div className="grid grid-cols-2 gap-2" data-testid="mode-options">
              {modeOptions.map((opt) => {
                const modality = modalities.find((m) => m.mode === opt.value);
                return (
                  <button
                    key={opt.value}
                    onClick={() => updateField("mode", opt.value)}
                    className={`p-3 rounded-md border text-left text-sm transition-colors ${
                      formData.mode === opt.value
                        ? "border-blue-500 bg-blue-50 text-blue-900 ring-1 ring-blue-500"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                    data-testid={`mode-option-${opt.value}`}
                  >
                    <span className="font-medium">{opt.value}</span>
                    {modality && (
                      <span className="block text-xs text-gray-500 mt-0.5">{modality.typicalDuration}</span>
                    )}
                  </button>
                );
              })}
            </div>
            {errors.mode && (
              <p className="text-xs text-red-600 mt-1" data-testid="error-mode">
                {errors.mode}
              </p>
            )}
          </div>
        )}

        {/* Step 4: Parameters */}
        {currentStepIndex === 3 && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Target Region</label>
              <input
                type="text"
                value={formData.targetRegion}
                onChange={(e) => updateField("targetRegion", e.target.value)}
                placeholder="e.g., DLPFC, F3, Cz..."
                className={`w-full mt-1 rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.targetRegion ? "border-red-300" : "border-gray-300"
                }`}
                data-testid="target-region-input"
              />
              {errors.targetRegion && (
                <p className="text-xs text-red-600 mt-1" data-testid="error-targetRegion">
                  {errors.targetRegion}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Notes (optional)</label>
              <textarea
                value={formData.notes}
                onChange={(e) => updateField("notes", e.target.value)}
                rows={3}
                placeholder="Additional notes..."
                className="w-full mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                data-testid="notes-input"
              />
            </div>
          </div>
        )}

        {/* Step 5: Review */}
        {currentStepIndex === 4 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-900">Review Protocol Request</h3>
            <dl className="grid grid-cols-2 gap-2 text-sm" data-testid="review-summary">
              <dt className="text-gray-500">Patient</dt>
              <dd className="text-gray-900" data-testid="review-patient">{formData.patientId || "—"}</dd>
              <dt className="text-gray-500">Condition</dt>
              <dd className="text-gray-900" data-testid="review-condition">{formData.conditionId || "—"}</dd>
              <dt className="text-gray-500">Mode</dt>
              <dd className="text-gray-900" data-testid="review-mode">{formData.mode || "—"}</dd>
              <dt className="text-gray-500">Target Region</dt>
              <dd className="text-gray-900" data-testid="review-target">{formData.targetRegion || "—"}</dd>
            </dl>
            <div className="flex items-start gap-2 pt-2">
              <input
                id="confirmSafety"
                type="checkbox"
                checked={formData.confirmSafety}
                onChange={(e) => updateField("confirmSafety", e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                data-testid="confirm-safety-checkbox"
              />
              <label htmlFor="confirmSafety" className="text-sm text-gray-700">
                I confirm all safety checks have been performed and the patient is cleared for protocol generation.
              </label>
            </div>
            {errors.confirmSafety && (
              <p className="text-xs text-red-600" data-testid="error-confirmSafety">
                {errors.confirmSafety}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Navigation buttons */}
      <div className="flex justify-between mt-6 pt-4 border-t border-gray-100">
        <button
          onClick={handleBack}
          disabled={currentStepIndex === 0}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          data-testid="wizard-back-btn"
        >
          Back
        </button>
        {isLastStep ? (
          <button
            onClick={handleComplete}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 active:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            data-testid="wizard-complete-btn"
          >
            Complete
          </button>
        ) : (
          <button
            onClick={handleNext}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 active:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            data-testid="wizard-next-btn"
          >
            Next
          </button>
        )}
      </div>
    </div>
  );
};

export default GenerationWizard;
