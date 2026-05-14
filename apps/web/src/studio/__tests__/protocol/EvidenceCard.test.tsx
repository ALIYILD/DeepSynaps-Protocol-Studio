/**
 * EvidenceCard Tests — DeepSynaps Protocol Studio
 * ================================================
 * Tests evidence card rendering, grade display, expand/collapse behavior.
 */

import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EvidenceCard } from "../../protocol/EvidenceCard";
import {
  createMockEvidenceLink,
  createMockEvidenceLink as mockEvidence,
} from "../utils/protocolMockData";

describe("EvidenceCard", () => {
  it("renders the evidence card with all basic elements", () => {
    const evidence = createMockEvidenceLink();
    render(<EvidenceCard evidence={evidence} />);

    expect(screen.getByTestId(`evidence-card-${evidence.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`evidence-title-${evidence.id}`)).toHaveTextContent(evidence.title);
    expect(screen.getByTestId(`evidence-authors-${evidence.id}`)).toHaveTextContent(evidence.authors);
    expect(screen.getByTestId(`evidence-doi-${evidence.id}`)).toHaveTextContent(evidence.doi!);
  });

  it("displays Grade A with green color styling", () => {
    const evidence = mockEvidence({ grade: "A" });
    render(<EvidenceCard evidence={evidence} />);

    const gradeBadge = screen.getByTestId(`evidence-grade-${evidence.id}`);
    expect(gradeBadge).toHaveTextContent("Grade A");
    expect(gradeBadge.className).toContain("bg-green-100");
    expect(gradeBadge.className).toContain("text-green-800");
  });

  it("displays Grade B with blue color styling", () => {
    const evidence = mockEvidence({ grade: "B" });
    render(<EvidenceCard evidence={evidence} />);

    const gradeBadge = screen.getByTestId(`evidence-grade-${evidence.id}`);
    expect(gradeBadge).toHaveTextContent("Grade B");
    expect(gradeBadge.className).toContain("bg-blue-100");
    expect(gradeBadge.className).toContain("text-blue-800");
  });

  it("displays Grade C with yellow color styling", () => {
    const evidence = mockEvidence({ grade: "C" });
    render(<EvidenceCard evidence={evidence} />);

    const gradeBadge = screen.getByTestId(`evidence-grade-${evidence.id}`);
    expect(gradeBadge).toHaveTextContent("Grade C");
    expect(gradeBadge.className).toContain("bg-yellow-100");
    expect(gradeBadge.className).toContain("text-yellow-800");
  });

  it("displays Grade D with red color styling", () => {
    const evidence = mockEvidence({ grade: "D" });
    render(<EvidenceCard evidence={evidence} />);

    const gradeBadge = screen.getByTestId(`evidence-grade-${evidence.id}`);
    expect(gradeBadge).toHaveTextContent("Grade D");
    expect(gradeBadge.className).toContain("bg-red-100");
    expect(gradeBadge.className).toContain("text-red-800");
  });

  it("shows PMID link when available", () => {
    const evidence = mockEvidence({ pmid: 12345678 });
    render(<EvidenceCard evidence={evidence} />);

    const pmidLink = screen.getByTestId(`evidence-pmid-link-${evidence.id}`);
    expect(pmidLink).toHaveTextContent("PMID: 12345678");
    expect(pmidLink).toHaveAttribute("href", "https://pubmed.ncbi.nlm.nih.gov/12345678/");
  });

  it("hides summary by default (collapsed state)", () => {
    const evidence = mockEvidence({ summary: "This is a test summary for the evidence." });
    render(<EvidenceCard evidence={evidence} />);

    expect(
      screen.queryByTestId(`evidence-summary-${evidence.id}`)
    ).not.toBeInTheDocument();
  });

  it("expands to show summary when expand button is clicked", () => {
    const evidence = mockEvidence({ summary: "This is a test summary for the evidence." });
    render(<EvidenceCard evidence={evidence} />);

    const expandBtn = screen.getByTestId(`expand-btn-${evidence.id}`);
    fireEvent.click(expandBtn);

    const summary = screen.getByTestId(`evidence-summary-${evidence.id}`);
    expect(summary).toBeInTheDocument();
    expect(summary).toHaveTextContent("This is a test summary for the evidence.");
  });

  it("collapses summary when expand button is clicked again", () => {
    const evidence = mockEvidence({ summary: "Toggle test summary." });
    render(<EvidenceCard evidence={evidence} />);

    const expandBtn = screen.getByTestId(`expand-btn-${evidence.id}`);
    fireEvent.click(expandBtn); // expand
    expect(screen.getByTestId(`evidence-summary-${evidence.id}`)).toBeInTheDocument();

    fireEvent.click(expandBtn); // collapse
    expect(
      screen.queryByTestId(`evidence-summary-${evidence.id}`)
    ).not.toBeInTheDocument();
  });

  it("renders with pre-expanded summary when isExpanded is true", () => {
    const evidence = mockEvidence({ isExpanded: true, summary: "Pre-expanded content." });
    render(<EvidenceCard evidence={evidence} />);

    expect(screen.getByTestId(`evidence-summary-${evidence.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`evidence-summary-${evidence.id}`)).toHaveTextContent(
      "Pre-expanded content."
    );
  });

  it("renders without PMID link when pmid is undefined", () => {
    const evidence = mockEvidence({ pmid: undefined });
    render(<EvidenceCard evidence={evidence} />);

    expect(
      screen.queryByTestId(`evidence-pmid-link-${evidence.id}`)
    ).not.toBeInTheDocument();
  });

  it("renders correctly when summary is undefined", () => {
    const evidence = mockEvidence({ summary: undefined });
    render(<EvidenceCard evidence={evidence} />);

    expect(screen.getByTestId(`evidence-card-${evidence.id}`)).toBeInTheDocument();
    // Clicking expand should not crash even without summary
    const expandBtn = screen.getByTestId(`expand-btn-${evidence.id}`);
    fireEvent.click(expandBtn);
    // Summary element may not render if no summary
    expect(screen.queryByTestId(`evidence-summary-${evidence.id}`)).not.toBeInTheDocument();
  });
});
