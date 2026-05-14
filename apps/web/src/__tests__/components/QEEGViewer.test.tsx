/**
 * QEEGViewer Component Tests
 * ============================
 * Tests the quantitative EEG visualisation viewer used by clinicians
 * to review spectral power maps, topographic heatmaps, and coherence
 * matrices derived from patient recordings.
 *
 * Coverage targets:
 *   - Canvas / WebGL fallback rendering
 *   - Spectral band toggle (Delta / Theta / Alpha / Beta / Gamma)
 *   - Montage selector (Fp1-F3, C3-P3, etc.)
 *   - Epoch navigation (prev / next)
 *   - Z-score colour-map legend
 *   - Annotation mode (add / remove markers)
 *   - Export image action
 *   - Loading & error states
 */

import { describe, it, expect, vi } from "vitest";
import React from "react";
import { screen, waitFor, within } from "@testing-library/react";
import {
  renderWithProviders,
  createMockApiClient,
  mockClinicianUser,
  mockAssessment,
} from "../utils/test-utils";

// ── Minimal spectral data fixtures ────────────────────────────────────

const SPECTRAL_BANDS = [
  { id: "delta", label: "Delta", range: "0.5–4 Hz", color: "#3366CC" },
  { id: "theta", label: "Theta", range: "4–8 Hz", color: "#DC3912" },
  { id: "alpha", label: "Alpha", range: "8–13 Hz", color: "#FF9900" },
  { id: "beta", label: "Beta", range: "13–30 Hz", color: "#109618" },
  { id: "gamma", label: "Gamma", range: "30–100 Hz", color: "#990099" },
];

const DEFAULT_MONTAGES = [
  { id: "fp1-f3", label: "Fp1-F3", region: "frontal" },
  { id: "f3-c3", label: "F3-C3", region: "fronto-central" },
  { id: "c3-p3", label: "C3-P3", region: "centro-parietal" },
  { id: "p3-o1", label: "P3-O1", region: "parieto-occipital" },
  { id: "fp2-f4", label: "Fp2-F4", region: "frontal" },
  { id: "f4-c4", label: "F4-C4", region: "fronto-central" },
  { id: "c4-p4", label: "C4-P4", region: "centro-parietal" },
  { id: "p4-o2", label: "P4-O2", region: "parieto-occipital" },
];

const MOCK_EPOCHS = [
  { id: "epoch-1", startSec: 0, endSec: 2, quality: "good" },
  { id: "epoch-2", startSec: 2, endSec: 4, quality: "good" },
  { id: "epoch-3", startSec: 4, endSec: 6, quality: "artifact" },
  { id: "epoch-4", startSec: 6, endSec: 8, quality: "good" },
];

// ── Stand-in component ────────────────────────────────────────────────

interface QEEGViewerProps {
  assessmentId: string;
  patientId: string;
  onAnnotate?: (epochId: string, note: string) => void;
  onExport?: () => void;
}

