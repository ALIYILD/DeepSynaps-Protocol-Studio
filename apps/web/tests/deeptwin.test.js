/**
 * Tests for DeepTwin SynthesisDashboard page.
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import SynthesisDashboard from "../src/pages-deeptwin/SynthesisDashboard";
import * as api from "../src/api";

// ── Mock API ──────────────────────────────────────────────────────────────────

vi.mock("../src/api", () => ({
  fetchTimeline: vi.fn(),
  fetchCorrelations: vi.fn(),
  fetchConfounders: vi.fn(),
  fetchQualityFlags: vi.fn(),
  requestSynthesis: vi.fn(),
}));

const mockTimelineResponse = {
  patient_id: "patient-001",
  events: [
    {
      event_id: "evt_001",
      modality: "assessment",
      timestamp: "2024-03-15T10:00:00",
      value_summary: "MMSE score 26/30",
      data_quality: "high",
      confidence: 0.85,
      provenance: {},
    },
    {
      event_id: "evt_002",
      modality: "qeeg",
      timestamp: "2024-03-17T14:00:00",
      value_summary: "Elevated delta power in frontal regions",
      data_quality: "high",
      confidence: 0.75,
      provenance: {},
    },
  ],
  event_count: 2,
  safety_disclaimer: "This output is decision support only and requires clinician review.",
};

const mockCorrelationResponse = {
  patient_id: "patient-001",
  correlations: [
    {
      insight_id: "ins_corr_001",
      insight_type: "correlation",
      modalities_involved: ["assessment", "qeeg"],
      summary: "Temporal association between assessment and qEEG patterns observed.",
      confidence: 0.72,
      supporting_events: ["evt_001", "evt_002"],
      conflicting_events: [],
      uncertainty_drivers: ["Temporal proximity does not imply causation"],
      safety_labels: ["Temporal association only. Not causal proof.", "Decision support only. Requires clinician review."],
    },
  ],
  safety_disclaimer: "This output is decision support only and requires clinician review.",
};

const mockConfounderResponse = {
  patient_id: "patient-001",
  confounders: [
    {
      insight_id: "ins_conf_001",
      insight_type: "confound",
      modalities_involved: ["medication", "assessment"],
      summary: "Possible confounder: Medication changes may affect assessments.",
      confidence: 0.8,
      confounders: [{
        confounder_id: "cnf_001",
        confounder_type: "medication",
        description: "Anticholinergic burden may reduce cognitive scores.",
        severity: "high",
        impact_estimate: "May reduce scores by 10-20%",
        mitigation_suggestion: "Review medication timing.",
        evidence_events: ["evt_003"],
      }],
      supporting_events: ["evt_003"],
      uncertainty_drivers: ["Confounder detection based on pattern matching"],
      safety_labels: ["Possible contributor.", "Decision support only. Requires clinician review."],
    },
  ],
  safety_disclaimer: "This output is decision support only and requires clinician review.",
};

const mockQualityResponse = {
  patient_id: "patient-001",
  quality_flags: [
    {
      insight_id: "ins_qf_001",
      insight_type: "quality_flag",
      modalities_involved: ["mri"],
      summary: "No MRI data found in the last 365 days.",
      confidence: 0.95,
      supporting_events: [],
      safety_labels: ["Decision support only. Requires clinician review."],
    },
  ],
  safety_disclaimer: "This output is decision support only and requires clinician review.",
};

const mockSynthesisResponse = {
  synthesis_id: "syn_abc123",
  patient_id: "patient-001",
  generated_at: "2024-06-01T12:00:00",
  timeline: mockTimelineResponse.events,
  correlations: mockCorrelationResponse.correlations,
  confounders: mockConfounderResponse.confounders,
  quality_flags: mockQualityResponse.quality_flags,
  ranked_hypotheses: [
    {
      insight_id: "ins_hyp_001",
      insight_type: "hypothesis",
      modalities_involved: ["assessment", "qeeg", "biomarker"],
      summary: "Cognitive performance changes observed with multimodal signals. Temporal association only. Not causal proof.",
      confidence: 0.72,
      supporting_events: ["evt_001", "evt_002"],
      conflicting_events: [],
      evidence_links: [{ evidence_id: "ev_001", evidence_grade: "B", confidence: 0.72 }],
      uncertainty_drivers: ["Single-patient observation", "Multiple unmeasured confounders"],
      clinician_review_required: true,
      safety_labels: ["Ranked clinical hypothesis. Requires clinician review.", "Decision support only. Requires clinician review."],
    },
  ],
  evidence_summary: {
    total_insights: 4,
    correlations: 1,
    confounders: 1,
    hypotheses: 1,
    quality_flags: 1,
    evidence_grades: { A: 0, B: 1, C: 0, D: 0 },
    average_confidence: 0.73,
    generated_at: "2024-06-01T12:00:00",
  },
  safety_disclaimer: "This output is decision support only and requires clinician review. It does not constitute a diagnosis or treatment recommendation.",
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("SynthesisDashboard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.fetchTimeline.mockResolvedValue(mockTimelineResponse);
    api.fetchCorrelations.mockResolvedValue(mockCorrelationResponse);
    api.fetchConfounders.mockResolvedValue(mockConfounderResponse);
    api.fetchQualityFlags.mockResolvedValue(mockQualityResponse);
    api.requestSynthesis.mockResolvedValue(mockSynthesisResponse);
  });

  it("renders safety disclaimer banner at top", async () => {
    render(<SynthesisDashboard />);
    await waitFor(() => {
      expect(screen.getByTestId("safety-banner")).toBeDefined();
    });
    expect(screen.getByText(/Safety Disclaimer/i)).toBeDefined();
    expect(screen.getByText(/decision support only/i)).toBeDefined();
  });

  it("renders all 5 tabs", async () => {
    render(<SynthesisDashboard />);
    await waitFor(() => {
      expect(screen.getByTestId("tab-timeline")).toBeDefined();
    });
    expect(screen.getByTestId("tab-correlations")).toBeDefined();
    expect(screen.getByTestId("tab-confounders")).toBeDefined();
    expect(screen.getByTestId("tab-quality")).toBeDefined();
    expect(screen.getByTestId("tab-synthesis")).toBeDefined();
  });

  it("loads timeline on initial mount", async () => {
    render(<SynthesisDashboard />);
    await waitFor(() => {
      expect(api.fetchTimeline).toHaveBeenCalledWith("demo-patient-001", expect.any(Object));
    });
  });

  it("shows timeline panel by default", async () => {
    render(<SynthesisDashboard />);
    await waitFor(() => {
      expect(screen.getByTestId("panel-timeline")).toBeDefined();
    });
  });

  it("switches to correlations tab on click", async () => {
    render(<SynthesisDashboard />);
    await waitFor(() => screen.getByTestId("tab-correlations"));
    fireEvent.click(screen.getByTestId("tab-correlations"));
    await waitFor(() => {
      expect(screen.getByTestId("panel-correlations")).toBeDefined();
    });
  });

  it("switches to confounders tab on click", async () => {
    render(<SynthesisDashboard />);
    await waitFor(() => screen.getByTestId("tab-confounders"));
    fireEvent.click(screen.getByTestId("tab-confounders"));
    await waitFor(() => {
      expect(screen.getByTestId("panel-confounders")).toBeDefined();
    });
  });

  it("switches to quality flags tab on click", async () => {
    render(<SynthesisDashboard />);
    await waitFor(() => screen.getByTestId("tab-quality"));
    fireEvent.click(screen.getByTestId("tab-quality"));
    await waitFor(() => {
      expect(screen.getByTestId("panel-quality")).toBeDefined();
    });
  });

  it("switches to synthesis tab on click", async () => {
    render(<SynthesisDashboard />);
    await waitFor(() => screen.getByTestId("tab-synthesis"));
    fireEvent.click(screen.getByTestId("tab-synthesis"));
    await waitFor(() => {
      expect(screen.getByTestId("panel-synthesis")).toBeDefined();
    });
  });

  it("shows loading state while fetching data", async () => {
    api.fetchTimeline.mockImplementation(() => new Promise(() => {})); // Never resolves
    render(<SynthesisDashboard />);
    await waitFor(() => {
      expect(screen.getByTestId("loading-indicator")).toBeDefined();
    });
  });

  it("displays error message on API failure", async () => {
    api.fetchTimeline.mockRejectedValue(new Error("Network error"));
    render(<SynthesisDashboard />);
    await waitFor(() => {
      expect(screen.getByTestId("error-message")).toBeDefined();
    });
    expect(screen.getByText(/Network error/i)).toBeDefined();
  });

  it("synthesis tab shows 'Run Synthesis' button", async () => {
    render(<SynthesisDashboard />);
    await waitFor(() => screen.getByTestId("tab-synthesis"));
    fireEvent.click(screen.getByTestId("tab-synthesis"));
    await waitFor(() => {
      expect(screen.getByTestId("run-synthesis-btn")).toBeDefined();
    });
  });

  it("clicking 'Run Synthesis' calls requestSynthesis", async () => {
    render(<SynthesisDashboard />);
    await waitFor(() => screen.getByTestId("tab-synthesis"));
    fireEvent.click(screen.getByTestId("tab-synthesis"));
    await waitFor(() => screen.getByTestId("run-synthesis-btn"));
    fireEvent.click(screen.getByTestId("run-synthesis-btn"));
    await waitFor(() => {
      expect(api.requestSynthesis).toHaveBeenCalledWith(
        "demo-patient-001",
        expect.objectContaining({
          include_modalities: expect.any(Array),
          date_range: expect.any(Array),
          max_hypotheses: 5,
        })
      );
    });
  });

  it("synthesis results display evidence summary", async () => {
    render(<SynthesisDashboard />);
    await waitFor(() => screen.getByTestId("tab-synthesis"));
    fireEvent.click(screen.getByTestId("tab-synthesis"));
    await waitFor(() => screen.getByTestId("run-synthesis-btn"));
    fireEvent.click(screen.getByTestId("run-synthesis-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("evidence-summary")).toBeDefined();
    });
  });

  it("synthesis results display ranked hypotheses", async () => {
    render(<SynthesisDashboard />);
    await waitFor(() => screen.getByTestId("tab-synthesis"));
    fireEvent.click(screen.getByTestId("tab-synthesis"));
    await waitFor(() => screen.getByTestId("run-synthesis-btn"));
    fireEvent.click(screen.getByTestId("run-synthesis-btn"));
    await waitFor(() => {
      expect(screen.getAllByTestId("insight-card").length).toBeGreaterThan(0);
    });
  });

  it("synthesis results display safety disclaimer", async () => {
    render(<SynthesisDashboard />);
    await waitFor(() => screen.getByTestId("tab-synthesis"));
    fireEvent.click(screen.getByTestId("tab-synthesis"));
    await waitFor(() => screen.getByTestId("run-synthesis-btn"));
    fireEvent.click(screen.getByTestId("run-synthesis-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("synthesis-disclaimer")).toBeDefined();
    });
  });

  it("never shows causal certainty in hypothesis text", async () => {
    render(<SynthesisDashboard />);
    await waitFor(() => screen.getByTestId("tab-synthesis"));
    fireEvent.click(screen.getByTestId("tab-synthesis"));
    await waitFor(() => screen.getByTestId("run-synthesis-btn"));
    fireEvent.click(screen.getByTestId("run-synthesis-btn"));
    await waitFor(() => {
      const dashboard = screen.getByTestId("synthesis-dashboard");
      const text = dashboard.textContent.toLowerCase();
      expect(text).not.toContain("caused by");
      expect(text).not.toContain("causes");
      expect(text).not.toContain("definitely");
      expect(text).not.toContain("certain");
      expect(text).not.toContain("proven");
    });
  });
});
