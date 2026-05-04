import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { BandrangeMenu } from "../filters/BandrangeMenu";
import { FiltersBar } from "../filters/FiltersBar";
import { MontageEditorTrigger } from "../montage/MontageEditor";
import { MontagePicker } from "../montage/MontagePicker";
import { useMontageStore } from "../montage/useMontage";
import { useAiStore } from "../stores/ai";
import { useFiltersStore } from "../stores/filters";
import { useEegViewerStore } from "../stores/eegViewer";
import { useViewStore } from "../stores/view";
import { ChannelRow } from "./ChannelRow";
import { EegCanvas } from "./EegCanvas";
import { FragmentBar } from "./FragmentBar";
import { MarkerLayer } from "./MarkerLayer";
import { PagingController } from "./PagingController";
import { PhotoBar } from "./PhotoBar";
import { useEegStatusMetrics } from "./StatusBindings";
import { TrialBar } from "./TrialBar";
import { useEegStream } from "./useEegStream";
import { estimatePhoticHz } from "./estimatePhoticHz";
import { patchTrial } from "../events/eventApi";
import { photicEdgeMarkers } from "../events/photicMarkers";
import { StudioEditMenu } from "../events/StudioEditMenu";
import { useRecordingTimeline } from "../events/useEvents";

const PREDEFINED_LABELS = [
  "EO",
  "EC",
  "Eyes open",
  "Eyes closed",
  "Photic",
  "HV",
  "Custom",
];

function GridOverlay({
  width,
  height,
  fromSec,
  toSec,
}: {
  width: number;
  height: number;
  fromSec: number;
  toSec: number;
}) {
  const span = toSec - fromSec || 1;
  const lines: { x: number; minor: boolean }[] = [];
  const i0 = Math.floor(fromSec);
  const i1 = Math.ceil(toSec);
  for (let s = i0; s <= i1; s++) {
    const xf = (s - fromSec) / span;
    if (xf >= 0 && xf <= 1)
      lines.push({ x: xf * width, minor: false });
    for (let ms = 1; ms < 10; ms++) {
      const t = s + ms / 10;
      if (t > fromSec && t < toSec) {
        const xf2 = (t - fromSec) / span;
        lines.push({ x: xf2 * width, minor: true });
      }
    }
  }
  return (
    <svg
      width={width}
      height={height}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
      }}
    >
      {lines.map((ln, i) => (
        <line
          key={`${ln.x}-${ln.minor}-${i}`}
          x1={ln.x}
          y1={0}
          x2={ln.x}
          y2={height}
          stroke={ln.minor ? "rgba(0,0,0,0.06)" : "rgba(0,0,0,0.14)"}
          strokeWidth={ln.minor ? 0.5 : 1}
        />
      ))}
    </svg>
  );
}