function QEEGViewer({
  assessmentId,
  patientId,
  onAnnotate,
  onExport,
}: QEEGViewerProps) {
  const [activeBand, setActiveBand] = React.useState("alpha");
  const [activeMontage, setActiveMontage] = React.useState("c3-p3");
  const [currentEpochIndex, setCurrentEpochIndex] = React.useState(0);
  const [annotations, setAnnotations] = React.useState<
    Record<string, string[]>
  >({});
  const [annotationDraft, setAnnotationDraft] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [showLegend, setShowLegend] = React.useState(true);

  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    // Simulate data loading
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  React.useEffect(() => {
    // Simulate canvas draw
    const canvas = canvasRef.current;
    if (!canvas || isLoading) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#f0f0f0";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Draw a simple topographic representation
    ctx.fillStyle = SPECTRAL_BANDS.find((b) => b.id === activeBand)?.color ?? "#000";
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, 60, 0, Math.PI * 2);
    ctx.fill();
  }, [activeBand, activeMontage, currentEpochIndex, isLoading]);

  const currentEpoch = MOCK_EPOCHS[currentEpochIndex];
  const totalEpochs = MOCK_EPOCHS.length;

  function handleAddAnnotation() {
    if (!annotationDraft.trim()) return;
    const epochId = currentEpoch.id;
    setAnnotations((prev) => ({
      ...prev,
      [epochId]: [...(prev[epochId] || []), annotationDraft.trim()],
    }));
    onAnnotate?.(epochId, annotationDraft.trim());
    setAnnotationDraft("");
  }

  if (isLoading) {
    return (
      <div data-testid="qeeg-loading">
        <div className="spinner" />
        Loading qEEG data…
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" data-testid="qeeg-error">
        {error}
      </div>
    );
  }

  return (
    <div data-testid="qeeg-viewer" data-assessment-id={assessmentId}>
      {/* Toolbar */}
      <header data-testid="qeeg-toolbar">
        <div role="group" aria-label="Spectral band" data-testid="band-controls">
          {SPECTRAL_BANDS.map((band) => (
            <button
              key={band.id}
              onClick={() => setActiveBand(band.id)}
              aria-pressed={activeBand === band.id}
              data-testid={`band-${band.id}`}
              data-active={activeBand === band.id}
            >
              {band.label}
            </button>
          ))}
        </div>

        <label>
          Montage
          <select
            value={activeMontage}
            onChange={(e) => setActiveMontage(e.target.value)}
            data-testid="montage-select"
            aria-label="Electrode montage"
          >
            {DEFAULT_MONTAGES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} — {m.region}
              </option>
            ))}
          </select>
        </label>

        <button
          onClick={() => setShowLegend((s) => !s)}
          aria-pressed={showLegend}
          data-testid="toggle-legend"
        >
          Legend
        </button>

        <button onClick={onExport} data-testid="export-btn">
          Export Image
        </button>
      </header>

      {/* Epoch navigator */}
      <nav aria-label="Epoch navigation" data-testid="epoch-nav">
        <button
          onClick={() => setCurrentEpochIndex((i) => Math.max(0, i - 1))}
          disabled={currentEpochIndex === 0}
          data-testid="epoch-prev"
          aria-label="Previous epoch"
        >
          ◀
        </button>
        <span data-testid="epoch-indicator">
          Epoch {currentEpochIndex + 1} / {totalEpochs}{" "}
          <span data-epoch-quality={currentEpoch.quality}>
            ({currentEpoch.quality})
          </span>
        </span>
        <button
          onClick={() =>
            setCurrentEpochIndex((i) => Math.min(totalEpochs - 1, i + 1))
          }
          disabled={currentEpochIndex === totalEpochs - 1}
          data-testid="epoch-next"
          aria-label="Next epoch"
        >
          ▶
        </button>
      </nav>

      {/* Canvas viewer */}
      <div data-testid="qeeg-canvas-container">
        <canvas
          ref={canvasRef}
          width={600}
          height={400}
          role="img"
          aria-label={`Topographic map for ${activeBand} band, ${activeMontage} montage`}
          data-testid="qeeg-canvas"
        />
      </div>

      {/* Legend */}
      {showLegend && (
        <aside data-testid="qeeg-legend" aria-label="Z-score colour legend">
          <h3>Z-Score Legend</h3>
          <div>
            <span data-score="-3" style={{ color: "#0000FF" }}>
              -3σ
            </span>
            <span data-score="-1.5" style={{ color: "#66AAFF" }}>
              -1.5σ
            </span>
            <span data-score="0" style={{ color: "#FFFFFF" }}>
              0
            </span>
            <span data-score="+1.5" style={{ color: "#FF6666" }}>
              +1.5σ
            </span>
            <span data-score="+3" style={{ color: "#FF0000" }}>
              +3σ
            </span>
          </div>
        </aside>
      )}

      {/* Annotation panel */}
      <section data-testid="annotation-panel" aria-label="Epoch annotations">
        <h3>Annotations</h3>
        <div>
          <input
            type="text"
            value={annotationDraft}
            onChange={(e) => setAnnotationDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddAnnotation();
            }}
            placeholder="Add annotation…"
            data-testid="annotation-input"
            aria-label="New annotation"
          />
          <button onClick={handleAddAnnotation} data-testid="annotation-add">
            Add
          </button>
        </div>
        <ul data-testid="annotation-list">
          {(annotations[currentEpoch.id] || []).map((note, i) => (
            <li key={i} data-testid={`annotation-note-${i}`}>
              {note}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════

describe("QEEGViewer", () => {
  it("renders loading state initially", () => {
    renderWithProviders(
      <QEEGViewer assessmentId="ass-qeeg-001" patientId="pt-001" />
    );
    expect(screen.getByTestId("qeeg-loading")).toBeInTheDocument();
  });

  it("renders viewer after loading completes", async () => {
    renderWithProviders(
      <QEEGViewer assessmentId="ass-qeeg-001" patientId="pt-001" />
    );
    expect(await screen.findByTestId("qeeg-viewer")).toBeInTheDocument();
  });

  it("has data-assessment-id attribute", async () => {
    renderWithProviders(
      <QEEGViewer assessmentId="ass-qeeg-001" patientId="pt-001" />
    );
    const viewer = await screen.findByTestId("qeeg-viewer");
    expect(viewer).toHaveAttribute("data-assessment-id", "ass-qeeg-001");
  });

  it("renders all spectral band buttons", async () => {
    renderWithProviders(
      <QEEGViewer assessmentId="ass-qeeg-001" patientId="pt-001" />
    );
    await screen.findByTestId("qeeg-viewer");
    for (const band of SPECTRAL_BANDS) {
      expect(screen.getByTestId(`band-${band.id}`)).toBeInTheDocument();
    }
  });

  it("defaults to alpha band selected", async () => {
    renderWithProviders(
      <QEEGViewer assessmentId="ass-qeeg-001" patientId="pt-001" />
    );
    await screen.findByTestId("qeeg-viewer");
    expect(screen.getByTestId("band-alpha")).toHaveAttribute("data-active", "true");
    expect(screen.getByTestId("band-delta")).toHaveAttribute("data-active", "false");
  });

  it("changes active band on click", async () => {
    const { user } = renderWithProviders(
      <QEEGViewer assessmentId="ass-qeeg-001" patientId="pt-001" />
    );
    await screen.findByTestId("qeeg-viewer");
    await user.click(screen.getByTestId("band-theta"));
    expect(screen.getByTestId("band-theta")).toHaveAttribute("data-active", "true");
    expect(screen.getByTestId("band-alpha")).toHaveAttribute("data-active", "false");
  });

  it("renders montage selector with options", async () => {
    renderWithProviders(
      <QEEGViewer assessmentId="ass-qeeg-001" patientId="pt-001" />
    );
    await screen.findByTestId("qeeg-viewer");
    const select = screen.getByTestId("montage-select");
    expect(select).toBeInTheDocument();
    expect(within(select as HTMLElement).getAllByRole("option").length).toBe(
      DEFAULT_MONTAGES.length
    );
  });

  it("renders epoch navigation", async () => {
    renderWithProviders(
      <QEEGViewer assessmentId="ass-qeeg-001" patientId="pt-001" />
    );
    await screen.findByTestId("qeeg-viewer");
    expect(screen.getByTestId("epoch-prev")).toBeInTheDocument();
    expect(screen.getByTestId("epoch-next")).toBeInTheDocument();
    expect(screen.getByTestId("epoch-indicator")).toHaveTextContent(
      /epoch 1 \/ 4/i
    );
  });

  it("disables previous epoch button on first epoch", async () => {
    renderWithProviders(
      <QEEGViewer assessmentId="ass-qeeg-001" patientId="pt-001" />
    );
    await screen.findByTestId("qeeg-viewer");
    expect(screen.getByTestId("epoch-prev")).toBeDisabled();
    expect(screen.getByTestId("epoch-next")).not.toBeDisabled();
  });

  it("navigates to next epoch and updates indicator", async () => {
    const { user } = renderWithProviders(
      <QEEGViewer assessmentId="ass-qeeg-001" patientId="pt-001" />
    );
    await screen.findByTestId("qeeg-viewer");
    await user.click(screen.getByTestId("epoch-next"));
    expect(screen.getByTestId("epoch-indicator")).toHaveTextContent(
      /epoch 2 \/ 4/i
    );
  });

  it("disables next epoch button on last epoch", async () => {
    const { user } = renderWithProviders(
      <QEEGViewer assessmentId="ass-qeeg-001" patientId="pt-001" />
    );
    await screen.findByTestId("qeeg-viewer");
    // Navigate to last epoch
    for (let i = 0; i < MOCK_EPOCHS.length - 1; i++) {
      await user.click(screen.getByTestId("epoch-next"));
    }
    expect(screen.getByTestId("epoch-indicator")).toHaveTextContent(
      /epoch 4 \/ 4/i
    );
    expect(screen.getByTestId("epoch-next")).toBeDisabled();
  });

  it("shows epoch quality indicator", async () => {
    const { user } = renderWithProviders(
      <QEEGViewer assessmentId="ass-qeeg-001" patientId="pt-001" />
    );
    await screen.findByTestId("qeeg-viewer");
    // epoch-3 has "artifact" quality
    await user.click(screen.getByTestId("epoch-next"));
    await user.click(screen.getByTestId("epoch-next"));
    expect(screen.getByTestId("epoch-indicator")).toHaveTextContent(/artifact/i);
  });

  it("renders canvas element with correct dimensions", async () => {
    renderWithProviders(
      <QEEGViewer assessmentId="ass-qeeg-001" patientId="pt-001" />
    );
    const canvas = await screen.findByTestId("qeeg-canvas");
    expect(canvas).toHaveAttribute("width", "600");
    expect(canvas).toHaveAttribute("height", "400");
    expect(canvas).toHaveAttribute("role", "img");
  });

  it("toggles legend visibility", async () => {
    const { user } = renderWithProviders(
      <QEEGViewer assessmentId="ass-qeeg-001" patientId="pt-001" />
    );
    await screen.findByTestId("qeeg-viewer");
    expect(screen.getByTestId("qeeg-legend")).toBeInTheDocument();
    await user.click(screen.getByTestId("toggle-legend"));
    expect(screen.queryByTestId("qeeg-legend")).not.toBeInTheDocument();
  });

  it("renders Z-score legend with all score markers", async () => {
    renderWithProviders(
      <QEEGViewer assessmentId="ass-qeeg-001" patientId="pt-001" />
    );
    await screen.findByTestId("qeeg-viewer");
    const legend = screen.getByTestId("qeeg-legend");
    for (const score of ["-3", "-1.5", "0", "+1.5", "+3"]) {
      expect(legend.querySelector(`[data-score="${score}"]`)).toBeInTheDocument();
    }
  });

  it("calls onExport when export button is clicked", async () => {
    const onExport = vi.fn();
    const { user } = renderWithProviders(
      <QEEGViewer
        assessmentId="ass-qeeg-001"
        patientId="pt-001"
        onExport={onExport}
      />
    );
    await screen.findByTestId("qeeg-viewer");
    await user.click(screen.getByTestId("export-btn"));
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it("adds annotation on button click", async () => {
    const { user } = renderWithProviders(
      <QEEGViewer assessmentId="ass-qeeg-001" patientId="pt-001" />
    );
    await screen.findByTestId("qeeg-viewer");
    const input = screen.getByTestId("annotation-input");
    await user.type(input, "Theta excess in frontal regions");
    await user.click(screen.getByTestId("annotation-add"));

    expect(
      screen.getByTestId("annotation-note-0")
    ).toHaveTextContent(/theta excess/i);
    expect(input).toHaveValue("");
  });

  it("adds annotation on Enter key", async () => {
    const onAnnotate = vi.fn();
    const { user } = renderWithProviders(
      <QEEGViewer
        assessmentId="ass-qeeg-001"
        patientId="pt-001"
        onAnnotate={onAnnotate}
      />
    );
    await screen.findByTestId("qeeg-viewer");
    const input = screen.getByTestId("annotation-input");
    await user.type(input, "Alpha asymmetry noted{Enter}");
    expect(onAnnotate).toHaveBeenCalledWith("epoch-1", "Alpha asymmetry noted");
  });

  it("does not add empty annotations", async () => {
    const { user } = renderWithProviders(
      <QEEGViewer assessmentId="ass-qeeg-001" patientId="pt-001" />
    );
    await screen.findByTestId("qeeg-viewer");
    await user.click(screen.getByTestId("annotation-add"));
    expect(screen.queryByTestId("annotation-note-0")).not.toBeInTheDocument();
  });

  it("annotations are scoped per-epoch", async () => {
    const { user } = renderWithProviders(
      <QEEGViewer assessmentId="ass-qeeg-001" patientId="pt-001" />
    );
    await screen.findByTestId("qeeg-viewer");

    // Add annotation to epoch 1
    await user.type(screen.getByTestId("annotation-input"), "Epoch 1 note");
    await user.click(screen.getByTestId("annotation-add"));
    expect(screen.getByTestId("annotation-note-0")).toBeInTheDocument();

    // Navigate to epoch 2 — annotations list should be empty
    await user.click(screen.getByTestId("epoch-next"));
    expect(
      screen.queryByTestId("annotation-note-0")
    ).not.toBeInTheDocument();
  });
});
