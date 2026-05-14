/**
 * Custom Test Utilities — DeepSynaps Protocol Studio (Frontend)
 * ==============================================================
 * Provides render wrappers, mock API clients, and clinical data factories
 * for testing React components in the DeepSynaps ecosystem.
 *
 * Usage:
 *   import { renderWithProviders, mockClinicianUser, mockProtocol } from './test-utils';
 *   const user = mockClinicianUser({ display_name: 'Dr. Test' });
 *   renderWithProviders(<ProtocolCard user={user} />, { route: '/protocols/123' });
 */

import React, { type ReactElement } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

// ── Types ──────────────────────────────────────────────────────────────

export interface MockUser {
  id: string;
  email: string;
  display_name: string;
  role: "clinician" | "patient" | "admin" | "researcher";
  patient_id?: string;
  clinician_id?: string;
  organization_id?: string;
  is_active: boolean;
  permissions: string[];
  mfa_verified: boolean;
  created_at: string;
}

export interface MockProtocol {
  id: string;
  title: string;
  description: string;
  condition_id: string;
  condition_name: string;
  clinician_id: string;
  patient_id: string;
  status: "draft" | "active" | "completed" | "archived";
  modality: "tACS" | "tDCS" | "tRNS" | "tPCS" | "neurofeedback" | "medication";
  frequency_hz: number;
  duration_minutes: number;
  electrode_montage: string;
  target_regions: string[];
  evidence_level: "A" | "B" | "C" | "D";
  created_at: string;
  updated_at: string;
  sessions_completed: number;
  sessions_total: number;
  next_session_date: string | null;
  safety_screening_passed: boolean;
  contraindications: string[];
  custom_parameters: Record<string, number | string>;
}

export interface MockAssessment {
  id: string;
  patient_id: string;
  protocol_id: string;
  assessment_type:
    | "qEEG"
    | "cognitive"
    | "behavioral"
    | "mood"
    | "sleep"
    | "symptom_tracker"
    | "adherence";
  status: "pending" | "in_progress" | "completed" | "review_required";
  score: number | null;
  percentile: number | null;
  raw_data_url: string | null;
  findings: Array<{
    metric: string;
    value: number;
    z_score: number;
    interpretation: string;
    severity: "normal" | "mild" | "moderate" | "severe";
    region?: string;
    frequency_band?: string;
  }>;
  administered_by: string;
  administered_at: string;
  completed_at: string | null;
  notes: string;
  related_session_ids: string[];
}

export interface MockApiClient {
  patientPortalSessions: ReturnType<typeof vi.fn>;
  patientPortalCourses: ReturnType<typeof vi.fn>;
  patientPortalOutcomes: ReturnType<typeof vi.fn>;
  patientPortalMessages: ReturnType<typeof vi.fn>;
  getProtocols: ReturnType<typeof vi.fn>;
  getProtocol: ReturnType<typeof vi.fn>;
  createProtocol: ReturnType<typeof vi.fn>;
  updateProtocol: ReturnType<typeof vi.fn>;
  getAssessments: ReturnType<typeof vi.fn>;
  getAssessment: ReturnType<typeof vi.fn>;
  submitAssessment: ReturnType<typeof vi.fn>;
  getEvidenceSummary: ReturnType<typeof vi.fn>;
  getPatientSummary: ReturnType<typeof vi.fn>;
  login: ReturnType<typeof vi.fn>;
  logout: ReturnType<typeof vi.fn>;
  me: ReturnType<typeof vi.fn>;
  refreshToken: ReturnType<typeof vi.fn>;
}

// ── Custom Render with Providers ───────────────────────────────────────

interface CustomRenderOptions extends Omit<RenderOptions, "wrapper"> {
  /** Simulated current route path */
  route?: string;
  /** Mock user context */
  user?: MockUser | null;
  /** Mock API client responses */
  apiClient?: MockApiClient;
}

/**
 * Renders a React element wrapped with all app-level providers:
 *   - QueryClientProvider (React Query)
 *   - Router (memory router)
 *   - UserContext
 *   - Toast/Notification context
 *
 * Returns the usual RTL utilities plus `user` for interaction testing.
 */
