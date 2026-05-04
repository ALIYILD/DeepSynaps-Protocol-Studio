import type { CSSProperties } from "react";
import { useEffect, useRef } from "react";

import { PagingController, SPEED_STEPS_SEC } from "../viewer/PagingController";
import { useFiltersStore } from "../stores/filters";
import { useViewStore } from "../stores/view";
import { useEegViewerStore } from "../stores/eegViewer";
import {
  GAIN_UV_CM_PRESETS,
  HIGH_CUT_HZ,
  LOW_CUT_SECONDS,
  NOTCH_OPTIONS,
} from "./filterConstants";

export function FiltersBar({
  highlightChannelId,
}: {
  highlightChannelId: string | null;
}) {
  const ctrlRef = useRef(false);
  useEffect(() => {
    const track = (e: KeyboardEvent) => {
      ctrlRef.current = e.ctrlKey || e.metaKey;
    };
    window.addEventListener("keydown", track, true);
    window.addEventListener("keyup", track, true);
    return () => {
      window.removeEventListener("keydown", track, true);
      window.removeEventListener("keyup", track, true);
    };
  }, []);

  const secondsPerPage = useViewStore((s) => s.secondsPerPage);
  const setSpeed = useViewStore((s) => s.setSecondsPerPage);

  const defaultGain = useEegViewerStore((s) => s.defaultGainUvPerCm);
  const setDefaultGain = useEegViewerStore((s) => s.setDefaultGainUvPerCm);

  const baselineUv = useFiltersStore((s) => s.baselineUv);
  const setBaselineUv = useFiltersStore((s) => s.setBaselineUv);
  const globalLowCutS = useFiltersStore((s) => s.globalLowCutS);
  const globalHighCutHz = useFiltersStore((s) => s.globalHighCutHz);
  const globalNotch = useFiltersStore((s) => s.globalNotch);
  const patch = useFiltersStore((s) => s.patchGlobalOrChannel);
  const resetAll = useFiltersStore((s) => s.resetAll);

  const rowStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 11,
    marginRight: 6,
    flexWrap: "nowrap",
  };

  const labelStyle: CSSProperties = { opacity: 0.75, marginRight: 2 };

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "4px 8px",
        padding: "4px 8px",
        borderBottom: "1px solid var(--ds-line, #ddd)",
        background: "var(--ds-elev, #f8f8f8)",
      }}
      title="Hold Ctrl while changing Low/High/Notch to override the highlighted channel only"
    >
      <div style={rowStyle}>
        <span style={labelStyle}>Speed</span>
        <select
          value={secondsPerPage}
          onChange={(e) => setSpeed(Number(e.target.value))}
          style={{ fontSize: 11, maxWidth: 72 }}
        >
          {SPEED_STEPS_SEC.map((s) => (
            <option key={s} value={s}>
              {s}s
            </option>
          ))}
        </select>
        <button
          type="button"
          style={{ fontSize: 10, padding: "1px 4px" }}
          onClick={() =>
            setSpeed(PagingController.nextSpeed(secondsPerPage, -1))
          }
          title="Faster (shorter page)"
        >
          −
        </button>
        <button
          type="button"
          style={{ fontSize: 10, padding: "1px 4px" }}
          onClick={() =>
            setSpeed(PagingController.nextSpeed(secondsPerPage, 1))
          }
          title="Slower (longer page)"
        >
          +
        </button>
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>Gain</span>
        <select
          value={defaultGain}
          onChange={(e) => setDefaultGain(Number(e.target.value))}
          style={{ fontSize: 11, maxWidth: 72 }}
        >
          {GAIN_UV_CM_PRESETS.map((g) => (
            <option key={g} value={g}>
              {g} µV/cm
            </option>
          ))}
        </select>
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>Baseline</span>
        <input
          type="number"
          step={0.1}
          value={baselineUv}
          onChange={(e) => setBaselineUv(Number(e.target.value))}
          style={{ width: 56, fontSize: 11 }}
        />
        <span style={{ opacity: 0.7 }}>µV</span>
      </div>

      <button
        type="button"
        style={{ fontSize: 11, padding: "2px 8px" }}
        onClick={() => resetAll()}
      >
        Reset
      </button>

      <div style={rowStyle}>
        <span style={labelStyle}>Low cut</span>
        <select
          value={globalLowCutS}
          onChange={(e) =>
            patch(
              "lowCutS",
              Number(e.target.value),
              {
                ctrl: ctrlRef.current,
                channelId: highlightChannelId,
              },
            )
          }
          style={{ fontSize: 11, maxWidth: 88 }}
        >
          {LOW_CUT_SECONDS.map((o) => (
            <option key={o.label} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>High cut</span>
        <select
          value={globalHighCutHz}
          onChange={(e) =>
            patch(
              "highCutHz",
              Number(e.target.value),
              {
                ctrl: ctrlRef.current,
                channelId: highlightChannelId,
              },
            )
          }
          style={{ fontSize: 11, maxWidth: 88 }}
        >
          {HIGH_CUT_HZ.map((o) => (
            <option key={o.label} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>Notch</span>
        <select
          value={globalNotch}
          onChange={(e) =>
            patch("notch", e.target.value, {
              ctrl: ctrlRef.current,
              channelId: highlightChannelId,
            })
          }
          style={{ fontSize: 11, maxWidth: 200 }}
        >
          {NOTCH_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.group}: {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
