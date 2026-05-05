import { useEffect, useMemo, useState } from "react";

import { buildInitialParams, ErpComputeForm } from "./ErpComputeForm";
import { useErpStore } from "./ErpStore";
import type { ErpComputeParams, ErpResult } from "./types";
import { DEFAULT_ERP_PARAMS } from "./types";

const inp: React.CSSProperties = { padding: "4px 8px", fontSize: 12 };

export type ErpDialogMode = "compute" | "paramsOnly";

export function ErpDialog({
  open,
  onOpenChange,
  analysisId,
  availableClasses,
  trials,
  onConfirm,
  mode = "paramsOnly",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  analysisId: string;
  availableClasses: string[];
  /** Viewer trials for low-trial warnings */
  trials?: { stimulusClass?: string }[];
  onConfirm: (p: ErpComputeParams, result?: ErpResult) => void | Promise<void>;
  /** `compute`: run ERP API then confirm with result. `paramsOnly`: legacy LORETA/dipole path. */
  mode?: ErpDialogMode;
}) {
  const [params, setParams] = useState<ErpComputeParams>(() => buildInitialParams(availableClasses));
  const setStoreParams = useErpStore((s) => s.setParams);
  const compute = useErpStore((s) => s.compute);
  const loading = useErpStore((s) => s.loading);
  const storeError = useErpStore((s) => s.error);
  const getErpState = useErpStore.getState;

  useEffect(() => {
    if (!open) return;
    setParams(buildInitialParams(availableClasses.length ? availableClasses : DEFAULT_ERP_PARAMS.stimulusClasses));
  }, [open, availableClasses]);

  const lowTrialWarn = useMemo(() => {
    if (!trials?.length || !params.stimulusClasses.length) return false;
    for (const c of params.stimulusClasses) {
      const n = trials.filter((t) => t.stimulusClass === c).length;
      if (n < params.minTrialsWarning) return true;
    }
    return false;
  }, [trials, params.stimulusClasses, params.minTrialsWarning]);

  if (!open) return null;

  const canSubmit = params.stimulusClasses.length > 0;

  const handleDefaults = () => {
    const p = buildInitialParams(availableClasses.length ? availableClasses : []);
    void onConfirm(p);
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setStoreParams(params);
    if (mode === "compute") {
      await compute(analysisId);
      const st = getErpState();
      if (st.error || !st.result) return;
      await onConfirm(params, st.result);
    } else {
      await onConfirm(params);
    }
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
          minWidth: 320,
          maxHeight: "90vh",
          overflow: "auto",
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
        }}
        role="dialog"
        aria-modal="true"
        aria-label="ERP compute"
      >
        <div style={{ fontWeight: 600, marginBottom: 8 }}>
          {mode === "compute" ? "ERP — compute averaged waveforms" : "Epoch parameters"}
        </div>
        {lowTrialWarn ?
          <div
            style={{
              fontSize: 11,
              padding: 8,
              marginBottom: 8,
              background: "rgba(245, 158, 11, 0.12)",
              borderRadius: 6,
              border: "1px solid rgba(245, 158, 11, 0.35)",
            }}
          >
            Selected stimulus classes include fewer than {params.minTrialsWarning} trials in this page — averages may be
            unstable.
          </div>
        : null}
        <ErpComputeForm availableClasses={availableClasses} value={params} onChange={setParams} />
        {storeError ?
          <div style={{ color: "#b91c1c", fontSize: 12, marginBottom: 8 }}>{storeError}</div>
        : null}
        <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button type="button" style={inp} onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button type="button" style={inp} onClick={handleDefaults}>
            Continue with defaults
          </button>
          <button
            type="button"
            style={inp}
            disabled={!canSubmit || (mode === "compute" && loading)}
            onClick={() => void handleSubmit()}
          >
            {mode === "compute" ?
              loading ?
                "Computing…"
              : "Compute ERP"
            : "Apply"}
          </button>
        </div>
      </div>
    </div>
  );
}
