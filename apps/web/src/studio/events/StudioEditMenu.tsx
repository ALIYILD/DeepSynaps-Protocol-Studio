import type { CSSProperties } from "react";
import { useRef, useState } from "react";

import { AddLabelDialog } from "./AddLabelDialog";
import { FindReplaceDialog } from "./FindReplaceDialog";
import { FragmentNamesDialog } from "./FragmentNamesDialog";
import { LabelListDialog } from "./LabelList";
import { TrialLabelsDialog } from "./TrialLabelsDialog";
import { postTrialImport } from "./eventApi";
import type { FragmentSlice } from "../stores/eegViewer";
import type { ViewerMarker } from "../stores/eegViewer";
import type { TrialSlice } from "../stores/eegViewer";

export function StudioEditMenu({
  recordingId,
  leftCursorSec,
  pageStartSec,
  highlightChannelId,
  markers,
  fragments,
  trials,
  onTimelineReload,
  jumpToSec,
}: {
  recordingId: string;
  leftCursorSec: number | null;
  pageStartSec: number;
  highlightChannelId: string | null;
  markers: ViewerMarker[];
  fragments: FragmentSlice[];
  trials: TrialSlice[];
  onTimelineReload: () => void;
  jumpToSec: (t: number) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [trialOpen, setTrialOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [labelListOpen, setLabelListOpen] = useState(false);
  const [fragNamesOpen, setFragNamesOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const t0 = leftCursorSec ?? pageStartSec;

  const runImport = async (file: File | null) => {
    if (!file || recordingId === "demo") return;
    const raw = await file.text();
    try {
      await postTrialImport(recordingId, raw);
      onTimelineReload();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "import failed");
    }
  };

  return (
    <>
      <details style={{ fontSize: 11 }}>
        <summary style={{ cursor: "pointer", userSelect: "none" }}>Edit</summary>
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
          <button
            type="button"
            style={btn}
            onClick={() => setAddOpen(true)}
          >
            Add label / fragment…
          </button>
          <button type="button" style={btn} onClick={() => setTrialOpen(true)}>
            Trial labels…
          </button>
          <button type="button" style={btn} onClick={() => setFindOpen(true)}>
            Find / Replace…
          </button>
          <button
            type="button"
            style={btn}
            onClick={() => fileRef.current?.click()}
          >
            Load trial list (CSV/JSON)…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.json,text/plain"
            style={{ display: "none" }}
            onChange={(e) => void runImport(e.target.files?.[0] ?? null)}
          />
          <button type="button" style={btn} onClick={() => setLabelListOpen(true)}>
            Setup → Label list…
          </button>
          <button type="button" style={btn} onClick={() => setFragNamesOpen(true)}>
            Setup → Fragment names…
          </button>
        </div>
      </details>

      <AddLabelDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        analysisId={recordingId}
        defaultTimeSec={t0}
        highlightChannelId={highlightChannelId}
        onSaved={onTimelineReload}
      />
      <TrialLabelsDialog
        open={trialOpen}
        onOpenChange={setTrialOpen}
        analysisId={recordingId}
        trials={trials}
        onReload={onTimelineReload}
      />
      <FindReplaceDialog
        open={findOpen}
        onOpenChange={setFindOpen}
        analysisId={recordingId}
        markers={markers}
        fragments={fragments}
        onPatched={onTimelineReload}
        jumpToSec={jumpToSec}
      />
      <LabelListDialog open={labelListOpen} onOpenChange={setLabelListOpen} />
      <FragmentNamesDialog open={fragNamesOpen} onOpenChange={setFragNamesOpen} />
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
