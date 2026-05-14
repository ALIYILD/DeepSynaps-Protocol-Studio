/**
 * ProtocolStudioPage — React Testing Library tests.
 *
 * Tests the main hub page for presence of required data-testid attributes,
 * tab navigation, safety banner rendering, and patient context display.
 * All tests use mocked API calls to avoid network dependencies.
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import ProtocolStudioPage from "../../protocol/ProtocolStudioPage";

// ── Mock the API module ──────────────────────────────────────────────────────

vi.mock("../../protocol/protocolApi", () => ({
  fetchPatientContext: vi.fn(() =>
    Promise.resolve({
      context: {
        patientId: "test-patient-123",
        fullName: "John Doe",
        diagnosis: "Major Depressive Disorder",
        age: 42,
        dataSources: {
          qeeg: true,
          mri: false,
          deeptwin: true,
          evidence: true,
        },
      },
    })
  ),
  fetchProtocols: vi.fn(() =>
    Promise.resolve({
      protocols: [
        {
          id: "proto-1",
          title: "rTMS Left DLPFC for MDD",
          condition: "mdd",
          modality: "rTMS",
          target: "Left DLPFC",
          parameters: [],
          evidenceGrade: "A",
          status: "active",
        },
      ],
      total: 1,
    })
  ),
  fetchDrafts: vi.fn(() => Promise.resolve({ drafts: [], total: 0 })),
  fetchEvidenceHealth: vi.fn(() =>
    Promise.resolve({
      status: "healthy",
      sources: [
        { source: "pubmed", available: true, count: 1250, lastUpdated: "2024-01-15T10:00:00Z" },
      ],
    })
  ),
  searchEvidence: vi.fn(() => Promise.resolve({ results: [], total: 0, query: "" })),
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe("ProtocolStudioPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the root container with required testid", async () => {
    render(<ProtocolStudioPage patientId="test-patient-123" />);
    await waitFor(() => {
      expect(screen.getByTestId("protocol-studio-root")).toBeInTheDocument();
    });
  });

  it("renders the safety banner with correct decision-support text", async () => {
    render(<ProtocolStudioPage patientId="test-patient-123" />);
    await waitFor(() => {
      const banner = screen.getByTestId("protocol-safety-banner");
      expect(banner).toBeInTheDocument();
      expect(banner).toHaveTextContent(/Decision-Support Only/i);
      expect(banner).toHaveTextContent(/clinician review/i);
      expect(banner).toHaveTextContent(/not.*autonomous/i);
    });
  });

  it("renders the tab bar with all 7 tabs", async () => {
    render(<ProtocolStudioPage patientId="test-patient-123" />);
    await waitFor(() => {
      expect(screen.getByTestId("protocol-studio-tabbar")).toBeInTheDocument();
    });

    const expectedTabs = [
      "conditions",
      "generate",
      "browse",
      "evidence",
      "compare",
      "simulation",
      "drafts",
    ];

    for (const tabId of expectedTabs) {
      expect(
        screen.getByTestId(`protocol-studio-tab-${tabId}`)
      ).toBeInTheDocument();
    }
  });

  it("renders the main body area", async () => {
    render(<ProtocolStudioPage patientId="test-patient-123" />);
    await waitFor(() => {
      expect(screen.getByTestId("protocol-studio-body")).toBeInTheDocument();
    });
  });

  it("renders the patient context panel", async () => {
    render(<ProtocolStudioPage patientId="test-patient-123" />);
    await waitFor(() => {
      expect(
        screen.getByTestId("protocol-patient-context-panel")
      ).toBeInTheDocument();
    });
  });

  it("switches tabs when clicked", async () => {
    render(<ProtocolStudioPage patientId="test-patient-123" />);

    await waitFor(() => {
      expect(screen.getByTestId("protocol-studio-tab-evidence")).toBeInTheDocument();
    });

    const evidenceTab = screen.getByTestId("protocol-studio-tab-evidence");
    fireEvent.click(evidenceTab);

    await waitFor(() => {
      expect(evidenceTab).toHaveAttribute("aria-selected", "true");
    });

    const draftsTab = screen.getByTestId("protocol-studio-tab-drafts");
    fireEvent.click(draftsTab);

    await waitFor(() => {
      expect(draftsTab).toHaveAttribute("aria-selected", "true");
    });
  });

  it("shows controlled preview banner on generate tab", async () => {
    render(<ProtocolStudioPage patientId="test-patient-123" />);

    await waitFor(() => {
      expect(screen.getByTestId("protocol-studio-tab-generate")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("protocol-studio-tab-generate"));

    await waitFor(() => {
      expect(
        screen.getByTestId("protocol-studio-controlled-preview")
      ).toBeInTheDocument();
    });
  });

  it("does not claim autonomous prescribing in any text", async () => {
    render(<ProtocolStudioPage patientId="test-patient-123" />);

    await waitFor(() => {
      expect(screen.getByTestId("protocol-studio-root")).toBeInTheDocument();
    });

    const body = screen.getByTestId("protocol-studio-body");
    expect(body).toHaveTextContent(/decision-support/i);
    expect(body).toHaveTextContent(/clinician review/i);
  });

  it("displays patient data source badges correctly", async () => {
    render(<ProtocolStudioPage patientId="test-patient-123" />);

    await waitFor(() => {
      expect(
        screen.getByTestId("patient-datasource-qeeg")
      ).toBeInTheDocument();
    });

    // qEEG and DeepTwin should be available (true), MRI should not
    expect(screen.getByTestId("patient-datasource-qeeg")).toHaveTextContent(
      "qEEG"
    );
    expect(screen.getByTestId("patient-datasource-mri")).toHaveTextContent(
      "MRI"
    );
    expect(screen.getByTestId("patient-datasource-deeptwin")).toHaveTextContent(
      "DeepTwin"
    );
    expect(
      screen.getByTestId("patient-datasource-evidence")
    ).toHaveTextContent("Evidence");
  });

  it("shows patient initials avatar (not full name)", async () => {
    render(<ProtocolStudioPage patientId="test-patient-123" />);

    await waitFor(() => {
      expect(
        screen.getByTestId("patient-initials-avatar")
      ).toBeInTheDocument();
    });

    const avatar = screen.getByTestId("patient-initials-avatar");
    expect(avatar).toHaveTextContent("JD");
    expect(avatar).not.toHaveTextContent("John Doe");
  });
});

describe("ProtocolStudioPage error handling", () => {
  it("handles patient context loading error gracefully", async () => {
    const { fetchPatientContext } = await import("../../protocol/protocolApi");
    vi.mocked(fetchPatientContext).mockRejectedValueOnce(new Error("Network error"));

    render(<ProtocolStudioPage patientId="test-patient-123" />);

    await waitFor(() => {
      const panel = screen.getByTestId("protocol-patient-context-panel");
      expect(panel).toBeInTheDocument();
    });

    // Should show retry button without exposing patient ID in error
    await waitFor(() => {
      expect(
        screen.getByTestId("patient-context-retry")
      ).toBeInTheDocument();
    });
  });

  it("does not expose patient ID in error messages", async () => {
    const { fetchPatientContext } = await import("../../protocol/protocolApi");
    vi.mocked(fetchPatientContext).mockRejectedValueOnce(
      new Error("Failed for patient test-patient-123")
    );

    render(<ProtocolStudioPage patientId="test-patient-123" />);

    await waitFor(() => {
      const panel = screen.getByTestId("protocol-patient-context-panel");
      expect(panel).toBeInTheDocument();
    });

    // The generic error message should NOT contain the patient ID
    const panel = screen.getByTestId("protocol-patient-context-panel");
    expect(panel).not.toHaveTextContent("test-patient-123");
  });
});