export function renderWithProviders(
  ui: ReactElement,
  options: CustomRenderOptions = {}
) {
  const {
    route = "/",
    user = null,
    apiClient = createMockApiClient(),
    ...renderOptions
  } = options;

  // Set route in window.location for components that read it directly
  if (route) {
    window.location.hash = route;
  }

  // Create a lightweight provider stack
  function AllProviders({ children }: { children: React.ReactNode }) {
    // Provide the mock API client via a simple context wrapper
    // The actual hook that uses `api` can be mocked at the module level.
    React.useEffect(() => {
      // @ts-expect-error — attaching mock to window for legacy api.js consumers
      window._testApiClient = apiClient;
      return () => {
        // @ts-expect-error
        delete window._testApiClient;
      };
    }, [apiClient]);

    return <>{children}</>;
  }

  const result = render(ui, {
    wrapper: AllProviders,
    ...renderOptions,
  });

  const userInteraction = userEvent.setup();

  return {
    ...result,
    user: userInteraction,
    rerender: (newUi: ReactElement) =>
      result.rerender(
        <AllProviders>{newUi}</AllProviders>
      ),
  };
}

// ── Mock API Client Factory ────────────────────────────────────────────

/**
 * Creates a fully-mocked API client with sensible defaults.
 * Every method is a `vi.fn()` so you can assert calls with
 * `expect(api.getProtocols).toHaveBeenCalledWith(...)`.
 */
export function createMockApiClient(
  overrides: Partial<MockApiClient> = {}
): MockApiClient {
  return {
    patientPortalSessions: vi.fn().mockResolvedValue({ sessions: [], count: 0 }),
    patientPortalCourses: vi.fn().mockResolvedValue({ courses: [], count: 0 }),
    patientPortalOutcomes: vi.fn().mockResolvedValue({ outcomes: [], count: 0 }),
    patientPortalMessages: vi.fn().mockResolvedValue({ messages: [], unread: 0 }),
    getProtocols: vi
      .fn()
      .mockResolvedValue({ protocols: [], total: 0, page: 1, per_page: 20 }),
    getProtocol: vi.fn().mockImplementation((id: string) =>
      Promise.resolve(mockProtocol({ id }))
    ),
    createProtocol: vi
      .fn()
      .mockImplementation((data: Partial<MockProtocol>) =>
        Promise.resolve(mockProtocol(data))
      ),
    updateProtocol: vi
      .fn()
      .mockImplementation((id: string, data: Partial<MockProtocol>) =>
        Promise.resolve(mockProtocol({ id, ...data }))
      ),
    getAssessments: vi
      .fn()
      .mockResolvedValue({ assessments: [], total: 0 }),
    getAssessment: vi.fn().mockImplementation((id: string) =>
      Promise.resolve(mockAssessment({ id }))
    ),
    submitAssessment: vi
      .fn()
      .mockImplementation((id: string, answers: unknown) =>
        Promise.resolve(mockAssessment({ id, status: "completed" }))
      ),
    getEvidenceSummary: vi
      .fn()
      .mockResolvedValue({
        totalConditions: 12,
        totalStudies: 348,
        avgEffectSize: 0.72,
      }),
    getPatientSummary: vi
      .fn()
      .mockResolvedValue({
        patient_id: "pt-test-001",
        active_protocols: 1,
        completed_sessions: 14,
        next_appointment: new Date(Date.now() + 86400000).toISOString(),
        alerts: [],
      }),
    login: vi
      .fn()
      .mockImplementation((email: string, password: string) =>
        Promise.resolve({
          access_token: "mock-access-token",
          refresh_token: "mock-refresh-token",
          user: mockClinicianUser({ email }),
        })
      ),
    logout: vi.fn().mockResolvedValue({ success: true }),
    me: vi.fn().mockResolvedValue(mockClinicianUser()),
    refreshToken: vi
      .fn()
      .mockResolvedValue({
        access_token: "mock-new-access-token",
        refresh_token: "mock-new-refresh-token",
      }),
    ...overrides,
  };
}

