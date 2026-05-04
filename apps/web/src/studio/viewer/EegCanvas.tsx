import { useEffect, useRef } from "react";
import createREGL from "regl";

export interface EegCanvasProps {
  width: number;
  height: number;
  sampleRateHz: number;
  fromSec: number;
  toSec: number;
  channelNames: string[];
  rows: Float32Array[];
  gainUvPerCm: (ch: string) => number;
  pxPerCm?: number;
}

/** Multi-channel EEG traces — WebGL `LINE_STRIP` per channel; Canvas2D fallback. */
export function EegCanvas({
  width,
  height,
  sampleRateHz,
  fromSec,
  toSec,
  channelNames,
  rows,
  gainUvPerCm,
  pxPerCm = 38,
}: EegCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reglRef = useRef<ReturnType<typeof createREGL> | null>(null);
  const drawLineRef = useRef<
    ((o: { positions: Float32Array; count: number }) => void) | null
  >(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width < 2 || height < 2) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const wPx = Math.floor(width * dpr);
    const hPx = Math.floor(height * dpr);
    canvas.width = wPx;
    canvas.height = hPx;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    reglRef.current?.destroy();
    reglRef.current = null;
    drawLineRef.current = null;

    try {
      const regl = createREGL({
        canvas,
        attributes: { antialias: true, preserveDrawingBuffer: true },
      });
      reglRef.current = regl;
      drawLineRef.current = regl({
        frag: `
            precision mediump float;
            void main() {
              gl_FragColor = vec4(0.11, 0.11, 0.13, 1.0);
            }`,
        vert: `
            precision mediump float;
            attribute vec2 position;
            void main() {
              gl_Position = vec4(position, 0.0, 1.0);
            }`,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        attributes: { position: (regl as any).prop("positions") },
        primitive: "line strip",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        count: (regl as any).prop("count"),
      });
    } catch {
      reglRef.current = null;
      drawLineRef.current = null;
    }

    const nCh = Math.min(channelNames.length, rows.length);
    if (nCh === 0) return;

    const span = toSec - fromSec || 1;
    const rowPx = height / nCh;

    const drawStrip2d = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#f7f7f8";
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = "#222228";
      ctx.lineWidth = 1;

      for (let k = 0; k < nCh; k++) {
        const row = rows[k];
        if (!row?.length) continue;
        const g = Math.max(0.5, gainUvPerCm(channelNames[k]!));
        const uvPerPx = g / pxPerCm;
        const yMid = k * rowPx + rowPx / 2;

        ctx.beginPath();
        for (let i = 0; i < row.length; i++) {
          const tSec = fromSec + i / sampleRateHz;
          const xFrac = (tSec - fromSec) / span;
          const x = xFrac * width;
          const uV = row[i] ?? 0;
          const y = yMid - (uV / uvPerPx);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    };

    const regl = reglRef.current;
    const drawLine = drawLineRef.current;
    if (!regl || !drawLine) {
      drawStrip2d();
      return;
    }

    regl.clear({ color: [0.97, 0.97, 0.97, 1], depth: 1 });

    for (let k = 0; k < nCh; k++) {
      const row = rows[k];
      if (!row?.length) continue;
      const g = Math.max(0.5, gainUvPerCm(channelNames[k]!));
      const uvPerPx = g / pxPerCm;
      const yMidPx = k * rowPx + rowPx / 2;

      const n = row.length;
      const pos = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        const tSec = fromSec + i / sampleRateHz;
        const xFrac = (tSec - fromSec) / span;
        const xPx = xFrac * width;
        const uV = row[i] ?? 0;
        const yPx = yMidPx - uV / uvPerPx;
        const xNdc = (xPx / width) * 2 - 1;
        const yNdc = 1 - (yPx / height) * 2;
        pos[i * 2] = xNdc;
        pos[i * 2 + 1] = yNdc;
      }
      drawLine({ positions: pos, count: n });
    }
  }, [
    width,
    height,
    sampleRateHz,
    fromSec,
    toSec,
    channelNames,
    rows,
    gainUvPerCm,
    pxPerCm,
  ]);

  useEffect(() => {
    return () => {
      reglRef.current?.destroy();
      reglRef.current = null;
      drawLineRef.current = null;
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        background: "#f7f7f8",
      }}
    />
  );
}
