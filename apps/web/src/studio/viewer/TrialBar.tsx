import type { TrialSlice } from "../stores/eegViewer";

const COL: Record<string, string> = {
  Go: "#2d7",
  NoGo: "#c55",
  Target: "#27c",
  NonTarget: "#888",
  Standard: "#888",
  Deviant: "#27c",
  Novel: "#a6c",
};

export function TrialBar({
  width,
  height,
  fromSec,
  toSec,
  trials,
  onToggle,
}: {
  width: number;
  height: number;
  fromSec: number;
  toSec: number;
  trials: TrialSlice[];
  onToggle: (id: string) => void;
}) {
  const span = toSec - fromSec || 1;
  const x = (t: number) => ((t - fromSec) / span) * width;

  return (
    <div
      style={{
        position: "relative",
        width,
        height,
        background: "var(--ds-surface)",
        borderTop: "1px solid var(--ds-line)",
      }}
    >
      {trials.map((t) => {
        const x0 = x(t.startSec);
        const x1 = x(t.endSec);
        const col = COL[t.kind] ?? "#666";
        const tip = `Trial ${t.index} ${t.stimulusClass ?? t.kind}${t.included ? "" : " (excluded)"}`;
        return (
          <button
            key={t.id}
            type="button"
            title={tip}
            onClick={() => onToggle(t.id)}
            style={{
              position: "absolute",
              left: x0,
              width: Math.max(16, x1 - x0),
              height: height - 4,
              top: 2,
              border: `2px solid ${col}`,
              borderRadius: 4,
              background: t.included ? `${col}22` : "transparent",
              color: col,
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {t.index}
          </button>
        );
      })}
    </div>
  );
}
