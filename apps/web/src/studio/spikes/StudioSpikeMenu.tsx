import type { CSSProperties } from "react";
import { useState } from "react";

import { SpikeAverageWindow } from "./SpikeAverageWindow";
import { SpikeWindow } from "./SpikeWindow";
import type { SpikeRow } from "./types";

export function StudioSpikeMenu({
  analysisId,
  channelNames,
  fromSec,
  toSec,
  onTimelineReload,
  jumpToSec,
}: {
  analysisId: string;
  channelNames: string[];
  fromSec: number;
  toSec: number;
  onTimelineReload: () => void;
  jumpToSec?: (t: number) => void;
}) {
  const [winDet, setWinDet] = useState(false);
  const [winAvg, setWinAvg] = useState(false);
  const [cachedPeaks, setCachedPeaks] = useState<SpikeRow[]>([]);

  return (
    <>
      <button type="button" style={btn} onClick={() => setWinDet(true)}>
        Spike detection…
      </button>
      <button type="button" style={btn} onClick={() => setWinAvg(true)}>
        Spike averaging…
      </button>
      <SpikeWindow
        open={winDet}
        onOpenChange={setWinDet}
        analysisId={analysisId}
        channelNames={channelNames}
        fromSec={fromSec}
        toSec={toSec}
        jumpToSec={jumpToSec}
        onTimelineReload={onTimelineReload}
        onDetected={(rows) => setCachedPeaks(rows)}
      />
      <SpikeAverageWindow
        open={winAvg}
        onOpenChange={setWinAvg}
        analysisId={analysisId}
        peaks={cachedPeaks}
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
