import { useEffect, useState } from "react";

const API_BASE = import.meta.env?.VITE_API_BASE_URL ?? "";

function getToken(): string | null {
  try {
    return localStorage.getItem("ds_access_token");
  } catch {
    return null;
  }
}

export type BandrangePreset = {
  id: string;
  lowHz: number;
  highHz: number;
};

export function BandrangeDialog({
  open,
  onOpenChange,
  analysisId,
  preset,
  selectionChannels,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  analysisId: string;
  preset: BandrangePreset | null;
  selectionChannels: string[];
}) {
  const [lowHz, setLowHz] = useState(preset?.lowHz ?? 8);
  const [highHz, setHighHz] = useState(preset?.highHz ?? 13);
  const [transitionHz, setTransitionHz] = useState(0.5);
  const [windowType, setWindowType] = useState<"hamming" | "blackman" | "kaiser">(
    "hamming",
  );
  const [bandLabel, setBandLabel] = useState(preset?.id ?? "Alpha");
  const [outputName, setOutputName] = useState(
    () => `${preset?.id ?? "Band"}_fir`,
  );
  const [applyTo, setApplyTo] = useState<"all" | "eeg" | "selection">("eeg");
  const [derivative, setDerivative] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!preset) return;
    setLowHz(preset.lowHz);
    setHighHz(preset.highHz);
    setBandLabel(preset.id);
    setOutputName(`${preset.id}_fir`);
  }, [preset]);

  if (!open || !preset) return null;

  const submit = async () => {
    setBusy(true);
    try {
      const tok = getToken();
      const prefix = API_BASE || "";
      const url = `${prefix}/api/v1/studio/eeg/${encodeURIComponent(analysisId)}/bandrange`;
      const body = {
        lowHz,
        highHz,
        transitionHz,
        window: windowType,
        bandLabel,
        outputName,
        applyTo,
        selectionChannels:
          applyTo === "selection" ? selectionChannels : null,
        visualizeOnly: !derivative,
      };
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
        },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        openUrl?: string;
        derivativeAnalysisId?: string | null;
        message?: string;
      };
      if (!res.ok) {
        window.alert(`Bandrange failed: ${res.status}`);
        return;
      }
      if (derivative && json.openUrl) {
        const abs = new URL(json.openUrl, window.location.origin).href;
        window.open(abs, "_blank", "noopener,noreferrer");
      } else if (json.message) {
        window.alert(json.message);
      }
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        zIndex: 90,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onMouseDown={() => !busy && onOpenChange(false)}
    >
      <div
        style={{
          background: "var(--ds-surface, #fff)",
          border: "1px solid var(--ds-line, #ccc)",
          borderRadius: 8,
          padding: 16,
          width: "min(440px, 94vw)",
          fontSize: 12,
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ fontWeight: 600, marginBottom: 10 }}>
          Bandrange filter — {preset.id}
        </div>
        <label style={{ display: "block", marginBottom: 6 }}>
          Pass band low (Hz)
          <input
            type="number"
            step={0.1}
            value={lowHz}
            onChange={(e) => setLowHz(Number(e.target.value))}
            style={{ width: "100%", marginTop: 4 }}
          />
        </label>
        <label style={{ display: "block", marginBottom: 6 }}>
          Pass band high (Hz)
          <input
            type="number"
            step={0.1}
            value={highHz}
            onChange={(e) => setHighHz(Number(e.target.value))}
            style={{ width: "100%", marginTop: 4 }}
          />
        </label>
        <label style={{ display: "block", marginBottom: 6 }}>
          Transition width (Hz)
          <input
            type="number"
            step={0.05}
            value={transitionHz}
            onChange={(e) => setTransitionHz(Number(e.target.value))}
            style={{ width: "100%", marginTop: 4 }}
          />
        </label>
        <label style={{ display: "block", marginBottom: 6 }}>
          Window type
          <select
            value={windowType}
            onChange={(e) =>
              setWindowType(e.target.value as typeof windowType)
            }
            style={{ width: "100%", marginTop: 4 }}
          >
            <option value="hamming">Hamming</option>
            <option value="blackman">Blackman</option>
            <option value="kaiser">Kaiser</option>
          </select>
        </label>
        <label style={{ display: "block", marginBottom: 6 }}>
          Band tag / label
          <input
            value={bandLabel}
            onChange={(e) => setBandLabel(e.target.value)}
            style={{ width: "100%", marginTop: 4 }}
          />
        </label>
        <label style={{ display: "block", marginBottom: 6 }}>
          Output filename stem
          <input
            value={outputName}
            onChange={(e) => setOutputName(e.target.value)}
            style={{ width: "100%", marginTop: 4 }}
          />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <input
            type="checkbox"
            checked={derivative}
            onChange={(e) => setDerivative(e.target.checked)}
          />
          Create new derivative recording (off = visualize-only stub)
        </label>
        <label style={{ display: "block", marginBottom: 6 }}>
          Apply to
          <select
            value={applyTo}
            onChange={(e) =>
              setApplyTo(e.target.value as typeof applyTo)
            }
            style={{ width: "100%", marginTop: 4 }}
          >
            <option value="all">All channels</option>
            <option value="eeg">EEG only</option>
            <option value="selection">Selection</option>
          </select>
        </label>
        {applyTo === "selection" ?
          <div style={{ opacity: 0.75, marginBottom: 8, fontSize: 11 }}>
            Selection uses highlighted trace name when available; otherwise all
            viewer channels ({selectionChannels.join(", ") || "—"}).
          </div>
        : null}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button type="button" disabled={busy} onClick={() => void submit()}>
            {busy ? "Working…" : "Apply"}
          </button>
        </div>
      </div>
    </div>
  );
}
