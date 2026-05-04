import * as ContextMenu from "@radix-ui/react-context-menu";

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
  badChannels = [],
  onToggleBad,
  channelHasOverride,
}: {
  channels: string[];
  rowHeight: number;
  badChannels?: string[];
  onToggleBad?: (name: string) => void;
  channelHasOverride?: (name: string) => boolean;
}) {
  const highlight = useEegViewerStore((s) => s.highlightChannelId);
  const setHi = useEegViewerStore((s) => s.setHighlightChannelId);
  const bg = useEegViewerStore((s) => s.backgroundByChannel);
  const badSet = new Set(badChannels);

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
        const isBad = badSet.has(name);
        return (
          <ContextMenu.Root key={name}>
            <ContextMenu.Trigger asChild>
              <div
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
                  opacity: isBad ? 0.45 : 1,
                  color: isBad ? "var(--ds-muted, #888)" : undefined,
                }}
              >
                <span style={{ opacity: 0.75 }}>{BG_ICON[b]}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                  {name}
                </span>
                {channelHasOverride?.(name) ?
                  <span
                    title="Per-channel filter override (Ctrl + Low/High/Notch)"
                    style={{
                      fontSize: 9,
                      padding: "0 3px",
                      borderRadius: 3,
                      background: "rgba(120,80,200,0.2)",
                      flexShrink: 0,
                    }}
                  >
                    ƒ
                  </span>
                : null}
              </div>
            </ContextMenu.Trigger>
            <ContextMenu.Portal>
              <ContextMenu.Content
                style={{
                  background: "var(--ds-elev, #fff)",
                  border: "1px solid var(--ds-line, #ccc)",
                  borderRadius: 6,
                  padding: 4,
                  zIndex: 50,
                }}
              >
                <ContextMenu.Item
                  style={{ padding: "6px 10px", cursor: "pointer", fontSize: 11 }}
                  onSelect={() => onToggleBad?.(name)}
                >
                  {isBad ? "Unmark bad channel" : "Mark as bad"}
                </ContextMenu.Item>
              </ContextMenu.Content>
            </ContextMenu.Portal>
          </ContextMenu.Root>
        );
      })}
    </div>
  );
}
