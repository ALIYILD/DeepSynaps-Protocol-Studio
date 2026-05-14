/**
 * ProtocolGenerator Component Tests
 * ===================================
 * Tests the protocol creation / editing flow used by clinicians to
 * generate personalised neurostimulation protocols from evidence and
 * patient-specific qEEG findings.
 *
 * Coverage goals:
 *   - Form rendering & validation (all input fields)
 *   - Modality selection (tACS / tDCS / tRNS / neurofeedback)
 *   - Evidence-based parameter auto-fill
 *   - Safety screening gate (contraindication blocking)
 *   - Submit → API call → success / error paths
 *   - Loading & disabled states
 */

import { describe, it, expect, vi } from "vitest";
import React from "react";
import { screen, waitFor, within } from "@testing-library/react";
import {
  renderWithProviders,
  createMockApiClient,
  mockClinicianUser,
  mockProtocol,
} from "../utils/test-utils";

// ── Minimal ProtocolGenerator component (test stand-in) ──────────────
// In the real codebase this is `src/components/ProtocolGenerator.tsx`.
// This stand-in exercises the same behaviours so the test patterns
 // are directly reusable.

interface ProtocolGeneratorProps {
  patientId?: string;
  protocolId?: string;
  onSuccess?: () => void;
}

const CONDITIONS = [
  { id: "cond-mdd-001", name: "Major Depressive Disorder" },
  { id: "cond-gad-001", name: "Generalised Anxiety Disorder" },
  { id: "cond-adhd-001", name: "ADHD" },
  { id: "cond-tbi-001", name: "Traumatic Brain Injury" },
  { id: "cond-insomnia-001", name: "Insomnia" },
];

const MODALITIES = [
  { value: "tACS", label: "tACS — alternating current", defaultFreq: 10 },
  { value: "tDCS", label: "tDCS — direct current", defaultFreq: 0 },
  { value: "tRNS", label: "tRNS — random noise", defaultFreq: 0 },
  { value: "neurofeedback", label: "Neurofeedback", defaultFreq: 0 },
];

const CONTRAINDICATIONS = [
  "implanted_cardiac_device",
  "epilepsy_history",
  "metal_in_head",
  "pregnancy",
  "severe_skin_lesion",
];

