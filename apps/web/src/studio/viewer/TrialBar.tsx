import type { TrialSlice } from "../stores/eegViewer";

const COL: Record<TrialSlice["kind"], string> = {
  Go: "#2d7",
  NoGo: "#c55",
  Target: "#27c",
  NonTarget: "#888",
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
        return (
          <button
            key={t.id}
            type="button"
            title={`Trial ${t.index} ${t.kind}${t.included ? "" : " (excluded)"}`}
            onClick={() => onToggle(t.id)}
            style={{
              position: "absolute",
              left: x0,
              width: Math.max(16, x1 - x0),
              height: height - 4,
              top: 2,
              border: `2px solid ${COL[t.kind]}`,
              borderRadius: 4,
              background: t.included ? `${COL[t.kind]}22` : "transparent",
              color: COL[t.kind],
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
