/** Digitization / MRI co-registration placeholder (M10.1 patient MRI path). */

export function Coregistration({ analysisId }: { analysisId: string }) {
  return (
    <div style={{ fontSize: 11, padding: 8, background: "#f1f5f9", borderRadius: 8 }}>
      <strong>Co-registration</strong> · analysis <code style={{ fontSize: 10 }}>{analysisId}</code>
      <p style={{ margin: "6px 0 0", opacity: 0.85 }}>
        Standard 10–20 alignment is applied server-side when digitization is absent. Upload MRI + fiducials for
        patient-specific BEM in a future release.
      </p>
    </div>
  );
}