export function EegViewer({ recordingId }: { recordingId: string }) {
  const traceWrapRef = useRef<HTMLDivElement>(null);
  const [traceSize, setTraceSize] = useState({ w: 800, h: 400 });

  const pageStartSec = useViewStore((s) => s.pageStartSec);
  const secondsPerPage = useViewStore((s) => s.secondsPerPage);
  const setPage = useViewStore((s) => s.setPageStartSec);
  const setSpeed = useViewStore((s) => s.setSecondsPerPage);
  const gainStore = useViewStore((s) => s.gainPerChannel);

  const leftCursorSec = useEegViewerStore((s) => s.leftCursorSec);
  const rightCursorSec = useEegViewerStore((s) => s.rightCursorSec);
  const setLeft = useEegViewerStore((s) => s.setLeftCursorSec);
  const setRight = useEegViewerStore((s) => s.setRightCursorSec);
  const dragSelect = useEegViewerStore((s) => s.dragSelect);
  const setDrag = useEegViewerStore((s) => s.setDragSelect);
  const highlightId = useEegViewerStore((s) => s.highlightChannelId);
  const defaultGain = useEegViewerStore((s) => s.defaultGainUvPerCm);
  const setDefaultGain = useEegViewerStore((s) => s.setDefaultGainUvPerCm);
  const gainByCh = useEegViewerStore((s) => s.gainUvPerCmByChannel);
  const setGainCh = useEegViewerStore((s) => s.setGainUvPerCmForChannel);
  const markers = useEegViewerStore((s) => s.markers);
  const addMarker = useEegViewerStore((s) => s.addMarker);
  const removeMarker = useEegViewerStore((s) => s.removeMarker);
  const fragments = useEegViewerStore((s) => s.fragments);
  const setFragments = useEegViewerStore((s) => s.setFragments);
  const trials = useEegViewerStore((s) => s.trials);
  const toggleTrial = useEegViewerStore((s) => s.toggleTrialIncluded);
  const setMeta = useEegViewerStore((s) => s.setRecordingMeta);
  const setLastVp = useEegViewerStore((s) => s.setLastViewport);
  const setPhoticStore = useEegViewerStore((s) => s.setPhoticHz);
  const hasVideo = useEegViewerStore((s) => s.hasVideo);
  const setMarkersStore = useEegViewerStore((s) => s.setMarkers);
  const setFragmentsStore = useEegViewerStore((s) => s.setFragments);
  const setTrialsStore = useEegViewerStore((s) => s.setTrials);

  const { reload: reloadTimeline } = useRecordingTimeline(recordingId);

  const viewportChanged = useAiStore((s) => s.viewportChanged);
  const montageChanged = useAiStore((s) => s.montageChanged);
  const filtersChanged = useAiStore((s) => s.filtersChanged);

  const globalLowCutS = useFiltersStore((s) => s.globalLowCutS);
  const globalHighCutHz = useFiltersStore((s) => s.globalHighCutHz);
  const globalNotch = useFiltersStore((s) => s.globalNotch);
  const baselineUv = useFiltersStore((s) => s.baselineUv);
  const overridesJson = useFiltersStore((s) =>
    JSON.stringify(s.serializeOverridesForApi()),
  );
  const channelHasOverride = useFiltersStore((s) => s.channelHasOverrideBadge);

  const liveFilters = useMemo(
    () => ({
      lowCutS: globalLowCutS,
      highCutHz: globalHighCutHz,
      notch: globalNotch,
      baselineUv,
      overridesJson,
    }),
    [
      globalLowCutS,
      globalHighCutHz,
      globalNotch,
      baselineUv,
      overridesJson,
    ],
  );

  const montageId = useMontageStore((s) => s.montageId);
  const badChannels = useMontageStore((s) => s.badChannels);
  const toggleBadChannel = useMontageStore((s) => s.toggleBadChannel);

  const fromSec = pageStartSec;
  const toSec = pageStartSec + secondsPerPage;
  const maxPoints = useMemo(
    () => Math.min(30_000, Math.max(800, Math.floor(traceSize.w * 2))),
    [traceSize.w],
  );

  const { loading, error, payload } = useEegStream(
    recordingId,
    fromSec,
    toSec,
    maxPoints,
    null,
    montageId,
    badChannels,
    liveFilters,
  );

  useEffect(() => {
    filtersChanged({
      lowCutS: globalLowCutS,
      highCutHz: globalHighCutHz,
      notch: globalNotch,
      baselineUv,
      overridesJson,
    });
  }, [
    filtersChanged,
    globalLowCutS,
    globalHighCutHz,
    globalNotch,
    baselineUv,
    overridesJson,
  ]);

  const montageEmitKey = useRef<string>("");

  useEffect(() => {
    if (!payload?.channels?.length) return;
    const mid = payload.montageId ?? montageId;
    const key = `${mid}|${payload.channels.join("\u0001")}`;
    if (montageEmitKey.current === key) return;
    montageEmitKey.current = key;
    montageChanged({
      montageId: mid,
      derivations: payload.channels.map((label) => ({
        label,
        plus: [],
        minus: [],
      })),
    });
  }, [montageId, montageChanged, payload?.channels, payload?.montageId]);

  useEffect(() => {
    if (recordingId === "demo") {
      setMarkersStore([]);
      setFragmentsStore([]);
      setTrialsStore([]);
    }
  }, [recordingId, setMarkersStore, setFragmentsStore, setTrialsStore]);

  useEffect(() => {
    if (!payload) return;
    setMeta(payload.totalDurationSec, false);
    if (recordingId !== "demo") return;
    if (payload.fragments?.length)
      setFragments(
        payload.fragments.map((f) => ({
          id: f.id,
          label: f.label,
          startSec: f.startSec,
          endSec: f.endSec,
          color: f.color,
        })),
      );
  }, [payload, recordingId, setFragments, setMeta]);

  const channels = useMemo(
    () => payload?.channels ?? [],
    [payload],
  );
  const photicEst = useMemo(
    () =>
      estimatePhoticHz(payload?.photic, payload?.sampleRateHz ?? 250) ?? null,
    [payload],
  );
  useEffect(() => {
    setPhoticStore(photicEst);
  }, [photicEst, setPhoticStore]);

  const activeChIdx = useMemo(() => {
    if (!highlightId || !channels.length) return 0;
    const j = channels.indexOf(highlightId);
    return j >= 0 ? j : 0;
  }, [highlightId, channels]);

  useEegStatusMetrics(payload, activeChIdx, photicEst);

  const gainUvPerCm = useCallback(
    (ch: string) =>
      gainByCh[ch] ??
      gainStore[ch] ??
      defaultGain,
    [gainByCh, gainStore, defaultGain],
  );

  const dragStartRef = useRef<number | null>(null);

  const timeAtClientX = useCallback(
    (clientX: number) => {
      const el = traceWrapRef.current;
      if (!el || !payload) return null;
      const r = el.getBoundingClientRect();
      const frac = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      return fromSec + frac * (toSec - fromSec);
    },
    [payload, fromSec, toSec],
  );

  const durationSec = payload?.totalDurationSec ?? 3600;

  const pageForTime = useCallback(
    (t: number) =>
      PagingController.clampStart(t, secondsPerPage, durationSec),
    [secondsPerPage, durationSec],
  );

  const emitViewport = useCallback(() => {
    if (!payload) return;
    const p = { fromSec, toSec, channels: payload.channels };
    setLastVp(p);
    viewportChanged(p);
  }, [fromSec, toSec, payload, setLastVp, viewportChanged]);

  useLayoutEffect(() => {
    const el = traceWrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setTraceSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setTraceSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    emitViewport();
  }, [emitViewport]);

  const labelFlags = useMemo(
    () =>
      markers
        .filter((m) => m.kind === "label")
        .map((m) => ({
          timeSec: m.fromSec,
          text: m.text ?? "?",
          color: m.color,
        })),
    [markers],
  );

  const photicMarkers = useMemo(
    () =>
      photicEdgeMarkers(
        payload?.photic,
        payload?.sampleRateHz ?? 250,
        payload?.fromSec ?? fromSec,
      ),
    [payload?.photic, payload?.sampleRateHz, payload?.fromSec, fromSec],
  );

  const toggleTrialRemote = useCallback(
    (id: string) => {
      const prev =
        useEegViewerStore.getState().trials.find((x) => x.id === id)?.included ??
        true;
      toggleTrial(id);
      if (recordingId !== "demo") {
        void patchTrial(recordingId, id, { included: !prev }).catch(() => {});
      }
    },
    [recordingId, toggleTrial],
  );

  const jumpToSec = useCallback(
    (t: number) => {
      setPage(pageForTime(t));
    },
    [setPage, pageForTime],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const dur = durationSec;
      if (e.code === "ArrowLeft") {
        e.preventDefault();
        setPage(
          e.shiftKey ?
            PagingController.halfPage(
              pageStartSec,
              secondsPerPage,
              dur,
              -1,
            )
          : PagingController.nextPage(
              pageStartSec,
              secondsPerPage,
              dur,
              -1,
            ),
        );
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        setPage(
          e.shiftKey ?
            PagingController.halfPage(
              pageStartSec,
              secondsPerPage,
              dur,
              1,
            )
          : PagingController.nextPage(
              pageStartSec,
              secondsPerPage,
              dur,
              1,
            ),
        );
      } else if (e.code === "Home") {
        e.preventDefault();
        setPage(0);
      } else if (e.code === "End") {
        e.preventDefault();
        setPage(PagingController.clampStart(dur - 0.01, secondsPerPage, dur));
      } else if (e.code === "NumpadAdd") {
        e.preventDefault();
        const d = 0.5;
        if (e.ctrlKey && highlightId) {
          setGainCh(highlightId, (gainUvPerCm(highlightId) || 7) + d);
        } else {
          setDefaultGain(defaultGain + d);
        }
      } else if (e.code === "NumpadSubtract") {
        e.preventDefault();
        const d = 0.5;
        if (e.ctrlKey && highlightId) {
          setGainCh(
            highlightId,
            Math.max(0.5, (gainUvPerCm(highlightId) || 7) - d),
          );
        } else {
          setDefaultGain(Math.max(0.5, defaultGain - d));
        }
      } else if (e.code === "NumpadMultiply") {
        e.preventDefault();
        setSpeed(PagingController.nextSpeed(secondsPerPage, 1));
      } else if (e.code === "NumpadDivide") {
        e.preventDefault();
        setSpeed(PagingController.nextSpeed(secondsPerPage, -1));
      } else if (e.ctrlKey && e.key.toLowerCase() === "g") {
        e.preventDefault();
        const v = window.prompt("Go to time (seconds)", "0");
        if (v != null) {
          const t = Number(v);
          if (Number.isFinite(t)) setPage(pageForTime(t));
        }
      } else if (e.ctrlKey && e.key.toLowerCase() === "x") {
        e.preventDefault();
        if (dragSelect) {
          const a = Math.min(dragSelect.startSec, dragSelect.endSec);
          const b = Math.max(dragSelect.startSec, dragSelect.endSec);
          addMarker({
            kind: "artifact",
            fromSec: a,
            toSec: b,
            text: "cut",
          });
          setDrag(null);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    pageStartSec,
    secondsPerPage,
    durationSec,
    setPage,
    setSpeed,
    defaultGain,
    setDefaultGain,
    highlightId,
    setGainCh,
    gainUvPerCm,
    dragSelect,
    addMarker,
    setDrag,
    pageForTime,
  ]);

  const rowCount = Math.max(1, channels.length || 1);
  const traceHeight = Math.max(120, traceSize.h);
  const rowH = traceHeight / rowCount;
  const photoH = 28;
  const trialH = trials.length ? 32 : 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 320,
        background: "var(--ds-surface, #fff)",
        color: "var(--ds-text, #111)",
      }}
    >
      <FiltersBar highlightChannelId={highlightId} />
      <div
        style={{
          fontSize: 11,
          padding: "4px 8px",
          opacity: 0.8,
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "4px 0",
        }}
      >
        <BandrangeMenu
          analysisId={recordingId}
          selectionChannels={
            highlightId ? [highlightId] : (payload?.channels ?? [])
          }
        />
        <StudioEditMenu
          recordingId={recordingId}
          leftCursorSec={leftCursorSec}
          pageStartSec={pageStartSec}
          highlightChannelId={highlightId}
          markers={markers}
          fragments={fragments}
          trials={trials}
          onTimelineReload={() => void reloadTimeline()}
          jumpToSec={jumpToSec}
        />
        <MontagePicker recordingId={recordingId} />
        <MontageEditorTrigger recordingId={recordingId} />
        <span style={{ marginLeft: 8 }}>
          {loading ? "Loading…" : null}
          {error ? ` ${error}` : null}
          {" — "}
          Page {fromSec.toFixed(2)}→{toSec.toFixed(2)} s · speed{" "}
          {secondsPerPage}s · recording {durationSec.toFixed(0)}s
        </span>
        {payload?.montageWarnings?.length ?
          <span style={{ marginLeft: 8, color: "#a60", maxWidth: 480 }} title={payload.montageWarnings.join("\n")}>
            ⚠ {payload.montageWarnings[0]}
            {payload.montageWarnings.length > 1 ?
              ` (+${payload.montageWarnings.length - 1})`
            : ""}
          </span>
        : null}
        {payload?.filterWarnings?.length ?
          <span style={{ marginLeft: 8, color: "#06a", maxWidth: 480 }} title={payload.filterWarnings.join("\n")}>
            ⓘ {payload.filterWarnings[0]}
            {payload.filterWarnings.length > 1 ?
              ` (+${payload.filterWarnings.length - 1})`
            : ""}
          </span>
        : null}
      </div>
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <ChannelRow
          channels={channels.length ? channels : ["—"]}
          rowHeight={rowH}
          badChannels={badChannels}
          onToggleBad={toggleBadChannel}
          channelHasOverride={channelHasOverride}
        />
        <ContextMenu.Root>
          <ContextMenu.Trigger asChild>
            <div
              ref={traceWrapRef}
              style={{
                flex: 1,
                position: "relative",
                minWidth: 0,
                minHeight: traceHeight + photoH + trialH,
              }}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                const t = timeAtClientX(e.clientX);
                if (t == null) return;
                if (e.shiftKey) {
                  setRight(t);
                  return;
                }
                setLeft(t);
                dragStartRef.current = t;
                setDrag({ startSec: t, endSec: t });
              }}
              onPointerMove={(e) => {
                if (e.buttons !== 1 || dragStartRef.current == null) return;
                const t = timeAtClientX(e.clientX);
                if (t == null) return;
                const a = dragStartRef.current;
                setDrag({ startSec: a, endSec: t });
              }}
              onPointerUp={() => {
                dragStartRef.current = null;
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: 0,
                  height: traceHeight,
                }}
              >
                <GridOverlay
                  width={traceSize.w}
                  height={traceHeight}
                  fromSec={fromSec}
                  toSec={toSec}
                />
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    opacity: 1,
                  }}
                >
                  <FragmentBar
                    width={traceSize.w}
                    height={traceHeight}
                    fromSec={fromSec}
                    toSec={toSec}
                    fragments={fragments}
                  />
                </div>
                {payload ?
                  <div style={{ position: "absolute", inset: 0 }}>
                    <EegCanvas
                      width={traceSize.w}
                      height={traceHeight}
                      sampleRateHz={payload.sampleRateHz}
                      fromSec={payload.fromSec}
                      toSec={payload.toSec}
                      channelNames={payload.channels}
                      rows={payload.data}
                      gainUvPerCm={gainUvPerCm}
                    />
                  </div>
                : null}
                <MarkerLayer
                  width={traceSize.w}
                  height={traceHeight}
                  fromSec={fromSec}
                  toSec={toSec}
                  leftSec={leftCursorSec}
                  rightSec={rightCursorSec}
                  dragSelect={dragSelect}
                  labelMarkers={labelFlags}
                  photicMarkers={photicMarkers}
                />
              </div>
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: traceHeight,
                  height: photoH,
                }}
              >
                {payload ?
                  <PhotoBar
                    width={traceSize.w}
                    height={photoH}
                    fromSec={fromSec}
                    toSec={toSec}
                    photic={payload.photic}
                    sampleRate={payload.sampleRateHz}
                  />
                : null}
              </div>
              {trials.length ?
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: traceHeight + photoH,
                    height: trialH,
                  }}
                >
                  <TrialBar
                    width={traceSize.w}
                    height={trialH}
                    fromSec={fromSec}
                    toSec={toSec}
                    trials={trials}
                    onToggle={toggleTrialRemote}
                  />
                </div>
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
                style={{ padding: "6px 10px", cursor: "pointer" }}
                onSelect={() => {
                  const t =
                    leftCursorSec ??
                    (fromSec + toSec) / 2;
                  addMarker({
                    kind: "label",
                    fromSec: t,
                    text: PREDEFINED_LABELS[0],
                  });
                }}
              >
                Add Label here
              </ContextMenu.Item>
              <ContextMenu.Item
                style={{ padding: "6px 10px", cursor: "pointer" }}
                onSelect={() => {
                  if (!dragSelect) return;
                  const a = Math.min(dragSelect.startSec, dragSelect.endSec);
                  const b = Math.max(dragSelect.startSec, dragSelect.endSec);
                  addMarker({
                    kind: "artifact",
                    fromSec: a,
                    toSec: b,
                    text: "cut",
                  });
                  setDrag(null);
                }}
              >
                Cut selection as artifact
              </ContextMenu.Item>
              <ContextMenu.Item
                style={{ padding: "6px 10px", cursor: "pointer" }}
                onSelect={() => {
                  const art = markers.filter((m) => m.kind === "artifact");
                  const last = art[art.length - 1];
                  if (last) removeMarker(last.id);
                }}
              >
                Restore last artifact
              </ContextMenu.Item>
            </ContextMenu.Content>
          </ContextMenu.Portal>
        </ContextMenu.Root>
      </div>
      {hasVideo ?
        <div
          style={{
            position: "fixed",
            right: 16,
            bottom: 16,
            width: 280,
            height: 160,
            background: "#000",
            color: "#fff",
            fontSize: 11,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 40,
            borderRadius: 8,
          }}
        >
          Video sync — connect timeline (placeholder)
        </div>
      : null}
    </div>
  );
}
