/**
 * Tests for multimodal intelligence React components.
 * Tests: InsightCard, TimelineView, CorrelationCard, ConfounderCard, DataQualityFlags
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

import InsightCard from "../src/components/multimodal/InsightCard";
import TimelineView from "../src/components/multimodal/TimelineView";
import CorrelationCard from "../src/components/multimodal/CorrelationCard";
import ConfounderCard from "../src/components/multimodal/ConfounderCard";
import DataQualityFlags from "../src/components/multimodal/DataQualityFlags";

// ── Mock Data ─────────────────────────────────────────────────────────────────

const mockInsight = {
  insight_id: "ins_test_001",
  insight_type: "correlation",
  patient_id: "patient-001",
  modalities_involved: ["assessment", "qeeg"],
  timeline_window: ["2024-01-01T00:00:00", "2024-06-01T00:00:00"],
  summary: "Temporal association between assessment and qEEG patterns. Temporal association only. Not causal proof.",
  supporting_events: ["evt_001", "evt_002"],
  conflicting_events: [],
  evidence_links: [
    { evidence_id: "ev_001", evidence_grade: "B", confidence: 0.72 },
  ],
  confidence: 0.65,
  uncertainty_drivers: ["Limited sample size", "Single-patient observation"],
  clinician_review_required: true,
  safety_labels: ["Temporal association only. Not causal proof.", "Decision support only. Requires clinician review."],
};

const mockTimelineEvents = [
  {
    event_id: "evt_001",
    patient_id: "patient-001",
    event_type: "cognitive_assessment",
    modality: "assessment",
    source_system: "ehr",
    source_record_id: "rec_001",
    timestamp: "2024-03-15T10:00:00",
    value_summary: "MMSE score 26/30",
    confidence: 0.85,
    data_quality: "high",
    provenance: { recorder: "Dr. Smith", validated: true },
    evidence_links: [],
    audit_reference: "audit_abc123",
  },
  {
    event_id: "evt_002",
    patient_id: "patient-001",
    event_type: "qEEG_recording",
    modality: "qeeg",
    source_system: "neuro_lab",
    source_record_id: "rec_002",
    timestamp: "2024-03-17T14:00:00",
    value_summary: "Elevated delta power in frontal regions",
    confidence: 0.75,
    data_quality: "high",
    provenance: { device: "BrainAmp", technician: "Tech-3" },
    evidence_links: [],
    audit_reference: "audit_def456",
  },
  {
    event_id: "evt_003",
    patient_id: "patient-001",
    event_type: "sleep_summary",
    modality: "wearable",
    source_system: "fitbit",
    source_record_id: "rec_003",
    timestamp: "2024-03-18T08:00:00",
    value_summary: "Average sleep 5.2h, fragmented",
    confidence: 0.60,
    data_quality: "medium",
    provenance: { device_model: "Fitbit Charge 5" },
    evidence_links: [],
    audit_reference: "audit_ghi789",
  },
];

const mockCorrelation = {
  insight_id: "ins_corr_001",
  insight_type: "correlation",
  modalities_involved: ["assessment", "qeeg"],
  timeline_window: ["2024-01-01", "2024-06-01"],
  summary: "Temporal association between assessment decline and qEEG delta elevation observed.",
  supporting_events: ["evt_001", "evt_002"],
  conflicting_events: [],
  confidence: 0.72,
  uncertainty_drivers: ["Temporal proximity not causation", "Limited data points"],
  safety_labels: ["Temporal association only. Not causal proof.", "Decision support only. Requires clinician review."],
};

const mockConfounder = {
  insight_id: "ins_conf_001",
  insight_type: "confound",
  modalities_involved: ["medication", "assessment"],
  timeline_window: ["2024-01-01", "2024-06-01"],
  summary: "Possible confounder: Medication changes may affect cognitive assessments.",
  confounders: [
    {
      confounder_id: "cnf_001",
      confounder_type: "medication",
      description: "Anticholinergic burden from medication may reduce cognitive test scores.",
      severity: "high",
      evidence_events: ["evt_004"],
      impact_estimate: "May reduce cognitive test scores by 10-20%",
      mitigation_suggestion: "Review medication timing relative to assessment dates.",
    },
  ],
  supporting_events: ["evt_004"],
  confidence: 0.8,
  uncertainty_drivers: ["Confounder detection based on pattern matching"],
  safety_labels: ["Possible contributor.", "Decision support only. Requires clinician review."],
};

const mockQualityFlags = [
  {
    insight_id: "ins_qf_001",
    insight_type: "quality_flag",
    modalities_involved: ["mri"],
    timeline_window: ["2024-01-01", "2024-12-31"],
    summary: "No MRI data found in the last 365 days.",
    supporting_events: [],
    confidence: 0.95,
    safety_labels: ["Decision support only. Requires clinician review."],
  },
  {
    insight_id: "ins_qf_002",
    insight_type: "quality_flag",
    modalities_involved: ["wearable"],
    timeline_window: ["2024-01-01", "2024-12-31"],
    summary: "Last wearable data is 14 days old (threshold: 7 days).",
    supporting_events: ["evt_003"],
    confidence: 0.85,
    safety_labels: ["Decision support only. Requires clinician review."],
  },
];

// ── InsightCard Tests ─────────────────────────────────────────────────────────

describe("InsightCard", () => {
  it("renders clinician review banner at top", () => {
    render(<InsightCard insight={mockInsight} />);
    const banner = screen.getByTestId("review-banner");
    expect(banner).toBeDefined();
    expect(banner.textContent).toContain("Requires clinician review");
  });

  it("displays evidence grade badge", () => {
    render(<InsightCard insight={mockInsight} />);
    expect(screen.getByTestId("evidence-grade").textContent).toContain("B");
  });

  it("renders confidence bar with percentage", () => {
    render(<InsightCard insight={mockInsight} />);
    expect(screen.getByTestId("confidence-value").textContent).toContain("65%");
    expect(screen.getByTestId("confidence-bar")).toBeDefined();
  });

  it("shows uncertainty drivers", () => {
    render(<InsightCard insight={mockInsight} />);
    expect(screen.getByTestId("uncertainty-drivers")).toBeDefined();
    expect(screen.getByText(/Limited sample size/i)).toBeDefined();
  });

  it("renders supporting events", () => {
    render(<InsightCard insight={mockInsight} />);
    expect(screen.getByTestId("supporting-events")).toBeDefined();
  });

  it("renders safety labels as pills", () => {
    render(<InsightCard insight={mockInsight} />);
    const labels = screen.getByTestId("safety-labels");
    expect(labels).toBeDefined();
    expect(labels.children.length).toBe(mockInsight.safety_labels.length);
  });

  it("renders nothing when insight is null", () => {
    const { container } = render(<InsightCard insight={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("never implies causal certainty in summary", () => {
    render(<InsightCard insight={mockInsight} />);
    const summary = screen.getByTestId("insight-summary").textContent.toLowerCase();
    expect(summary).not.toContain("caused by");
    expect(summary).not.toContain("causes");
    expect(summary).not.toContain("definitely");
    expect(summary).not.toContain("proven");
  });
});

// ── TimelineView Tests ────────────────────────────────────────────────────────

describe("TimelineView", () => {
  it("renders safety disclaimer at top", () => {
    render(<TimelineView patientId="patient-001" events={mockTimelineEvents} />);
    expect(screen.getByTestId("safety-disclaimer")).toBeDefined();
    expect(screen.getByText(/decision support only/i)).toBeDefined();
  });

  it("renders filter controls", () => {
    render(<TimelineView patientId="patient-001" events={mockTimelineEvents} />);
    expect(screen.getByTestId("filter-controls")).toBeDefined();
    expect(screen.getByTestId("date-from")).toBeDefined();
    expect(screen.getByTestId("date-to")).toBeDefined();
  });

  it("renders all events in timeline", () => {
    render(<TimelineView patientId="patient-001" events={mockTimelineEvents} />);
    const list = screen.getByTestId("timeline-list");
    expect(list).toBeDefined();
    mockTimelineEvents.forEach((evt) => {
      expect(screen.getByTestId(`timeline-event-${evt.event_id}`)).toBeDefined();
    });
  });

  it("shows event count summary", () => {
    render(<TimelineView patientId="patient-001" events={mockTimelineEvents} />);
    expect(screen.getByText(/3 events?/)).toBeDefined();
  });

  it("expands event on click", () => {
    render(<TimelineView patientId="patient-001" events={mockTimelineEvents} />);
    const header = screen.getByTestId(`event-header-${mockTimelineEvents[0].event_id}`);
    fireEvent.click(header);
    expect(screen.getByTestId(`event-details-${mockTimelineEvents[0].event_id}`)).toBeDefined();
  });

  it("shows modality filter buttons", () => {
    render(<TimelineView patientId="patient-001" events={mockTimelineEvents} />);
    expect(screen.getByTestId("modality-filter-assessment")).toBeDefined();
    expect(screen.getByTestId("modality-filter-qeeg")).toBeDefined();
    expect(screen.getByTestId("modality-filter-wearable")).toBeDefined();
  });

  it("displays empty state when no events match filters", () => {
    render(<TimelineView patientId="patient-001" events={[]} />);
    expect(screen.getByText(/No events match/i)).toBeDefined();
  });
});

// ── CorrelationCard Tests ─────────────────────────────────────────────────────

describe("CorrelationCard", () => {
  it("renders clinician review banner at top", () => {
    render(<CorrelationCard correlation={mockCorrelation} />);
    const banner = screen.getByTestId("review-banner");
    expect(banner).toBeDefined();
    expect(banner.textContent).toContain("Requires clinician review");
  });

  it("shows confidence badge color-coded green for >0.7", () => {
    render(<CorrelationCard correlation={mockCorrelation} />);
    const badge = screen.getByTestId("confidence-badge");
    expect(badge.textContent).toContain("72%");
  });

  it("shows 'Temporal association only' safety label badge", () => {
    render(<CorrelationCard correlation={mockCorrelation} />);
    expect(screen.getByTestId("safety-label").textContent).toContain("Temporal association only");
  });

  it("lists supporting events as links", () => {
    render(<CorrelationCard correlation={mockCorrelation} />);
    expect(screen.getByText(/Supporting events/i)).toBeDefined();
  });

  it("lists uncertainty drivers", () => {
    render(<CorrelationCard correlation={mockCorrelation} />);
    expect(screen.getByTestId("uncertainty-drivers")).toBeDefined();
  });

  it("renders nothing when correlation is null", () => {
    const { container } = render(<CorrelationCard correlation={null} />);
    expect(container.firstChild).toBeNull();
  });
});

// ── ConfounderCard Tests ──────────────────────────────────────────────────────

describe("ConfounderCard", () => {
  it("renders yellow warning styling", () => {
    render(<ConfounderCard confounder={mockConfounder} />);
    const card = screen.getByTestId("confounder-card");
    expect(card.className).toContain("amber-50");
  });

  it("shows severity badge", () => {
    render(<ConfounderCard confounder={mockConfounder} />);
    expect(screen.getByTestId("severity-badge-0").textContent).toContain("high");
  });

  it("displays impact estimate text", () => {
    render(<ConfounderCard confounder={mockConfounder} />);
    expect(screen.getByTestId("impact-estimate-0").textContent).toContain("10-20%");
  });

  it("shows mitigation suggestions with icon", () => {
    render(<ConfounderCard confounder={mockConfounder} />);
    expect(screen.getByTestId("mitigation-0").textContent).toContain("Review medication timing");
  });

  it("lists evidence event references", () => {
    render(<ConfounderCard confounder={mockConfounder} />);
    expect(screen.getByTestId("confounder-candidate-0")).toBeDefined();
  });

  it("renders nothing when confounder is null", () => {
    const { container } = render(<ConfounderCard confounder={null} />);
    expect(container.firstChild).toBeNull();
  });
});

// ── DataQualityFlags Tests ────────────────────────────────────────────────────

describe("DataQualityFlags", () => {
  it("renders safety disclaimer", () => {
    render(<DataQualityFlags flags={mockQualityFlags} />);
    expect(screen.getByText(/Data quality flags are decision support only/i)).toBeDefined();
  });

  it("renders clinician review banner", () => {
    render(<DataQualityFlags flags={mockQualityFlags} />);
    expect(screen.getByText(/Requires clinician review/i)).toBeDefined();
  });

  it("shows severity badges for each flag", () => {
    render(<DataQualityFlags flags={mockQualityFlags} />);
    expect(screen.getByTestId("severity-badge-0")).toBeDefined();
    expect(screen.getByTestId("severity-badge-1")).toBeDefined();
  });

  it("displays actionable suggestions with icons", () => {
    render(<DataQualityFlags flags={mockQualityFlags} />);
    expect(screen.getByText(/Suggestion:/i)).toBeDefined();
  });

  it("shows empty state when no flags", () => {
    render(<DataQualityFlags flags={[]} />);
    expect(screen.getByTestId("quality-flags-empty")).toBeDefined();
    expect(screen.getByText(/All data quality checks passed/i)).toBeDefined();
  });

  it("renders summary for each flag", () => {
    render(<DataQualityFlags flags={mockQualityFlags} />);
    mockQualityFlags.forEach((flag, idx) => {
      expect(screen.getByTestId(`flag-summary-${idx}`)).toBeDefined();
    });
  });
});
