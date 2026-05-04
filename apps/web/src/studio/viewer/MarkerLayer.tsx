/** SVG overlay for L/R cursors, drag selection, label flags (triangles), photic edges. */

export type LabelMarker = {
  timeSec: number;
  text: string;
  color?: string;
};

export function MarkerLayer({
  width,
  height,
  fromSec,
  toSec,
  leftSec,
  rightSec,
  dragSelect,
  labelMarkers,
  photicMarkers = [],
}: {
  width: number;
  height: number;
  fromSec: number;
  toSec: number;
  leftSec: number | null;
  rightSec: number | null;
  dragSelect: { startSec: number; endSec: number } | null;
  labelMarkers: LabelMarker[];
  photicMarkers?: { timeSec: number }[];
}) {
  const span = toSec - fromSec || 1;
  const x = (t: number) => ((t - fromSec) / span) * width;

  return (
    <svg
      width={width}
      height={height}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        pointerEvents: "none",
      }}
    >
      {dragSelect ? (
        <rect
          x={x(Math.min(dragSelect.startSec, dragSelect.endSec))}
          y={0}
          width={Math.abs(x(dragSelect.endSec) - x(dragSelect.startSec))}
          height={height}
          fill="rgba(30,80,200,0.15)"
        />
      ) : null}
      {leftSec != null && leftSec >= fromSec && leftSec <= toSec ? (
        <line
          x1={x(leftSec)}
          y1={0}
          x2={x(leftSec)}
          y2={height}
          stroke="#1e6bff"
          strokeWidth={1.5}
        />
      ) : null}
      {rightSec != null && rightSec >= fromSec && rightSec <= toSec ? (
        <line
          x1={x(rightSec)}
          y1={0}
          x2={x(rightSec)}
          y2={height}
          stroke="#d92c2c"
          strokeWidth={1.5}
        />
      ) : null}
      {photicMarkers.map((m, i) =>
        m.timeSec >= fromSec && m.timeSec <= toSec ?
          <g key={`ph-${i}-${m.timeSec}`}>
            <polygon
              points={`${x(m.timeSec)},4 ${x(m.timeSec) - 4},14 ${x(m.timeSec) + 4},14`}
              fill="#7c3aed"
              opacity={0.85}
            />
            <title>Photic stimulus (auto)</title>
          </g>
        : null,
      )}
      {labelMarkers.map((m, i) =>
        m.timeSec >= fromSec && m.timeSec <= toSec ?
          <g key={`${m.timeSec}-${i}`}>
            <polygon
              points={`${x(m.timeSec)},0 ${x(m.timeSec) - 5},12 ${x(m.timeSec) + 5},12`}
              fill={m.color ?? "#6b5b00"}
            />
            <title>{m.text}</title>
            <text
              x={x(m.timeSec) + 6}
              y={11}
              fontSize={9}
              fill="var(--ds-muted)"
            >
              {m.text}
            </text>
          </g>
        : null,
      )}
    </svg>
  );
}
