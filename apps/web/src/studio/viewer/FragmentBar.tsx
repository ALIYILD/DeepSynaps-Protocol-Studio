import type { FragmentSlice } from "../stores/eegViewer";

export function FragmentBar({
  width,
  height,
  fromSec,
  toSec,
  fragments,
}: {
  width: number;
  height: number;
  fromSec: number;
  toSec: number;
  fragments: FragmentSlice[];
}) {
  const span = toSec - fromSec || 1;
  const x = (t: number) => ((t - fromSec) / span) * width;
  return (
    <div
      style={{
        position: "relative",
        width,
        height,
        background: "var(--ds-toolbar-bg)",
      }}
    >
      {fragments.map((f) => {
        const x0 = Math.max(0, x(f.startSec));
        const x1 = Math.min(width, x(f.endSec));
        if (x1 <= x0) return null;
        return (
          <div
            key={f.id}
            title={f.label}
            style={{
              position: "absolute",
              left: x0,
              top: 0,
              width: x1 - x0,
              height: "100%",
              background: f.color,
            }}
          />
        );
      })}
    </div>
  );
}
