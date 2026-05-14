import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ParameterComparison } from "../../protocol/ParameterComparison";
import type { ProtocolParameter } from "../../protocol/protocolTypes";

describe("ParameterComparison", () => {
  const mockParams: ProtocolParameter[] = [
    {
      id: "p1",
      name: "Frequency",
      value: 10,
      unit: "Hz",
      min: 1,
      max: 50,
      required: true,
      aiSuggested: 10,
      clinicianEdit: 10,
    },
    {
      id: "p2",
      name: "Intensity",
      value: 80,
      unit: "% RMT",
      min: 50,
      max: 120,
      required: true,
      aiSuggested: 80,
      clinicianEdit: 85,
    },
  ];

  it("renders with data-testid", () => {
    render(
      <ParameterComparison
        parameters={mockParams}
        onUpdateParameter={vi.fn()}
        onAddParameter={vi.fn()}
        onRemoveParameter={vi.fn()}
      />,
    );
    expect(screen.getByTestId("parameter-comparison")).toBeInTheDocument();
  });

  it("displays all three column headers", () => {
    render(
      <ParameterComparison
        parameters={mockParams}
        onUpdateParameter={vi.fn()}
        onAddParameter={vi.fn()}
        onRemoveParameter={vi.fn()}
      />,
    );
    expect(screen.getByText("Parameter")).toBeInTheDocument();
    expect(screen.getByText("AI Suggested")).toBeInTheDocument();
    expect(screen.getByText("Clinician Edit")).toBeInTheDocument();
    expect(screen.getByText("Notes")).toBeInTheDocument();
  });

  it("renders parameter rows with correct data", () => {
    render(
      <ParameterComparison
        parameters={mockParams}
        onUpdateParameter={vi.fn()}
        onAddParameter={vi.fn()}
        onRemoveParameter={vi.fn()}
      />,
    );

    expect(screen.getByText("Frequency")).toBeInTheDocument();
    expect(screen.getByText("Intensity")).toBeInTheDocument();
    expect(screen.getByTestId("ai-value-p1")).toHaveTextContent("10 Hz");
    expect(screen.getByTestId("ai-value-p2")).toHaveTextContent("80 % RMT");
  });

  it("highlights modified parameters with amber background", () => {
    render(
      <ParameterComparison
        parameters={mockParams}
        onUpdateParameter={vi.fn()}
        onAddParameter={vi.fn()}
        onRemoveParameter={vi.fn()}
      />,
    );

    const modifiedRow = screen.getByTestId("param-row-p2");
    expect(modifiedRow.className).toContain("amber");
  });

  it("calls onUpdateParameter when value is changed", () => {
    const onUpdateParameter = vi.fn();
    render(
      <ParameterComparison
        parameters={mockParams}
        onUpdateParameter={onUpdateParameter}
        onAddParameter={vi.fn()}
        onRemoveParameter={vi.fn()}
      />,
    );

    const input = screen.getByTestId("clinician-input-p1");
    fireEvent.change(input, { target: { value: "15" } });
    expect(onUpdateParameter).toHaveBeenCalledWith("p1", {
      clinicianEdit: "15",
    });
  });

  it("calls onAddParameter when add button clicked", () => {
    const onAddParameter = vi.fn();
    render(
      <ParameterComparison
        parameters={mockParams}
        onUpdateParameter={vi.fn()}
        onAddParameter={onAddParameter}
        onRemoveParameter={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("add-parameter-btn"));
    expect(onAddParameter).toHaveBeenCalled();
  });

  it("calls onRemoveParameter when remove button clicked", () => {
    const onRemoveParameter = vi.fn();
    render(
      <ParameterComparison
        parameters={mockParams}
        onUpdateParameter={vi.fn()}
        onAddParameter={vi.fn()}
        onRemoveParameter={onRemoveParameter}
      />,
    );

    fireEvent.click(screen.getByTestId("remove-param-p1"));
    expect(onRemoveParameter).toHaveBeenCalledWith("p1");
  });

  it("shows validation error for out-of-range values", () => {
    const onUpdateParameter = vi.fn();
    render(
      <ParameterComparison
        parameters={mockParams}
        onUpdateParameter={onUpdateParameter}
        onAddParameter={vi.fn()}
        onRemoveParameter={vi.fn()}
      />,
    );

    const input = screen.getByTestId("clinician-input-p1");
    fireEvent.change(input, { target: { value: "100" } });

    expect(screen.getByTestId("error-p1")).toHaveTextContent(/Maximum 50/i);
  });

  it("validates using range when min/max not explicitly set", () => {
    const paramsWithRangeOnly = [
      {
        id: "p_range",
        name: "Test Param",
        value: 50,
        unit: "ms",
        range: [10, 100] as [number, number],
        required: true,
        aiSuggested: 50,
      },
    ];
    render(
      <ParameterComparison
        parameters={paramsWithRangeOnly}
        onUpdateParameter={vi.fn()}
        onAddParameter={vi.fn()}
        onRemoveParameter={vi.fn()}
      />,
    );

    const input = screen.getByTestId("clinician-input-p_range");
    fireEvent.change(input, { target: { value: "200" } });

    expect(screen.getByTestId("error-p_range")).toHaveTextContent(/Maximum 100/i);
  });

  it("displays empty state when no parameters", () => {
    render(
      <ParameterComparison
        parameters={[]}
        onUpdateParameter={vi.fn()}
        onAddParameter={vi.fn()}
        onRemoveParameter={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/No parameters defined/i),
    ).toBeInTheDocument();
  });

  it("shows range info for parameters with min/max", () => {
    render(
      <ParameterComparison
        parameters={mockParams}
        onUpdateParameter={vi.fn()}
        onAddParameter={vi.fn()}
        onRemoveParameter={vi.fn()}
      />,
    );

    expect(screen.getByText(/Range: 1-50 Hz/i)).toBeInTheDocument();
    expect(screen.getByText(/Range: 50-120 % RMT/i)).toBeInTheDocument();
  });
});
