import type { CSSProperties } from "react";
import { useState } from "react";

import { StudioErpMenu } from "../erp/StudioErpMenu";
import { StudioSourceMenu } from "../source/StudioSourceMenu";
import type { TrialSlice } from "../stores/eegViewer";
import { StudioSpectraMenu } from "../spectra/StudioSpectraMenu";
import { StudioReportMenu } from "../report/StudioReportMenu";
import { StudioSpikeMenu } from "../spikes/StudioSpikeMenu";
import { ArtifactCorrectionWindow } from "./ArtifactCorrectionWindow";
import { MarkArtifactsDialog } from "./MarkArtifactsDialog";
import { RemoveEogDialog } from "./RemoveEogDialog";
import { TemplatesManager } from "./TemplatesManager";

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
          <StudioSpectraMenu
            analysisId={recordingId}
            channelNames={channelNames}
            fromSec={fromSec}
            toSec={toSec}
            fragments={fragments}
          />
          <StudioErpMenu
            analysisId={recordingId}
            channelNames={channelNames}
            trials={trials}
            onTimelineReload={onTimelineReload}
          />
          <StudioSourceMenu
            analysisId={recordingId}
            channelNames={channelNames}
            trials={trials}
            fromSec={fromSec}
            toSec={toSec}
            availableClasses={stimulusClasses}
          />
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
