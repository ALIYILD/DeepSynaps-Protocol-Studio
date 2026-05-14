/**
 * SuggestionChips Tests — DeepSynaps Protocol Studio
 * ===================================================
 * Tests chip rendering and click behavior.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SuggestionChips } from "../../copilot/SuggestionChips";
import type { SuggestionChip } from "../../copilot/types";

describe("SuggestionChips", () => {
  const createChips = (): SuggestionChip[] => [
    { id: "sg-001", label: "Generate Protocol", type: "protocol", icon: "beaker" },
    { id: "sg-002", label: "Run Analysis", type: "analysis", icon: "chart" },
    { id: "sg-003", label: "View Conditions", type: "condition", icon: "list" },
    { id: "sg-004", label: "Help", type: "general", icon: "question" },
  ];

  it("renders all suggestion chips", () => {
    const chips = createChips();
    render(<SuggestionChips suggestions={chips} />);

    expect(screen.getByTestId("suggestion-chips")).toBeInTheDocument();
    expect(screen.getByTestId("suggestion-chip-sg-001")).toBeInTheDocument();
    expect(screen.getByTestId("suggestion-chip-sg-002")).toBeInTheDocument();
    expect(screen.getByTestId("suggestion-chip-sg-003")).toBeInTheDocument();
    expect(screen.getByTestId("suggestion-chip-sg-004")).toBeInTheDocument();
  });

  it("renders each chip with correct label text", () => {
    const chips = createChips();
    render(<SuggestionChips suggestions={chips} />);

    expect(screen.getByTestId("suggestion-chip-sg-001")).toHaveTextContent("Generate Protocol");
    expect(screen.getByTestId("suggestion-chip-sg-002")).toHaveTextContent("Run Analysis");
    expect(screen.getByTestId("suggestion-chip-sg-003")).toHaveTextContent("View Conditions");
    expect(screen.getByTestId("suggestion-chip-sg-004")).toHaveTextContent("Help");
  });

  it("calls onChipClick when a chip is clicked", () => {
    const chips = createChips();
    const onChipClick = vi.fn();
    render(<SuggestionChips suggestions={chips} onChipClick={onChipClick} />);

    fireEvent.click(screen.getByTestId("suggestion-chip-sg-001"));
    expect(onChipClick).toHaveBeenCalledTimes(1);
    expect(onChipClick).toHaveBeenCalledWith(chips[0]);
  });

  it("calls onChipClick with correct chip data for each chip", () => {
    const chips = createChips();
    const onChipClick = vi.fn();
    render(<SuggestionChips suggestions={chips} onChipClick={onChipClick} />);

    fireEvent.click(screen.getByTestId("suggestion-chip-sg-002"));
    expect(onChipClick).toHaveBeenCalledWith(chips[1]);

    fireEvent.click(screen.getByTestId("suggestion-chip-sg-003"));
    expect(onChipClick).toHaveBeenCalledWith(chips[2]);
  });

  it("does not call onChipClick when disabled", () => {
    const chips = createChips();
    const onChipClick = vi.fn();
    render(<SuggestionChips suggestions={chips} onChipClick={onChipClick} disabled />);

    const chip = screen.getByTestId("suggestion-chip-sg-001");
    expect(chip).toBeDisabled();

    fireEvent.click(chip);
    expect(onChipClick).not.toHaveBeenCalled();
  });

  it("applies reduced opacity when disabled", () => {
    const chips = createChips();
    render(<SuggestionChips suggestions={chips} disabled />);

    const chip = screen.getByTestId("suggestion-chip-sg-001");
    expect(chip.className).toContain("opacity-40");
    expect(chip.className).toContain("cursor-not-allowed");
  });

  it("renders protocol chip with purple styling", () => {
    const chips: SuggestionChip[] = [{ id: "sg-001", label: "Protocol", type: "protocol" }];
    render(<SuggestionChips suggestions={chips} />);

    const chip = screen.getByTestId("suggestion-chip-sg-001");
    expect(chip.className).toContain("bg-purple-50");
    expect(chip.className).toContain("text-purple-700");
  });

  it("renders analysis chip with blue styling", () => {
    const chips: SuggestionChip[] = [{ id: "sg-001", label: "Analysis", type: "analysis" }];
    render(<SuggestionChips suggestions={chips} />);

    const chip = screen.getByTestId("suggestion-chip-sg-001");
    expect(chip.className).toContain("bg-blue-50");
    expect(chip.className).toContain("text-blue-700");
  });

  it("renders condition chip with green styling", () => {
    const chips: SuggestionChip[] = [{ id: "sg-001", label: "Condition", type: "condition" }];
    render(<SuggestionChips suggestions={chips} />);

    const chip = screen.getByTestId("suggestion-chip-sg-001");
    expect(chip.className).toContain("bg-green-50");
    expect(chip.className).toContain("text-green-700");
  });

  it("renders general chip with gray styling", () => {
    const chips: SuggestionChip[] = [{ id: "sg-001", label: "General", type: "general" }];
    render(<SuggestionChips suggestions={chips} />);

    const chip = screen.getByTestId("suggestion-chip-sg-001");
    expect(chip.className).toContain("bg-gray-50");
    expect(chip.className).toContain("text-gray-700");
  });

  it("renders nothing when suggestions array is empty", () => {
    const { container } = render(<SuggestionChips suggestions={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when suggestions is empty and container is checked", () => {
    render(<SuggestionChips suggestions={[]} />);
    expect(screen.queryByTestId("suggestion-chips")).not.toBeInTheDocument();
  });

  it("renders each chip as a button element", () => {
    const chips = createChips();
    render(<SuggestionChips suggestions={chips} />);

    chips.forEach((chip) => {
      expect(screen.getByTestId(`suggestion-chip-${chip.id}`).tagName).toBe("BUTTON");
    });
  });

  it("includes an SVG icon in each chip", () => {
    const chips = createChips();
    render(<SuggestionChips suggestions={chips} />);

    chips.forEach((chip) => {
      const chipEl = screen.getByTestId(`suggestion-chip-${chip.id}`);
      expect(chipEl.querySelector("svg")).toBeInTheDocument();
    });
  });
});
