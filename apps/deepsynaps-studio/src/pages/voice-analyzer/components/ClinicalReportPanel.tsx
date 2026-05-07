type ClinicalReport = {
  summary_md: string;
  structured: Record<string, unknown>;
};

type ClinicalReportPanelProps = {
  report?: ClinicalReport;
};

export function ClinicalReportPanel({ report }: ClinicalReportPanelProps) {
  // TODO: render summary_md via Markdown component; copy / export PDF action.
  return (
    <section className="rounded border p-4">
      <h2 className="text-lg font-medium">AI-generated summary (decision-support only)</h2>
      <p className="text-xs text-yellow-700">
        This text is for clinician review — not a diagnosis or treatment instruction.
      </p>
      <pre className="whitespace-pre-wrap">
        {report?.summary_md ?? "Awaiting analysis…"}
      </pre>
    </section>
  );
}