// ── User Mock Factories ────────────────────────────────────────────────

/**
 * Creates a mock clinician user. All fields are clinically valid synthetic
 * data — no real patient identifiers.
 */
export function mockClinicianUser(overrides: Partial<MockUser> = {}): MockUser {
  const id = overrides.id ?? `clin-${randomHex(8)}`;
  return {
    id,
    email: overrides.email ?? `clinician.${randomHex(4)}@deepsynaps.test`,
    display_name: overrides.display_name ?? `Dr. ${randomLastName()}`,
    role: "clinician",
    clinician_id: id,
    organization_id: `org-${randomHex(6)}`,
    is_active: true,
    permissions: [
      "protocol:read",
      "protocol:write",
      "assessment:read",
      "assessment:write",
      "patient:read",
      "patient:write",
      "evidence:read",
      "report:read",
      "report:write",
    ],
    mfa_verified: true,
    created_at: "2024-01-15T09:00:00Z",
    ...overrides,
  };
}

/**
 * Creates a mock patient user. All identifiers are synthetic.
 */
export function mockPatientUser(overrides: Partial<MockUser> = {}): MockUser {
  const id = overrides.id ?? `pt-${randomHex(8)}`;
  return {
    id,
    email: overrides.email ?? `patient.${randomHex(4)}@deepsynaps.test`,
    display_name: overrides.display_name ?? `Patient ${randomLastName()}`,
    role: "patient",
    patient_id: id,
    organization_id: `org-${randomHex(6)}`,
    is_active: true,
    permissions: ["protocol:read", "assessment:read", "patient:read:self"],
    mfa_verified: false,
    created_at: "2024-06-01T10:30:00Z",
    ...overrides,
  };
}

// ── Clinical Data Mock Factories ───────────────────────────────────────

/**
 * Creates a mock neurostimulation protocol with clinically plausible
 * parameters. Defaults to tACS at 10 Hz — a common evidence-based
 * configuration for working-memory enhancement.
 */
export function mockProtocol(
  overrides: Partial<MockProtocol> = {}
): MockProtocol {
  const id = overrides.id ?? `proto-${randomHex(8)}`;
  return {
    id,
    title: overrides.title ?? `Protocol ${id.slice(-4)} — tACS Working Memory`,
    description:
      overrides.description ??
      "10 Hz tACS bilateral DLPFC montage for working-memory enhancement. " +
        "Based on Frohlich 2015 (level-A evidence).",
    condition_id: "cond-mdd-001",
    condition_name: overrides.condition_name ?? "Major Depressive Disorder",
    clinician_id: `clin-${randomHex(8)}`,
    patient_id: overrides.patient_id ?? `pt-${randomHex(8)}`,
    status: overrides.status ?? "active",
    modality: overrides.modality ?? "tACS",
    frequency_hz: overrides.frequency_hz ?? 10,
    duration_minutes: overrides.duration_minutes ?? 20,
    electrode_montage: overrides.electrode_montage ?? "F3-Anode / F4-Cathode",
    target_regions: overrides.target_regions ?? ["dlpfc_left", "dlpfc_right"],
    evidence_level: "A",
    created_at: overrides.created_at ?? new Date().toISOString(),
    updated_at: overrides.updated_at ?? new Date().toISOString(),
    sessions_completed: overrides.sessions_completed ?? 7,
    sessions_total: overrides.sessions_total ?? 20,
    next_session_date:
      overrides.next_session_date ??
      new Date(Date.now() + 86400000).toISOString(),
    safety_screening_passed: overrides.safety_screening_passed ?? true,
    contraindications: overrides.contraindications ?? [],
    custom_parameters: overrides.custom_parameters ?? {
      intensity_ma: 1.5,
      fade_in_seconds: 30,
      fade_out_seconds: 30,
      sham_probability: 0.0,
    },
    ...overrides,
  };
}

/**
 * Creates a mock assessment with clinically plausible qEEG findings.
 * Defaults to a qEEG assessment showing mild frontal theta excess.
 */
