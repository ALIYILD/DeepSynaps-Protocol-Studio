/**
 * AssessmentForm Component Tests
 * ================================
 * Tests the clinician-facing assessment administration form and the
 * patient-facing self-report questionnaire renderer.
 *
 * Coverage targets:
 *   - Question type rendering (scale, multiple-choice, text, yes/no)
 *   - Conditional logic (show/hide based on previous answers)
 *   - Progress indicator
 *   - Validation (required questions)
 *   - Submit → API → completion redirect
 *   - Auto-save draft to localStorage
 */

import { describe, it, expect, vi } from "vitest";
import React from "react";
import { screen, waitFor } from "@testing-library/react";
import {
  renderWithProviders,
  createMockApiClient,
  mockClinicianUser,
  mockPatientUser,
  mockAssessment,
} from "../utils/test-utils";

// ── Types ──────────────────────────────────────────────────────────────

interface Question {
  id: string;
  type: "scale" | "choice" | "text" | "boolean" | "conditional_group";
  text: string;
  required: boolean;
  min?: number;
  max?: number;
  options?: { value: string; label: string }[];
  condition?: { questionId: string; equals: string };
}

// ── Stand-in component ────────────────────────────────────────────────

interface AssessmentFormProps {
  assessmentId: string;
  user: ReturnType<typeof mockClinicianUser> | ReturnType<typeof mockPatientUser>;
  onComplete?: () => void;
}

const QUESTIONS: Question[] = [
  {
    id: "q1_sleep_quality",
    type: "scale",
    text: "How would you rate your overall sleep quality over the past week?",
    required: true,
    min: 1,
    max: 10,
  },
  {
    id: "q2_sleep_onset",
    type: "scale",
    text: "How many minutes does it typically take you to fall asleep?",
    required: true,
    min: 0,
    max: 120,
  },
  {
    id: "q3_sleep_medication",
    type: "boolean",
    text: "Have you used any sleep medication in the past week?",
    required: true,
  },
  {
    id: "q4_medication_name",
    type: "text",
    text: "If yes, please specify the medication name and dosage.",
    required: false,
    condition: { questionId: "q3_sleep_medication", equals: "true" },
  },
  {
    id: "q5_mood_today",
    type: "choice",
    text: "How would you describe your mood today?",
    required: true,
    options: [
      { value: "excellent", label: "Excellent" },
      { value: "good", label: "Good" },
      { value: "fair", label: "Fair" },
      { value: "poor", label: "Poor" },
      { value: "very_poor", label: "Very poor" },
    ],
  },
];

