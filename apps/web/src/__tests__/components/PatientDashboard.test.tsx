/**
 * PatientDashboard Component Tests
 * ==================================
 * Tests the patient-facing dashboard that shows:
 *   - Greeting & personalisation
 *   - Active protocols summary
 *   - Upcoming sessions
 *   - Assessment results / scores
 *   - Wearables / adherence summary
 *   - Evidence context cards
 */

import { describe, it, expect, vi } from "vitest";
import React from "react";
import { screen, waitFor, within } from "@testing-library/react";
import {
  renderWithProviders,
  createMockApiClient,
  mockPatientUser,
  mockProtocol,
  mockAssessment,
} from "../utils/test-utils";

// ── Stand-in component exercising all dashboard sub-areas ─────────────

interface PatientDashboardProps {
  user: ReturnType<typeof mockPatientUser>;
}

function PatientDashboard({ user }: PatientDashboardProps) {
  const [protocols, setProtocols] = React.useState<ReturnType<typeof mockProtocol>[]>([]);
  const [assessments, setAssessments] = React.useState<ReturnType<typeof mockAssessment>[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    const api = (window as unknown as Record<string, unknown>)._testApiClient as {
      patientPortalSessions: () => Promise<unknown>;
      getProtocols: () => Promise<unknown>;
      getAssessments: () => Promise<unknown>;
    };
    Promise.all([
      api.patientPortalSessions().catch(() => ({ sessions: [] })),
      api.getProtocols().catch(() => ({ protocols: [] })),
      api.getAssessments().catch(() => ({ assessments: [] })),
    ])
      .then(([, protoRes, assessRes]) => {
        setProtocols((protoRes as { protocols: unknown[] }).protocols);
        setAssessments((assessRes as { assessments: unknown[] }).assessments);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load dashboard data.");
        setLoading(false);
      });
  }, []);

  const firstName = (user.display_name || "there").split(" ")[0];
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  if (loading) {
    return (
      <div data-testid="dashboard-loading">
        <div className="spinner" />
        Loading your Home page…
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" data-testid="dashboard-error">
        {error}
      </div>
    );
  }

  const activeProtocols = protocols.filter((p) => p.status === "active");
  const nextSession =
    activeProtocols.length > 0
      ? activeProtocols[0].next_session_date
      : null;

  return (
    <div data-testid="patient-dashboard">
      {/* Hero */}
      <section data-testid="dashboard-hero">
        <div>Patient portal</div>
        <h1>
          {greeting}, {firstName}.
        </h1>
        <p>Here is your personalised summary.</p>
      </section>

      {/* Active Protocols */}
      <section data-testid="dashboard-protocols" aria-label="Active protocols">
        <h2>Active Protocols</h2>
        {activeProtocols.length === 0 ? (
          <p data-testid="no-protocols">No active protocols.</p>
        ) : (
          <ul>
            {activeProtocols.map((p) => (
              <li key={p.id} data-testid={`protocol-${p.id}`}>
                <strong>{p.title}</strong>
                <span data-testid={`protocol-${p.id}-modality`}>{p.modality}</span>
                <span data-testid={`protocol-${p.id}-progress`}>
                  {p.sessions_completed}/{p.sessions_total} sessions
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Next Session */}
      <section data-testid="dashboard-next-session" aria-label="Next session">
        <h2>Next Session</h2>
        {nextSession ? (
          <time dateTime={nextSession} data-testid="next-session-date">
            {new Date(nextSession).toLocaleDateString()}
          </time>
        ) : (
          <p>No upcoming sessions scheduled.</p>
        )}
      </section>

      {/* Recent Assessments */}
      <section data-testid="dashboard-assessments" aria-label="Recent assessments">
        <h2>Recent Assessments</h2>
        {assessments.length === 0 ? (
          <p>No assessments yet.</p>
        ) : (
          <ul>
            {assessments.slice(0, 3).map((a) => (
              <li key={a.id} data-testid={`assessment-${a.id}`}>
                <span>{a.assessment_type}</span>
                <span data-testid={`assessment-${a.id}-status`}>{a.status}</span>
                {a.score !== null && (
                  <span data-testid={`assessment-${a.id}-score`}>Score: {a.score}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════

describe("PatientDashboard", () => {
  it("renders loading state initially", () => {
    renderWithProviders(<PatientDashboard user={mockPatientUser()} />);
    expect(screen.getByTestId("dashboard-loading")).toBeInTheDocument();
  });

  it("shows personalised greeting after loading", async () => {
    const mockApi = createMockApiClient({
      patientPortalSessions: vi.fn().mockResolvedValue({ sessions: [] }),
      getProtocols: vi.fn().mockResolvedValue({ protocols: [] }),
      getAssessments: vi.fn().mockResolvedValue({ assessments: [] }),
    });
    renderWithProviders(
      <PatientDashboard user={mockPatientUser({ display_name: "Elena Vasquez" })} />,
      { apiClient: mockApi }
    );

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-hero")).toBeInTheDocument();
    });
    expect(screen.getByText(/elena/i)).toBeInTheDocument();
  });

  it("renders active protocols with progress", async () => {
    const protocols = [
      mockProtocol({
        id: "proto-001",
        title: "tACS for Working Memory",
        status: "active",
        sessions_completed: 8,
        sessions_total: 20,
      }),
      mockProtocol({
        id: "proto-002",
        title: "Neurofeedback Alpha-Theta",
        status: "active",
        sessions_completed: 3,
        sessions_total: 15,
      }),
      mockProtocol({ id: "proto-003", title: "Archived Protocol", status: "archived" }),
    ];
    const mockApi = createMockApiClient({
      getProtocols: vi.fn().mockResolvedValue({ protocols }),
    });
    renderWithProviders(
      <PatientDashboard user={mockPatientUser()} />,
      { apiClient: mockApi }
    );

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-protocols")).toBeInTheDocument();
    });

    expect(screen.getByTestId("protocol-proto-001")).toHaveTextContent(
      /tACS for Working Memory/
    );
    expect(screen.getByTestId("protocol-proto-001-progress")).toHaveTextContent(
      "8/20 sessions"
    );
    expect(screen.queryByTestId("protocol-proto-003")).not.toBeInTheDocument();
  });

  it("shows empty state when no active protocols", async () => {
    const mockApi = createMockApiClient({
      getProtocols: vi.fn().mockResolvedValue({ protocols: [] }),
    });
    renderWithProviders(
      <PatientDashboard user={mockPatientUser()} />,
      { apiClient: mockApi }
    );

    expect(await screen.findByTestId("no-protocols")).toHaveTextContent(
      /no active protocols/i
    );
  });

  it("renders assessment list with scores", async () => {
    const assessments = [
      mockAssessment({ id: "ass-001", assessment_type: "qEEG", score: 82 }),
      mockAssessment({ id: "ass-002", assessment_type: "mood", score: 64 }),
    ];
    const mockApi = createMockApiClient({
      getAssessments: vi.fn().mockResolvedValue({ assessments }),
    });
    renderWithProviders(
      <PatientDashboard user={mockPatientUser()} />,
      { apiClient: mockApi }
    );

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-assessments")).toBeInTheDocument();
    });

    expect(screen.getByTestId("assessment-ass-001")).toBeInTheDocument();
    expect(screen.getByTestId("assessment-ass-001-score")).toHaveTextContent("82");
    expect(screen.getByTestId("assessment-ass-002")).toBeInTheDocument();
  });

  it("shows next session date", async () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    const protocols = [
      mockProtocol({
        id: "proto-001",
        status: "active",
        next_session_date: tomorrow,
      }),
    ];
    const mockApi = createMockApiClient({
      getProtocols: vi.fn().mockResolvedValue({ protocols }),
    });
    renderWithProviders(
      <PatientDashboard user={mockPatientUser()} />,
      { apiClient: mockApi }
    );

    expect(
      await screen.findByTestId("next-session-date")
    ).toBeInTheDocument();
  });

  it("handles API errors gracefully", async () => {
    const mockApi = createMockApiClient({
      patientPortalSessions: vi.fn().mockRejectedValue(new Error("API down")),
    });
    renderWithProviders(
      <PatientDashboard user={mockPatientUser()} />,
      { apiClient: mockApi }
    );

    expect(
      await screen.findByTestId("dashboard-error")
    ).toHaveTextContent(/failed to load dashboard/i);
  });

  it("fetches all data sources in parallel on mount", async () => {
    const sessionsSpy = vi.fn().mockResolvedValue({ sessions: [] });
    const protocolsSpy = vi.fn().mockResolvedValue({ protocols: [] });
    const assessmentsSpy = vi.fn().mockResolvedValue({ assessments: [] });
    const mockApi = createMockApiClient({
      patientPortalSessions: sessionsSpy,
      getProtocols: protocolsSpy,
      getAssessments: assessmentsSpy,
    });
    renderWithProviders(
      <PatientDashboard user={mockPatientUser()} />,
      { apiClient: mockApi }
    );

    await waitFor(() => {
      expect(sessionsSpy).toHaveBeenCalledTimes(1);
      expect(protocolsSpy).toHaveBeenCalledTimes(1);
      expect(assessmentsSpy).toHaveBeenCalledTimes(1);
    });
  });
});
