import * as React from "react";

import type { ErpComputeParams } from "./types";
import { DEFAULT_ERP_PARAMS } from "./types";

export interface ErpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Analysis id for display only in Phase A stub */
  analysisId?: string;
  /** Stimulus classes from recording (Phase B will drive multi-select) */
  availableClasses: string[];
  onConfirm: (p: ErpComputeParams) => void;
}

/**
 * Phase A: minimal stub so StudioSourceMenu compiles. Full M9 UI lands in Phase B.
 * ERP compute API: POST /api/v1/studio/eeg/{analysis_id}/erp/compute
 */
export function ErpDialog({
  open,
  onOpenChange,
  analysisId,
  availableClasses: _availableClasses,
  onConfirm,
}: ErpDialogProps) {
  if (!open) return null;

  const useDefaults = () => {
    onConfirm(DEFAULT_ERP_PARAMS);
    onOpenChange(false);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        zIndex: 1200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
    >
      <div
        style={{
          background: "var(--ds-surface, #fff)",
          color: "var(--ds-text, #111)",
          padding: 16,
          borderRadius: 8,
          minWidth: 360,
          maxWidth: "90vw",
          maxHeight: "90vh",
          overflow: "auto",
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 8 }}>ERP / epoch parameters</div>
        <p style={{ fontSize: 12, opacity: 0.85, marginBottom: 12, lineHeight: 1.45 }}>
          Full ERP analysis UI ships in Phase B. For now you can continue with default epoch windows
          (baseline −200–0 ms, post-stim to 1000 ms) for LORETA / dipole workflows. Compute endpoint:{" "}
          <code style={{ fontSize: 11 }}>/api/v1/studio/eeg/…/erp/compute</code>
        </p>
        {analysisId ?
          <p style={{ fontSize: 10, opacity: 0.6, marginBottom: 12 }}>analysis: {analysisId}</p>
        : null}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" style={btnSecondary} onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button type="button" style={btnPrimary} onClick={useDefaults}>
            Continue with defaults
          </button>
        </div>
      </div>
    </div>
  );
}

const btnSecondary: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: 12,
  cursor: "pointer",
  border: "1px solid var(--ds-line, #ccc)",
  borderRadius: 6,
  background: "transparent",
};

const btnPrimary: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: 12,
  cursor: "pointer",
  border: "none",
  borderRadius: 6,
  background: "var(--ds-accent, #2563eb)",
  color: "#fff",
};