function AssessmentForm({ assessmentId, user, onComplete }: AssessmentFormProps) {
  const [answers, setAnswers] = React.useState<Record<string, string>>(() => {
    // Attempt to restore draft from localStorage
    try {
      const draft = localStorage.getItem(`assessment-draft-${assessmentId}`);
      return draft ? JSON.parse(draft) : {};
    } catch {
      return {};
    }
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isComplete, setIsComplete] = React.useState(false);

  const totalQuestions = QUESTIONS.filter((q) => q.type !== "conditional_group").length;
  const answeredCount = Object.keys(answers).filter((k) => answers[k]?.trim()).length;
  const progressPercent = Math.round((answeredCount / totalQuestions) * 100);

  // Auto-save draft
  React.useEffect(() => {
    if (Object.keys(answers).length > 0 && !isComplete) {
      localStorage.setItem(`assessment-draft-${assessmentId}`, JSON.stringify(answers));
    }
  }, [answers, assessmentId, isComplete]);

  function shouldShowQuestion(q: Question): boolean {
    if (!q.condition) return true;
    return answers[q.condition.questionId] === q.condition.equals;
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    for (const q of QUESTIONS) {
      if (!shouldShowQuestion(q)) continue;
      if (q.required && !answers[q.id]?.trim()) {
        next[q.id] = "This question is required.";
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      const api = (window as unknown as Record<string, unknown>)._testApiClient as {
        submitAssessment: (id: string, data: unknown) => Promise<unknown>;
      };
      await api.submitAssessment(assessmentId, { answers });
      localStorage.removeItem(`assessment-draft-${assessmentId}`);
      setIsComplete(true);
      onComplete?.();
    } catch {
      setErrors({ submit: "Submission failed. Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isComplete) {
    return (
      <div data-testid="assessment-complete" role="status">
        <h2>Assessment Submitted</h2>
        <p>Thank you. Your responses have been recorded.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} data-testid="assessment-form">
      <header>
        <h1>Sleep Quality Assessment</h1>
        <div
          role="progressbar"
          aria-valuenow={progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          data-testid="progress-bar"
        >
          {progressPercent}%
        </div>
      </header>

      {QUESTIONS.map((q) => {
        if (!shouldShowQuestion(q)) return null;

        return (
          <fieldset key={q.id} data-testid={`question-${q.id}`}>
            <legend>
              {q.text}
              {q.required && <span aria-label="required"> *</span>}
            </legend>

            {q.type === "scale" && (
              <input
                type="range"
                min={q.min}
                max={q.max}
                value={answers[q.id] ?? q.min ?? 0}
                onChange={(e) =>
                  setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                }
                aria-invalid={!!errors[q.id]}
                aria-label={q.text}
                data-testid={`input-${q.id}`}
              />
            )}

            {q.type === "boolean" && (
              <div>
                <label>
                  <input
                    type="radio"
                    name={q.id}
                    value="true"
                    checked={answers[q.id] === "true"}
                    onChange={(e) =>
                      setAnswers((prev) => ({
                        ...prev,
                        [q.id]: e.target.value,
                      }))
                    }
                    data-testid={`input-${q.id}-yes`}
                  />
                  Yes
                </label>
                <label>
                  <input
                    type="radio"
                    name={q.id}
                    value="false"
                    checked={answers[q.id] === "false"}
                    onChange={(e) =>
                      setAnswers((prev) => ({
                        ...prev,
                        [q.id]: e.target.value,
                      }))
                    }
                    data-testid={`input-${q.id}-no`}
                  />
                  No
                </label>
              </div>
            )}

            {q.type === "text" && (
              <textarea
                value={answers[q.id] ?? ""}
                onChange={(e) =>
                  setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                }
                aria-invalid={!!errors[q.id]}
                data-testid={`input-${q.id}`}
              />
            )}

            {q.type === "choice" && q.options && (
              <select
                value={answers[q.id] ?? ""}
                onChange={(e) =>
                  setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                }
                aria-invalid={!!errors[q.id]}
                data-testid={`input-${q.id}`}
              >
                <option value="">Select…</option>
                {q.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            )}

            {errors[q.id] && (
              <span role="alert" data-testid={`error-${q.id}`}>
                {errors[q.id]}
              </span>
            )}
          </fieldset>
        );
      })}

      {errors.submit && (
        <div role="alert" data-testid="submit-error">
          {errors.submit}
        </div>
      )}

      <button type="submit" disabled={isSubmitting} data-testid="submit-btn">
        {isSubmitting ? "Submitting…" : "Submit Assessment"}
      </button>
    </form>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════

describe("AssessmentForm", () => {
  it("renders all visible questions", () => {
    renderWithProviders(
      <AssessmentForm assessmentId="ass-test-001" user={mockPatientUser()} />
    );

    expect(screen.getByTestId("question-q1_sleep_quality")).toBeInTheDocument();
    expect(screen.getByTestId("question-q2_sleep_onset")).toBeInTheDocument();
    expect(screen.getByTestId("question-q3_sleep_medication")).toBeInTheDocument();
    // q4 is conditional — initially hidden
    expect(screen.queryByTestId("question-q4_medication_name")).not.toBeInTheDocument();
    expect(screen.getByTestId("question-q5_mood_today")).toBeInTheDocument();
  });

  it("shows progress bar at 0 % initially", () => {
    renderWithProviders(
      <AssessmentForm assessmentId="ass-test-001" user={mockPatientUser()} />
    );
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });

  it("updates progress when questions are answered", async () => {
    const { user } = renderWithProviders(
      <AssessmentForm assessmentId="ass-test-001" user={mockPatientUser()} />
    );
    const slider = screen.getByTestId("input-q1_sleep_quality");
    await user.clear(slider);
    await user.type(slider, "7");

    // 1 of 4 answered = 25%
    await waitFor(() => {
      expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "25");
    });
  });

  it("reveals conditional question when condition is met", async () => {
    const { user } = renderWithProviders(
      <AssessmentForm assessmentId="ass-test-001" user={mockPatientUser()} />
    );
    await user.click(screen.getByTestId("input-q3_sleep_medication-yes"));

    expect(
      await screen.findByTestId("question-q4_medication_name")
    ).toBeInTheDocument();
  });

  it("validates required fields on submit", async () => {
    const { user } = renderWithProviders(
      <AssessmentForm assessmentId="ass-test-001" user={mockPatientUser()} />
    );
    await user.click(screen.getByTestId("submit-btn"));

    expect(
      await screen.findByTestId("error-q1_sleep_quality")
    ).toHaveTextContent(/required/i);
  });

  it("submits successfully and shows completion screen", async () => {
    const onComplete = vi.fn();
    const mockApi = createMockApiClient({
      submitAssessment: vi.fn().mockResolvedValue(mockAssessment({ id: "ass-test-001" })),
    });
    const { user } = renderWithProviders(
      <AssessmentForm
        assessmentId="ass-test-001"
        user={mockPatientUser()}
        onComplete={onComplete}
      />,
      { apiClient: mockApi }
    );

    // Fill required fields
    await user.type(screen.getByTestId("input-q1_sleep_quality"), "7");
    await user.type(screen.getByTestId("input-q2_sleep_onset"), "30");
    await user.click(screen.getByTestId("input-q3_sleep_medication-no"));
    await user.selectOptions(screen.getByTestId("input-q5_mood_today"), "good");

    await user.click(screen.getByTestId("submit-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("assessment-complete")).toBeInTheDocument();
    });
    expect(onComplete).toHaveBeenCalled();
    expect(mockApi.submitAssessment).toHaveBeenCalledWith(
      "ass-test-001",
      expect.objectContaining({ answers: expect.any(Object) })
    );
  });

  it("persists draft answers to localStorage", async () => {
    const { user, unmount } = renderWithProviders(
      <AssessmentForm assessmentId="ass-test-001" user={mockPatientUser()} />
    );

    await user.type(screen.getByTestId("input-q1_sleep_quality"), "8");
    unmount();

    const draft = JSON.parse(
      localStorage.getItem("assessment-draft-ass-test-001") ?? "{}"
    );
    expect(draft.q1_sleep_quality).toBeDefined();
  });

  it("restores draft answers from localStorage on mount", () => {
    localStorage.setItem(
      "assessment-draft-ass-test-002",
      JSON.stringify({ q1_sleep_quality: "6", q2_sleep_onset: "20" })
    );

    renderWithProviders(
      <AssessmentForm assessmentId="ass-test-002" user={mockPatientUser()} />
    );

    expect(screen.getByTestId("input-q1_sleep_quality")).toHaveValue(6);
    expect(screen.getByTestId("input-q2_sleep_onset")).toHaveValue(20);
  });

  it("clears localStorage draft on successful submit", async () => {
    localStorage.setItem(
      "assessment-draft-ass-test-003",
      JSON.stringify({ q1_sleep_quality: "9" })
    );
    const mockApi = createMockApiClient({
      submitAssessment: vi.fn().mockResolvedValue(mockAssessment({ id: "ass-test-003" })),
    });
    const { user } = renderWithProviders(
      <AssessmentForm assessmentId="ass-test-003" user={mockPatientUser()} />,
      { apiClient: mockApi }
    );

    await user.type(screen.getByTestId("input-q1_sleep_quality"), "9");
    await user.type(screen.getByTestId("input-q2_sleep_onset"), "15");
    await user.click(screen.getByTestId("input-q3_sleep_medication-no"));
    await user.selectOptions(screen.getByTestId("input-q5_mood_today"), "excellent");
    await user.click(screen.getByTestId("submit-btn"));

    await waitFor(() => {
      expect(
        localStorage.getItem("assessment-draft-ass-test-003")
      ).toBeNull();
    });
  });

  it("shows error when submission fails", async () => {
    const mockApi = createMockApiClient({
      submitAssessment: vi.fn().mockRejectedValue(new Error("API error")),
    });
    const { user } = renderWithProviders(
      <AssessmentForm assessmentId="ass-test-001" user={mockPatientUser()} />,
      { apiClient: mockApi }
    );

    await user.type(screen.getByTestId("input-q1_sleep_quality"), "5");
    await user.type(screen.getByTestId("input-q2_sleep_onset"), "25");
    await user.click(screen.getByTestId("input-q3_sleep_medication-no"));
    await user.selectOptions(screen.getByTestId("input-q5_mood_today"), "fair");
    await user.click(screen.getByTestId("submit-btn"));

    expect(
      await screen.findByTestId("submit-error")
    ).toHaveTextContent(/submission failed/i);
  });
});
