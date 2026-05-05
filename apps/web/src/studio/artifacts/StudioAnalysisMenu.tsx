import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";

import { ErpDialog } from "../erp/ErpDialog";
import { ErpWindow } from "../erp/ErpWindow";
import type { ErpComputeParams } from "../erp/types";
import type { TrialSlice } from "../stores/eegViewer";
import { StudioReportMenu } from "../report/StudioReportMenu";
import { StudioSpikeMenu } from "../spikes/StudioSpikeMenu";

export function StudioAnalysisMenu({
  recordingId,
  channelNames,
  trials,
  stimulusClasses,
  fromSec,
  toSec,
  highlightChannelId,
  patientId,
  fragments,
  onTimelineReload,
  onOpenDerivative,
  jumpToSec,
}: {
  recordingId: string;
  channelNames: string[];
  trials: TrialSlice[];
  stimulusClasses: string[];
  fromSec: number;
  toSec: number;
  highlightChannelId: string | null;
  patientId?: string | null;
  fragments: { id: string; label: string; startSec: number; endSec: number }[];
  onTimelineReload: () => void;
  onOpenDerivative?: (id: string) => void;
  jumpToSec?: (t: number) => void;
}) {
  const [markOpen, setMarkOpen] = useState(false);
  const [eogOpen, setEogOpen] = useState(false);
  const [corrOpen, setCorrOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const [erpDlgOpen, setErpDlgOpen] = useState(false);
  const [erpWinOpen, setErpWinOpen] = useState(false);

  return (
    <>
      <details style={{ fontSize: 11 }}>
        <summary style={{ cursor: "pointer", userSelect: "none" }}>Analysis</summary>
        <div
          style={{
            marginTop: 4,
            paddingLeft: 8,
            borderLeft: "1px solid var(--ds-line, #ddd)",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <button type="button" style={btn} onClick={() => setMarkOpen(true)}>
            Mark artifacts…
          </button>
          <button type="button" style={btn} onClick={() => setEogOpen(true)}>
            Remove EOG…
          </button>
          <button type="button" style={btn} onClick={() => setCorrOpen(true)}>
            Artifacts correction (PCA / ICA)…
          </button>
          <button type="button" style={btn} onClick={() => setTplOpen(true)}>
            Artifacts correction using templates…
          </button>
          <button type="button" style={btn} onClick={() => setErpDlgOpen(true)}>
            ERP → Compute…
          </button>
          <StudioSpikeMenu
            analysisId={recordingId}
            channelNames={channelNames}
            fromSec={fromSec}
            toSec={toSec}
            onTimelineReload={onTimelineReload}
            jumpToSec={jumpToSec}
          />
          <StudioReportMenu analysisId={recordingId} />
        </div>
      </details>

      <MarkArtifactsDialog
        open={markOpen}
        onOpenChange={setMarkOpen}
        analysisId={recordingId}
        channelNames={channelNames}
        onSaved={onTimelineReload}
      />
      <RemoveEogDialog
        open={eogOpen}
        onOpenChange={setEogOpen}
        analysisId={recordingId}
        channelNames={channelNames}
        highlightChannelId={highlightChannelId}
        onApplied={(id) => onOpenDerivative?.(id)}
      />
      <ArtifactCorrectionWindow
        open={corrOpen}
        onOpenChange={setCorrOpen}
        analysisId={recordingId}
        fromSec={fromSec}
        toSec={toSec}
      />
      <TemplatesManager
        open={tplOpen}
        onOpenChange={setTplOpen}
        analysisId={recordingId}
        patientId={patientId}
        onApplied={(id) => onOpenDerivative?.(id)}
      />

      <ErpDialog
        open={erpDlgOpen}
        onOpenChange={setErpDlgOpen}
        analysisId={recordingId}
        availableClasses={
          stimulusClasses.length ?
            stimulusClasses
          : [...new Set(trials.map((t) => t.stimulusClass).filter(Boolean))] as string[]
        }
        trials={trials}
        mode="compute"
        onConfirm={(_p: ErpComputeParams) => {
          void _p;
          setErpWinOpen(true);
        }}
      />
      <ErpWindow open={erpWinOpen} onOpenChange={setErpWinOpen} />
    </>
  );
}

const btn: CSSProperties = {
  fontSize: 11,
  textAlign: "left",
  padding: "2px 6px",
  cursor: "pointer",
  background: "transparent",
  border: "none",
  color: "inherit",
};

type FallbackDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
};

function FallbackDialog({ open, onOpenChange, title, children }: FallbackDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true" aria-label={title}>
      <div style={dialogStyle}>
        <div style={headerStyle}>
          <strong>{title}</strong>
          <button type="button" style={closeBtnStyle} onClick={() => onOpenChange(false)}>
            Close
          </button>
        </div>
        <div style={bodyStyle}>{children}</div>
      </div>
    </div>
  );
}

function MarkArtifactsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  analysisId: string;
  channelNames: string[];
  onSaved: () => void;
}) {
  return (
    <FallbackDialog open={open} onOpenChange={onOpenChange} title="Mark artifacts">
      Manual artifact marking is temporarily unavailable in this checkout.
    </FallbackDialog>
  );
}

function RemoveEogDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  analysisId: string;
  channelNames: string[];
  highlightChannelId: string | null;
  onApplied: (id: string) => void;
}) {
  return (
    <FallbackDialog open={open} onOpenChange={onOpenChange} title="Remove EOG">
      EOG removal tools are temporarily unavailable in this checkout.
    </FallbackDialog>
  );
}

function ArtifactCorrectionWindow({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  analysisId: string;
  fromSec: number;
  toSec: number;
}) {
  return (
    <FallbackDialog open={open} onOpenChange={onOpenChange} title="Artifacts correction">
      PCA and ICA correction tools are temporarily unavailable in this checkout.
    </FallbackDialog>
  );
}

function TemplatesManager({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  analysisId: string;
  patientId?: string | null;
  onApplied: (id: string) => void;
}) {
  return (
    <FallbackDialog open={open} onOpenChange={onOpenChange} title="Templates manager">
      Template-based artifact correction is temporarily unavailable in this checkout.
    </FallbackDialog>
  );
}

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  zIndex: 1000,
};

const dialogStyle: CSSProperties = {
  width: "min(480px, 100%)",
  background: "#fff",
  color: "#111827",
  borderRadius: 12,
  boxShadow: "0 24px 64px rgba(15, 23, 42, 0.24)",
  overflow: "hidden",
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "14px 16px",
  borderBottom: "1px solid #e5e7eb",
};

const bodyStyle: CSSProperties = {
  padding: 16,
  fontSize: 14,
  lineHeight: 1.5,
};

const closeBtnStyle: CSSProperties = {
  border: "1px solid #d1d5db",
  background: "#fff",
  borderRadius: 8,
  padding: "6px 10px",
  cursor: "pointer",
};