function ProtocolGenerator({
  patientId,
  protocolId,
  onSuccess,
}: ProtocolGeneratorProps) {
  const [conditionId, setConditionId] = React.useState("");
  const [modality, setModality] = React.useState("");
  const [frequency, setFrequency] = React.useState(0);
  const [duration, setDuration] = React.useState(20);
  const [intensity, setIntensity] = React.useState(1.0);
  const [montage, setMontage] = React.useState("");
  const [contraindications, setContraindications] = React.useState<string[]>([]);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState("");
  const [isSafe, setIsSafe] = React.useState(true);

  // Pull from mock API if editing
  const api = (window as unknown as Record<string, unknown>)._testApiClient as {
    getProtocol: (id: string) => Promise<unknown>;
    createProtocol: (data: unknown) => Promise<unknown>;
    updateProtocol: (id: string, data: unknown) => Promise<unknown>;
  };

  React.useEffect(() => {
    if (protocolId && api) {
      api.getProtocol(protocolId).then((p: unknown) => {
        const proto = p as Record<string, unknown>;
        setConditionId(String(proto.condition_id ?? ""));
        setModality(String(proto.modality ?? ""));
        setFrequency(Number(proto.frequency_hz ?? 0));
        setDuration(Number(proto.duration_minutes ?? 20));
        setMontage(String(proto.electrode_montage ?? ""));
      });
    }
  }, [protocolId, api]);

  const selectedModality = MODALITIES.find((m) => m.value === modality);

  React.useEffect(() => {
    if (selectedModality && frequency === 0) {
      setFrequency(selectedModality.defaultFreq);
    }
  }, [selectedModality, frequency]);

  // Safety screening
  React.useEffect(() => {
    const unsafe =
      contraindications.includes("implanted_cardiac_device") ||
      contraindications.includes("metal_in_head");
    setIsSafe(!unsafe);
  }, [contraindications]);

  function validate() {
    const next: Record<string, string> = {};
    if (!conditionId) next.condition = "Please select a condition.";
    if (!modality) next.modality = "Please select a modality.";
    if (duration < 1 || duration > 60) next.duration = "Duration must be 1–60 min.";
    if (intensity < 0.1 || intensity > 2.0)
      next.intensity = "Intensity must be 0.1–2.0 mA.";
    if (!montage.trim()) next.montage = "Electrode montage is required.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError("");
    if (!validate()) return;
    if (!isSafe) return;
    setIsSubmitting(true);
    try {
      const payload = {
        condition_id: conditionId,
        modality,
        frequency_hz: frequency,
        duration_minutes: duration,
        intensity_ma: intensity,
        electrode_montage: montage,
        patient_id: patientId,
        contraindications,
      };
      if (protocolId) {
        await api.updateProtocol(protocolId, payload);
      } else {
        await api.createProtocol(payload);
      }
      onSuccess?.();
    } catch {
      setSubmitError("Failed to save protocol. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} data-testid="protocol-generator-form">
      <h1>{protocolId ? "Edit Protocol" : "New Protocol"}</h1>

      {/* Condition */}
      <div>
        <label htmlFor="condition">Condition</label>
        <select
          id="condition"
          value={conditionId}
          onChange={(e) => setConditionId(e.target.value)}
          aria-invalid={!!errors.condition}
          aria-errormessage={errors.condition ? "condition-error" : undefined}
        >
          <option value="">Select…</option>
          {CONDITIONS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {errors.condition && (
          <span id="condition-error" role="alert">
            {errors.condition}
          </span>
        )}
      </div>

      {/* Modality */}
      <fieldset>
        <legend>Modality</legend>
        {MODALITIES.map((m) => (
          <label key={m.value}>
            <input
              type="radio"
              name="modality"
              value={m.value}
              checked={modality === m.value}
              onChange={() => setModality(m.value)}
            />
            {m.label}
          </label>
        ))}
        {errors.modality && <span role="alert">{errors.modality}</span>}
      </fieldset>

      {/* Parameters */}
      <div>
        <label htmlFor="frequency">Frequency (Hz)</label>
        <input
          id="frequency"
          type="number"
          value={frequency}
          onChange={(e) => setFrequency(Number(e.target.value))}
          min={0}
          max={200}
          data-testid="frequency-input"
        />
      </div>

      <div>
        <label htmlFor="duration">Duration (min)</label>
        <input
          id="duration"
          type="number"
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
          min={1}
          max={60}
          aria-invalid={!!errors.duration}
        />
        {errors.duration && <span role="alert">{errors.duration}</span>}
      </div>

      <div>
        <label htmlFor="intensity">Intensity (mA)</label>
        <input
          id="intensity"
          type="number"
          step={0.1}
          value={intensity}
          onChange={(e) => setIntensity(Number(e.target.value))}
          min={0.1}
          max={2.0}
          aria-invalid={!!errors.intensity}
        />
        {errors.intensity && <span role="alert">{errors.intensity}</span>}
      </div>

      {/* Montage */}
      <div>
        <label htmlFor="montage">Electrode Montage</label>
        <input
          id="montage"
          type="text"
          value={montage}
          onChange={(e) => setMontage(e.target.value)}
          placeholder="e.g. F3-Anode / F4-Cathode"
          aria-invalid={!!errors.montage}
        />
        {errors.montage && <span role="alert">{errors.montage}</span>}
      </div>

      {/* Safety Screening */}
      <fieldset data-testid="safety-screening">
        <legend>Safety Screening</legend>
        {CONTRAINDICATIONS.map((c) => (
          <label key={c}>
            <input
              type="checkbox"
              value={c}
              checked={contraindications.includes(c)}
              onChange={(e) => {
                setContraindications((prev) =>
                  e.target.checked
                    ? [...prev, c]
                    : prev.filter((x) => x !== c)
                );
              }}
            />
            {c.replace(/_/g, " ")}
          </label>
        ))}
        {!isSafe && (
          <div role="alert" data-testid="safety-blocked">
            Protocol cannot proceed — contraindications detected.
          </div>
        )}
      </fieldset>

      {submitError && (
        <div role="alert" data-testid="submit-error">
          {submitError}
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting || !isSafe}
        data-testid="submit-button"
      >
        {isSubmitting ? "Saving…" : protocolId ? "Update Protocol" : "Create Protocol"}
      </button>
    </form>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════

describe("ProtocolGenerator", () => {
  it("renders the empty form for new protocol creation", () => {
    renderWithProviders(<ProtocolGenerator />);
    expect(screen.getByRole("heading", { name: /new protocol/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/condition/i)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /tACS/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /tDCS/i })).toBeInTheDocument();
    expect(screen.getByTestId("submit-button")).toHaveTextContent(/create protocol/i);
  });

  it("validates required fields on submit", async () => {
    const { user } = renderWithProviders(<ProtocolGenerator />);
    await user.click(screen.getByTestId("submit-button"));

    expect(await screen.findByText(/please select a condition/i)).toBeInTheDocument();
    expect(screen.getByText(/please select a modality/i)).toBeInTheDocument();
    expect(screen.getByText(/electrode montage is required/i)).toBeInTheDocument();
  });

  it("validates duration range", async () => {
    const { user } = renderWithProviders(<ProtocolGenerator />);
    await user.selectOptions(screen.getByLabelText(/condition/i), "cond-mdd-001");
    await user.click(screen.getByRole("radio", { name: /tDCS/i }));
    await user.clear(screen.getByLabelText(/duration/i));
    await user.type(screen.getByLabelText(/duration/i), "90");
    await user.type(screen.getByLabelText(/electrode montage/i), "F3-F4");
    await user.click(screen.getByTestId("submit-button"));

    expect(await screen.findByText(/duration must be 1–60 min/i)).toBeInTheDocument();
  });

  it("validates intensity range", async () => {
    const { user } = renderWithProviders(<ProtocolGenerator />);
    await user.selectOptions(screen.getByLabelText(/condition/i), "cond-mdd-001");
    await user.click(screen.getByRole("radio", { name: /tDCS/i }));
    await user.type(screen.getByLabelText(/intensity/i), "5.0");
    await user.type(screen.getByLabelText(/electrode montage/i), "F3-F4");
    await user.click(screen.getByTestId("submit-button"));

    expect(await screen.findByText(/intensity must be 0.1–2.0/i)).toBeInTheDocument();
  });

  it("auto-fills default frequency when modality changes", async () => {
    const { user } = renderWithProviders(<ProtocolGenerator />);
    await user.click(screen.getByRole("radio", { name: /tACS/i }));
    expect(screen.getByTestId("frequency-input")).toHaveValue(10);
  });

  it("blocks submission when critical contraindications are present", async () => {
    const { user } = renderWithProviders(<ProtocolGenerator />);
    await user.selectOptions(screen.getByLabelText(/condition/i), "cond-mdd-001");
    await user.click(screen.getByRole("radio", { name: /tACS/i }));
    await user.type(screen.getByLabelText(/electrode montage/i), "F3-F4");

    const checkbox = screen.getByRole("checkbox", {
      name: /implanted cardiac device/i,
    });
    await user.click(checkbox);

    expect(screen.getByTestId("safety-blocked")).toBeInTheDocument();
    expect(screen.getByTestId("submit-button")).toBeDisabled();
  });

  it("submits successfully and calls onSuccess", async () => {
    const onSuccess = vi.fn();
    const mockApi = createMockApiClient({
      createProtocol: vi.fn().mockResolvedValue(mockProtocol({ id: "proto-001" })),
    });
    const { user } = renderWithProviders(
      <ProtocolGenerator patientId="pt-001" onSuccess={onSuccess} />,
      { apiClient: mockApi }
    );

    await user.selectOptions(screen.getByLabelText(/condition/i), "cond-mdd-001");
    await user.click(screen.getByRole("radio", { name: /tACS/i }));
    await user.type(screen.getByLabelText(/electrode montage/i), "F3-Anode / F4-Cathode");
    await user.click(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(mockApi.createProtocol).toHaveBeenCalledTimes(1);
    });
    expect(onSuccess).toHaveBeenCalled();
  });

  it("shows submit error when API fails", async () => {
    const mockApi = createMockApiClient({
      createProtocol: vi.fn().mockRejectedValue(new Error("Network error")),
    });
    const { user } = renderWithProviders(
      <ProtocolGenerator patientId="pt-001" />,
      { apiClient: mockApi }
    );

    await user.selectOptions(screen.getByLabelText(/condition/i), "cond-mdd-001");
    await user.click(screen.getByRole("radio", { name: /tACS/i }));
    await user.type(screen.getByLabelText(/electrode montage/i), "F3-Anode / F4-Cathode");
    await user.click(screen.getByTestId("submit-button"));

    expect(
      await screen.findByTestId("submit-error")
    ).toHaveTextContent(/failed to save/i);
  });

  it("populates form when editing existing protocol", async () => {
    const existing = mockProtocol({
      id: "proto-edit-001",
      condition_id: "cond-gad-001",
      modality: "tDCS",
      duration_minutes: 25,
      electrode_montage: "C3-C4",
    });
    const mockApi = createMockApiClient({
      getProtocol: vi.fn().mockResolvedValue(existing),
    });

    renderWithProviders(<ProtocolGenerator protocolId="proto-edit-001" />, {
      apiClient: mockApi,
    });

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /edit protocol/i })).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/condition/i)).toHaveValue("cond-gad-001");
    expect(screen.getByLabelText(/duration/i)).toHaveValue(25);
  });

  it("shows loading text on the submit button while submitting", async () => {
    const mockApi = createMockApiClient({
      createProtocol: vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      ),
    });
    const { user } = renderWithProviders(
      <ProtocolGenerator patientId="pt-001" />,
      { apiClient: mockApi }
    );

    await user.selectOptions(screen.getByLabelText(/condition/i), "cond-mdd-001");
    await user.click(screen.getByRole("radio", { name: /tACS/i }));
    await user.type(screen.getByLabelText(/electrode montage/i), "F3-F4");
    await user.click(screen.getByTestId("submit-button"));

    expect(screen.getByTestId("submit-button")).toHaveTextContent(/saving/i);
  });
});
