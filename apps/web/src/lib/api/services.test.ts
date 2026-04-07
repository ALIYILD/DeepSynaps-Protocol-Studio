import { beforeEach, describe, expect, it, vi } from "vitest";

import { requestJson } from "./client";
import {
  fetchAuditTrailForRole,
  fetchDeviceRegistry,
  fetchEvidenceLibrary,
  generateProtocolDraft,
  submitReviewAction,
} from "./services";

vi.mock("./client", () => ({
  requestJson: vi.fn(),
}));

const mockedRequestJson = vi.mocked(requestJson);

describe("API services", () => {
  beforeEach(() => {
    mockedRequestJson.mockReset();
  });

  it("maps evidence list responses", async () => {
    mockedRequestJson.mockResolvedValueOnce({
      items: [
        {
          id: "e1",
          title: "Evidence",
          condition: "Parkinson's disease",
          symptom_cluster: "Motor symptoms",
          modality: "TPS",
          evidence_level: "Systematic Review",
          regulatory_status: "Emerging",
          summary: "Summary",
          evidence_strength: "Moderate",
          supported_methods: ["Method"],
          contraindications: ["Contraindication"],
          references: ["Reference"],
          related_devices: ["NEUROLITH"],
          approved_notes: ["Approved"],
          emerging_notes: ["Emerging"],
          disclaimers: {
            professional_use_only: "For professional use only.",
            clinician_judgment: "Not a substitute for clinician judgment.",
          },
        },
      ],
      total: 1,
      disclaimers: {
        professional_use_only: "For professional use only.",
        clinician_judgment: "Not a substitute for clinician judgment.",
      },
    });

    const response = await fetchEvidenceLibrary();

    expect(response.items[0].symptomCluster).toBe("Motor symptoms");
    expect(response.disclaimers.professionalUseOnly).toBe("For professional use only.");
  });

  it("maps device registry responses", async () => {
    mockedRequestJson.mockResolvedValueOnce({
      items: [
        {
          id: "dev1",
          name: "NEUROLITH",
          manufacturer: "Sample Clinical Systems",
          modality: "TPS",
          channels: 1,
          use_type: "Clinic",
          regions: ["EU sample"],
          regulatory_status: "Emerging",
          summary: "Summary",
          best_for: ["Best fit"],
          constraints: ["Constraint"],
          sample_data_notice: "Sample data notice",
          disclaimers: {
            professional_use_only: "For professional use only.",
            clinician_judgment: "Not a substitute for clinician judgment.",
          },
        },
      ],
      total: 1,
      disclaimers: {
        professional_use_only: "For professional use only.",
        clinician_judgment: "Not a substitute for clinician judgment.",
      },
    });

    const response = await fetchDeviceRegistry();

    expect(response.items[0].useType).toBe("Clinic");
    expect(response.items[0].sampleDataNotice).toBe("Sample data notice");
  });

  it("sends authorization headers and no role field for protocol drafts", async () => {
    mockedRequestJson.mockResolvedValueOnce({
      rationale: "Rationale",
      target_region: "Target",
      session_frequency: "Frequency",
      duration: "25 minutes",
      escalation_logic: [],
      monitoring_plan: [],
      contraindications: [],
      patient_communication_notes: [],
      evidence_grade: "Systematic Review",
      approval_status_badge: "clinician-reviewed draft",
      off_label_review_required: false,
      disclaimers: {
        professional_use_only: "For professional use only.",
        clinician_judgment: "Not a substitute for clinician judgment.",
      },
    });

    await generateProtocolDraft({
      role: "clinician",
      condition: "Parkinson's disease",
      symptomCluster: "Motor symptoms",
      modality: "TPS",
      device: "NEUROLITH",
      setting: "Clinic",
      evidenceThreshold: "Systematic Review",
      offLabel: false,
    });

    const [, init] = mockedRequestJson.mock.calls[0];
    expect(init?.headers).toEqual({ Authorization: "Bearer clinician-demo-token" });
    expect(init?.body).toContain("\"condition\":\"Parkinson's disease\"");
    expect(init?.body).not.toContain("\"role\"");
  });

  it("sends authorization headers and no role field for review actions", async () => {
    mockedRequestJson.mockResolvedValueOnce({
      event: {
        event_id: "evt-1001",
        target_id: "proto-parkinsons-tps",
        target_type: "protocol",
        action: "reviewed",
        role: "clinician",
        note: "Saved.",
        created_at: "2026-04-07T08:32:04Z",
      },
      disclaimers: {
        professional_use_only: "For professional use only.",
        clinician_judgment: "Not a substitute for clinician judgment.",
      },
    });

    await submitReviewAction({
      role: "admin",
      targetId: "proto-parkinsons-tps",
      targetType: "protocol",
      action: "reviewed",
      note: "Saved.",
    });

    const [, init] = mockedRequestJson.mock.calls[0];
    expect(init?.headers).toEqual({ Authorization: "Bearer admin-demo-token" });
    expect(init?.body).toContain("\"target_id\":\"proto-parkinsons-tps\"");
    expect(init?.body).not.toContain("\"role\"");
  });

  it("fetches the audit trail with the selected role token", async () => {
    mockedRequestJson.mockResolvedValueOnce({
      items: [],
      total: 0,
      disclaimers: {
        professional_use_only: "For professional use only.",
        clinician_judgment: "Not a substitute for clinician judgment.",
      },
    });

    await fetchAuditTrailForRole("admin");

    const [, init] = mockedRequestJson.mock.calls[0];
    expect(init?.headers).toEqual({ Authorization: "Bearer admin-demo-token" });
  });
});