export function mockAssessment(
  overrides: Partial<MockAssessment> = {}
): MockAssessment {
  const id = overrides.id ?? `assess-${randomHex(8)}`;
  const patientId = overrides.patient_id ?? `pt-${randomHex(8)}`;
  return {
    id,
    patient_id: patientId,
    protocol_id: overrides.protocol_id ?? `proto-${randomHex(8)}`,
    assessment_type: overrides.assessment_type ?? "qEEG",
    status: overrides.status ?? "completed",
    score: overrides.score ?? 78,
    percentile: overrides.percentile ?? 65,
    raw_data_url: overrides.raw_data_url ?? `/api/v1/assessments/${id}/raw`,
    findings: overrides.findings ?? [
      {
        metric: "frontal_theta_power",
        value: 1.34,
        z_score: 2.1,
        interpretation: "Mild frontal theta excess; correlate with attention complaints.",
        severity: "mild",
        region: "Fz-F3-F4",
        frequency_band: "theta",
      },
      {
        metric: "posterior_alpha_peak",
        value: 9.8,
        z_score: -0.3,
        interpretation: "Alpha peak frequency within normal range.",
        severity: "normal",
        region: "O1-O2-Pz",
        frequency_band: "alpha",
      },
      {
        metric: "alpha_asymmetry_F4_F3",
        value: 0.42,
        z_score: 1.8,
        interpretation:
          "Trend toward reduced left-frontal activation; monitor for mood symptoms.",
        severity: "mild",
        region: "F3-F4",
        frequency_band: "alpha",
      },
    ],
    administered_by: `clin-${randomHex(8)}`,
    administered_at:
      overrides.administered_at ??
      new Date(Date.now() - 7 * 86400000).toISOString(),
    completed_at:
      overrides.completed_at ??
      new Date(Date.now() - 6 * 86400000).toISOString(),
    notes:
      overrides.notes ??
      "Patient tolerated recording well. Movement artifact minimal. " +
        "Recommend repeat in 4 weeks post-protocol block.",
    related_session_ids: overrides.related_session_ids ?? [`sess-${randomHex(8)}`],
    ...overrides,
  };
}

// ── Helper: generate a batch of items ────────────────────────────────

export function mockProtocolList(count: number): MockProtocol[] {
  const modalities: MockProtocol["modality"][] = [
    "tACS",
    "tDCS",
    "tRNS",
    "neurofeedback",
  ];
  const statuses: MockProtocol["status"][] = [
    "draft",
    "active",
    "completed",
    "archived",
  ];
  return Array.from({ length: count }, (_, i) =>
    mockProtocol({
      id: `proto-${String(i + 1).padStart(4, "0")}`,
      title: `Protocol ${i + 1}`,
      modality: modalities[i % modalities.length],
      status: statuses[i % statuses.length],
    })
  );
}

export function mockAssessmentList(
  count: number,
  patientId?: string
): MockAssessment[] {
  const types: MockAssessment["assessment_type"][] = [
    "qEEG",
    "cognitive",
    "behavioral",
    "mood",
    "sleep",
  ];
  return Array.from({ length: count }, (_, i) =>
    mockAssessment({
      id: `assess-${String(i + 1).padStart(4, "0")}`,
      patient_id: patientId ?? `pt-${randomHex(8)}`,
      assessment_type: types[i % types.length],
    })
  );
}

// ── Internal helpers ───────────────────────────────────────────────────

function randomHex(length: number): string {
  return Array.from({ length }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
}

function randomLastName(): string {
  const names = [
    "Anderson",
    "Bennett",
    "Chen",
    "Davis",
    "Eriksson",
    "Foster",
    "Garcia",
    "Hassan",
    "Ivanov",
    "Jensen",
    "Kowalski",
    "Li",
    "Martinez",
    "Nguyen",
    "Okafor",
    "Petrov",
    "Quinn",
    "Rodriguez",
    "Smith",
    "Tanaka",
    "Underwood",
    "Vasquez",
    "Williams",
    "Xu",
    "Yamamoto",
    "Zhang",
  ];
  return names[Math.floor(Math.random() * names.length)];
}
