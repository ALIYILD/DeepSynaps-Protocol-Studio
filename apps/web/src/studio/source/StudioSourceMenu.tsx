import type { CSSProperties } from "react";
import { useState } from "react";

import { ErpDialog } from "../erp/ErpDialog";
import type { ErpComputeParams } from "../erp/types";
import { DEFAULT_ERP_PARAMS } from "../erp/types";
import { useAiStore } from "../stores/ai";
import { DipoleWindow } from "./DipoleWindow";
import { LoretaWindow } from "./LoretaWindow";
import { postDipoleFit, postLoretaErp, postLoretaSpectra } from "./sourceApi";
import type { DipoleResponse, LoretaErpResponse, LoretaSpectraResponse } from "./types";

type Intent = "loretaErp" | "loretaSpectra" | "dipole";

export function StudioSourceMenu({
  analysisId,
  channelNames,
  trials,
  fromSec,
  toSec,
  availableClasses,
}: {
  analysisId: string;
  channelNames: string[];
  trials: { stimulusClass?: string }[];
  fromSec: number;
  toSec: number;
  availableClasses: string[];
}) {
  const [dlgOpen, setDlgOpen] = useState(false);
  const [intent, setIntent] = useState<Intent>("loretaErp");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [loretaErp, setLoretaErp] = useState<LoretaErpResponse | null>(null);
  const [loretaSpec, setLoretaSpec] = useState<LoretaSpectraResponse | null>(null);
  const [dipole, setDipole] = useState<DipoleResponse | null>(null);
  const [winLoreta, setWinLoreta] = useState(false);
  const [loretaKind, setLoretaKind] = useState<"erp" | "spectra">("erp");
  const [winDip, setWinDip] = useState(false);

  const sourceHook = useAiStore((s) => s.sourceLocalizationChanged);
  void channelNames;

  const open = (which: Intent) => {
    setIntent(which);
    setDlgOpen(true);
    setErr(null);
  };

  const onConfirm = async (p: ErpComputeParams) => {
    setBusy(true);
    setErr(null);
    try {
      if (intent === "loretaErp") {
        setLoretaSpec(null);
        const res = await postLoretaErp(analysisId, p, 300, "sLORETA");
        setLoretaErp(res);
        setLoretaKind("erp");
        setWinLoreta(true);
        if (res.ok && res.roiTable?.length) {
          sourceHook({
            analysisId,
            kind: "loreta_erp",
            summary: { roiTop: res.roiTable.slice(0, 5), peak: res.peak },
          });
        }
      } else if (intent === "loretaSpectra") {
        setLoretaErp(null);
        const res = await postLoretaSpectra(analysisId, p, fromSec, toSec, [8, 13]);
        setLoretaSpec(res);
        setLoretaKind("spectra");
        setWinLoreta(true);
        if (res.ok && res.roiTable?.length) {
          sourceHook({
            analysisId,
            kind: "loreta_spectra",
            summary: { roiTop: res.roiTable.slice(0, 5), bandHz: res.bandHz },
          });
        }
      } else {
        const res = await postDipoleFit(analysisId, p, 4);
        setDipole(res);
        setWinDip(true);
        sourceHook({
          analysisId,
          kind: "dipole",
          summary: {
            nSamples: res.timesSec?.length,
            meanGof: res.goodnessOfFit?.length ?
              res.goodnessOfFit.reduce((a, b) => a + b, 0) / res.goodnessOfFit.length
            : null,
          },
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "source analysis failed");
    } finally {
      setBusy(false);
    }
  };

  const classes =
    availableClasses.length ?
      availableClasses
    : [...new Set(trials.map((t) => t.stimulusClass).filter(Boolean))] as string[];

  return (
    <>
      <div
        style={{
          marginTop: 4,
          paddingLeft: 8,
          borderLeft: "1px solid var(--ds-line, #ddd)",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        <div style={{ fontSize: 10, opacity: 0.7, textTransform: "uppercase" }}>Source localization</div>
        <button type="button" style={btn} disabled={busy} onClick={() => open("loretaErp")}>
          Source distribution (LORETA)…
        </button>
        <button type="button" style={btn} disabled={busy} onClick={() => open("loretaSpectra")}>
          Spectra power distribution (LORETA)…
        </button>
        <button type="button" style={btn} disabled={busy} onClick={() => open("dipole")}>
          Dipole source (BrainLock)…
        </button>
        {busy ?
          <span style={{ fontSize: 10, opacity: 0.7 }}>Computing…</span>
        : null}
        {err ?
          <span style={{ fontSize: 10, color: "#b91c1c" }}>{err}</span>
        : null}
      </div>

      <ErpDialog
        open={dlgOpen}
        onOpenChange={setDlgOpen}
        analysisId={analysisId}
        availableClasses={classes.length ? classes : DEFAULT_ERP_PARAMS.stimulusClasses}
        onConfirm={(p) => void onConfirm(p)}
      />

      {loretaKind === "erp" && loretaErp ?
        <LoretaWindow
          open={winLoreta}
          onOpenChange={setWinLoreta}
          analysisId={analysisId}
          kind="erp"
          data={loretaErp}
        />
      : null}
      {loretaKind === "spectra" && loretaSpec ?
        <LoretaWindow
          open={winLoreta}
          onOpenChange={setWinLoreta}
          analysisId={analysisId}
          kind="spectra"
          data={loretaSpec}
        />
      : null}

      {dipole ?
        <DipoleWindow open={winDip} onOpenChange={setWinDip} data={dipole} />
      : null}
    </>
  );
}

const btn: CSSProperties = {
  fontSize: 11,
  textAlign: "left",
  padding: "2px 6px",
  cursor: "pointer",
  background: "transparent",
  border: "none",
  color: "inherit",
};
