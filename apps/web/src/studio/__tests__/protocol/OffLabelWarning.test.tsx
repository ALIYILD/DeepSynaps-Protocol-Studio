import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { OffLabelWarning } from "../../protocol/OffLabelWarning";

describe("OffLabelWarning", () => {
  it("renders with data-testid", () => {
    render(
      <OffLabelWarning
        acknowledged={false}
        onAcknowledge={vi.fn()}
      />,
    );
    expect(screen.getByTestId("off-label-warning")).toBeInTheDocument();
  });

  it("displays off-label warning text", () => {
    render(
      <OffLabelWarning
        acknowledged={false}
        onAcknowledge={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/OFF-LABEL USE: This protocol is not approved by regulatory authorities/i),
    ).toBeInTheDocument();
  });

  it("displays CRITICAL badge", () => {
    render(
      <OffLabelWarning
        acknowledged={false}
        onAcknowledge={vi.fn()}
      />,
    );
    expect(screen.getByText("CRITICAL")).toBeInTheDocument();
  });

  it("displays the acknowledgement checkbox", () => {
    render(
      <OffLabelWarning
        acknowledged={false}
        onAcknowledge={vi.fn()}
      />,
    );
    expect(
      screen.getByText("I understand and accept responsibility for off-label use"),
    ).toBeInTheDocument();
  });

  it("opens confirmation modal when checkbox is clicked", () => {
    render(
      <OffLabelWarning
        acknowledged={false}
        onAcknowledge={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("off-label-checkbox"));
    expect(screen.getByTestId("off-label-modal")).toBeInTheDocument();
  });

  it("calls onAcknowledge(true) when modal is confirmed", async () => {
    const onAcknowledge = vi.fn();
    render(
      <OffLabelWarning
        acknowledged={false}
        onAcknowledge={onAcknowledge}
      />,
    );

    fireEvent.click(screen.getByTestId("off-label-checkbox"));
    expect(screen.getByTestId("off-label-modal")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("off-label-modal-confirm"));
    await waitFor(() => {
      expect(onAcknowledge).toHaveBeenCalledWith(true);
    });
  });

  it("calls onAcknowledge(false) when modal is cancelled", () => {
    const onAcknowledge = vi.fn();
    render(
      <OffLabelWarning
        acknowledged={false}
        onAcknowledge={onAcknowledge}
      />,
    );

    fireEvent.click(screen.getByTestId("off-label-checkbox"));
    fireEvent.click(screen.getByTestId("off-label-modal-cancel"));
    expect(onAcknowledge).toHaveBeenCalledWith(false);
  });

  it("shows acknowledgement indicators when acknowledged", () => {
    render(
      <OffLabelWarning
        acknowledged={true}
        onAcknowledge={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/Off-label responsibility acknowledged and documented/i),
    ).toBeInTheDocument();
  });

  it("displays four acknowledgement consequences", () => {
    render(
      <OffLabelWarning
        acknowledged={false}
        onAcknowledge={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/not approved by the FDA/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/clinical judgment and available evidence/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/full medico-legal responsibility/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/documented the clinical rationale/i),
    ).toBeInTheDocument();
  });
});
