type Biomarkers = {
  f0_mean_hz: number;
  f0_std_hz: number;
  jitter_local: number;
  shimmer_local: number;
  hnr_db: number;
  mfcc_means: number[];
};

type BiomarkerPanelProps = {
  biomarkers?: Biomarkers;
};

export function BiomarkerPanel({ biomarkers }: BiomarkerPanelProps) {
  // TODO: KPI grid (F0, jitter, shimmer, HNR) + collapsible MFCC chart.
  return (
    <section className="rounded border p-4">
      <h2 className="text-lg font-medium">Acoustic biomarkers</h2>
      <p>{biomarkers ? `F0 ${biomarkers.f0_mean_hz} Hz` : "Awaiting analysis…"}</p>
    </section>
  );
}
