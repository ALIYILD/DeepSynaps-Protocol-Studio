/**
 * Tests for EvidenceLinksCard component.
 *
 * Tests: render with evidence, degraded state, research-only badge,
 * conflicting badge, show-more toggle, safety disclaimer, deep link.
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import EvidenceLinksCard from "./components/EvidenceLinksCard";

// ── Test data ─────────────────────────────────────────────────────────────────

const mockEvidence = [
  {
    id: "ev_qeeg_001",
    title: "Jeste et al. 2015: qEEG delta power as predictor of cognitive decline",
    source: "literature",
    evidence_grade: "B",
    study_type: "observational",
    year: 2015,
    doi: "10.1002/hbm.22847",
    pmid: "25887717",
    url: "https://pubmed.ncbi.nlm.nih.gov/25887717/",
    condition: "cognitive_decline",
    modality: "qeeg",
    relevance_score: 0.72,
    research_only: false,
    conflicting: false,
    caveat: null,
  },
  {
    id: "ev_qeeg_002",
    title: "Theta power in ADHD: a systematic review",
    source: "literature",
    evidence_grade: "C",
    study_type: "systematic_review",
    year: 2020,
    doi: null,
    pmid: "32012345",
    url: null,
    condition: "adhd",
    modality: "qeeg",
    relevance_score: 0.55,
    research_only: true,
    conflicting: false,
    caveat: "Limited evidence — expert opinion or small studies",
  },
  {
    id: "ev_qeeg_003",
    title: "Conflicting study on alpha asymmetry",
    source: "literature",
    evidence_grade: "D",
    study_type: "expert_opinion",
    year: 2018,
    doi: null,
    pmid: null,
    url: null,
    condition: "depression",
    modality: "qeeg",
    relevance_score: 0.3,
    research_only: true,
    conflicting: true,
    caveat: "Preliminary findings — requires replication",
  },
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("EvidenceLinksCard", () => {
  test("renders evidence card with title", () => {
    render(<EvidenceLinksCard evidenceLinks={mockEvidence} analyzerType="qeeg" />);
    expect(screen.getByTestId("evidence-links-card")).toBeInTheDocument();
    expect(screen.getByTestId("evidence-card-title")).toHaveTextContent("Evidence (3)");
  });

  test("renders correct number of evidence items", () => {
    render(<EvidenceLinksCard evidenceLinks={mockEvidence} analyzerType="qeeg" />);
    const items = screen.getAllByTestId("evidence-item");
    expect(items).toHaveLength(3);
  });

  test("shows evidence titles", () => {
    render(<EvidenceLinksCard evidenceLinks={mockEvidence} analyzerType="qeeg" />);
    expect(screen.getByText(/Jeste et al. 2015/)).toBeInTheDocument();
    expect(screen.getByText(/Theta power in ADHD/)).toBeInTheDocument();
  });

  test("shows grade badges", () => {
    render(<EvidenceLinksCard evidenceLinks={mockEvidence} analyzerType="qeeg" />);
    expect(screen.getByTestId("grade-badge-B")).toBeInTheDocument();
    expect(screen.getByTestId("grade-badge-C")).toBeInTheDocument();
    expect(screen.getByTestId("grade-badge-D")).toBeInTheDocument();
  });

  test("shows research-only badge for C/D grade evidence", () => {
    render(<EvidenceLinksCard evidenceLinks={mockEvidence} analyzerType="qeeg" />);
    expect(screen.getByTestId("research-only-badge")).toBeInTheDocument();
  });

  test("shows conflicting badge for conflicting evidence", () => {
    render(<EvidenceLinksCard evidenceLinks={mockEvidence} analyzerType="qeeg" />);
    expect(screen.getByTestId("conflicting-badge")).toBeInTheDocument();
  });

  test("shows PubMed link when pmid present", () => {
    render(<EvidenceLinksCard evidenceLinks={mockEvidence} analyzerType="qeeg" />);
    expect(screen.getByTestId("evidence-pubmed-link")).toBeInTheDocument();
    expect(screen.getByTestId("evidence-pubmed-link")).toHaveTextContent("PubMed 25887717");
  });

  test("shows DOI link when doi present", () => {
    render(<EvidenceLinksCard evidenceLinks={mockEvidence} analyzerType="qeeg" />);
    expect(screen.getByTestId("evidence-doi-link")).toBeInTheDocument();
  });

  test("shows meta information (study type, year, relevance)", () => {
    render(<EvidenceLinksCard evidenceLinks={mockEvidence} analyzerType="qeeg" />);
    expect(screen.getAllByTestId("evidence-meta").length).toBeGreaterThan(0);
  });

  test("shows caveat when present", () => {
    render(<EvidenceLinksCard evidenceLinks={mockEvidence} analyzerType="qeeg" />);
    expect(screen.getByTestId("evidence-caveat")).toBeInTheDocument();
    expect(screen.getByTestId("evidence-caveat")).toHaveTextContent("Limited evidence");
  });

  test("shows deep link to Evidence Research", () => {
    render(<EvidenceLinksCard evidenceLinks={mockEvidence} analyzerType="qeeg" />);
    expect(screen.getByTestId("evidence-deep-link")).toBeInTheDocument();
    expect(screen.getByTestId("evidence-deep-link")).toHaveAttribute("href", "/pages-research-evidence?q=qeeg");
  });

  test("shows safety disclaimer", () => {
    render(<EvidenceLinksCard evidenceLinks={mockEvidence} analyzerType="qeeg" />);
    expect(screen.getByTestId("evidence-safety-disclaimer")).toBeInTheDocument();
    expect(screen.getByTestId("evidence-safety-disclaimer")).toHaveTextContent(
      /Evidence links support clinician review/
    );
  });

  test("safety disclaimer does not claim diagnostic authority", () => {
    render(<EvidenceLinksCard evidenceLinks={mockEvidence} analyzerType="qeeg" />);
    const disclaimer = screen.getByTestId("evidence-safety-disclaimer");
    expect(disclaimer).toHaveTextContent(/do not establish diagnosis/);
    expect(disclaimer).not.toHaveTextContent(/proves/);
    expect(disclaimer).not.toHaveTextContent(/diagnoses/);
    expect(disclaimer).not.toHaveTextContent(/confirms/);
  });
});

describe("EvidenceLinksCard — Degraded State", () => {
  test("shows degraded state when no evidence links", () => {
    render(<EvidenceLinksCard evidenceLinks={[]} analyzerType="qeeg" />);
    expect(screen.getByTestId("evidence-degraded-state")).toBeInTheDocument();
    expect(screen.getByText("Evidence Unavailable")).toBeInTheDocument();
  });

  test("shows degraded state description", () => {
    render(<EvidenceLinksCard evidenceLinks={[]} analyzerType="qeeg" />);
    expect(screen.getByText(/No evidence links found/)).toBeInTheDocument();
  });
});

describe("EvidenceLinksCard — Show More / Less", () => {
  const manyLinks = Array.from({ length: 8 }, (_, i) => ({
    id: `ev_${i}`,
    title: `Study ${i + 1}`,
    source: "literature",
    evidence_grade: "B",
    study_type: "RCT",
    year: 2020 + i,
    research_only: false,
    conflicting: false,
  }));

  test("shows only maxVisible items by default", () => {
    render(<EvidenceLinksCard evidenceLinks={manyLinks} analyzerType="qeeg" maxVisible={5} />);
    expect(screen.getAllByTestId("evidence-item")).toHaveLength(5);
  });

  test("shows show-more button when evidence exceeds maxVisible", () => {
    render(<EvidenceLinksCard evidenceLinks={manyLinks} analyzerType="qeeg" maxVisible={5} />);
    expect(screen.getByTestId("evidence-show-more")).toBeInTheDocument();
    expect(screen.getByTestId("evidence-show-more")).toHaveTextContent("Show 3 more");
  });

  test("expands to show all on click", () => {
    render(<EvidenceLinksCard evidenceLinks={manyLinks} analyzerType="qeeg" maxVisible={5} />);
    fireEvent.click(screen.getByTestId("evidence-show-more"));
    expect(screen.getAllByTestId("evidence-item")).toHaveLength(8);
  });
});

describe("EvidenceLinksCard — Deep Link", () => {
  test("deep link includes analyzer type in URL", () => {
    render(<EvidenceLinksCard evidenceLinks={mockEvidence} analyzerType="mri" />);
    expect(screen.getByTestId("evidence-deep-link")).toHaveAttribute(
      "href",
      "/pages-research-evidence?q=mri"
    );
  });

  test("no deep link when showDeepLink is false", () => {
    render(<EvidenceLinksCard evidenceLinks={mockEvidence} analyzerType="qeeg" showDeepLink={false} />);
    expect(screen.queryByTestId("evidence-deep-link")).not.toBeInTheDocument();
  });
});
