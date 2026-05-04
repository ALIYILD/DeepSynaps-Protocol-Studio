import { useEegViewerStore, type ChannelBackgroundState } from "../stores/eegViewer";

const BG_ICON: Record<ChannelBackgroundState, string> = {
  bar: "▮",
  channel: "◎",
  contour: "◍",
  closed: "◐",
  photo: "⚡",
  hipVen: "⌁",
  art: "✕",
  spike: "⌗",
};

export function ChannelRow({
  channels,
  rowHeight,
}: {
  channels: string[];
  rowHeight: number;
}) {
  const highlight = useEegViewerStore((s) => s.highlightChannelId);
  const setHi = useEegViewerStore((s) => s.setHighlightChannelId);
  const bg = useEegViewerStore((s) => s.backgroundByChannel);

  return (
    <div
      style={{
        width: 88,
        flexShrink: 0,
        borderRight: "1px solid var(--ds-line)",
        background: "var(--ds-surface)",
        fontSize: 10,
        lineHeight: 1.1,
        userSelect: "none",
      }}
    >
      {channels.map((name) => {
        const on = highlight === name;
        const b = bg[name] ?? "channel";
        return (
          <div
            key={name}
            title={`${name} — click to highlight (Ctrl+Gain applies to row)`}
            onClick={() => setHi(on ? null : name)}
            style={{
              height: rowHeight,
              display: "flex",
              alignItems: "center",
              gap: 4,
              paddingLeft: 4,
              cursor: "pointer",
              background: on ? "var(--ds-elev)" : undefined,
              borderBottom: "1px solid var(--ds-line)",
            }}
          >
            <span style={{ opacity: 0.75 }}>{BG_ICON[b]}</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
              {name}
            </span>
          </div>
        );
      })}
    </div>
  );
}
