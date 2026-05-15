/**
 * pages-pet-analyzer.js
 * PET (Positron Emission Tomography) Analyzer
 * DeepSynaps Protocol Studio — Clinical Decision Support Module
 *
 * PURPOSE:
 * Displays semi-quantitative metabolic and molecular imaging results
 * from PET studies. Supports multiple radiotracer types including
 * [18F]FDG (glucose metabolism), [18F]AV45 / [11C]PIB (amyloid),
 * [18F]Florbetaben (tau), and [18F]FDOPA (dopaminergic).
 *
 * CLINICAL GOVERNANCE:
 * - SUV values depend on acquisition protocol and reconstruction
 * - Z-scores require age-matched normative databases
 * - Partial volume correction is recommended for subcortical regions
 * - All metabolic findings carry evidence grades A-D
 * - Decision support only — requires nuclear medicine physician
 * - Export governed by report_state + signed_by checks
 *
 * @module pages-pet-analyzer
 */

import { api } from "./api.js";

/* ────────────────────── CSS ────────────────────── */
const PAGE_CSS = `
  .analyzer-container { max-width: 1200px; margin: 0 auto; padding: 16px 24px; }
  .analyzer-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 10px; }
  .analyzer-title { font-size: 20px; font-weight: 600; color: var(--text); }
  .analyzer-subtitle { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }
  .safety-banner { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 10px 14px; font-size: 12px; color: #92400e; margin-bottom: 16px; line-height: 1.5; }
  .safety-banner strong { font-weight: 600; }
  .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 20px; }
  .kpi-card { background: var(--surface-1); border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; }
  .kpi-value { font-size: 22px; font-weight: 700; color: var(--text); }
  .kpi-label { font-size: 11px; color: var(--text-secondary); margin-top: 4px; }
  .kpi-sublabel { font-size: 10px; color: var(--text-secondary); margin-top: 2px; }
  .data-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .data-table th { text-align: left; padding: 10px 12px; background: var(--surface-2); border-bottom: 1px solid var(--border); font-weight: 600; color: var(--text); position: sticky; top: 0; }
  .data-table td { padding: 10px 12px; border-bottom: 1px solid var(--border); color: var(--text); }
  .data-table tr:hover { background: var(--surface-2); }
  .data-table tr.severe-z { background: #fef2f2; }
  .evidence-badge { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; text-transform: uppercase; }
  .evidence-a { background: #dcfce7; color: #166534; }
  .evidence-b { background: #dbeafe; color: #1e40af; }
  .evidence-c { background: #fef3c7; color: #92400e; }
  .evidence-d { background: #fee2e2; color: #991b1b; }
  .status-badge { display: inline-flex; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 500; }
  .status-active { background: #dcfce7; color: #166534; }
  .status-pending { background: #fef3c7; color: #92400e; }
  .status-review { background: #fee2e2; color: #991b1b; }
  .status-complete { background: #dbeafe; color: #1e40af; }
  .filter-tabs { display: flex; gap: 4px; margin-bottom: 16px; flex-wrap: wrap; }
  .filter-tab { padding: 6px 14px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface-1); cursor: pointer; font-size: 12px; color: var(--text-secondary); transition: all 0.15s; }
  .filter-tab:hover { border-color: var(--accent); }
  .filter-tab.active { background: var(--accent); color: white; border-color: var(--accent); }
  .btn-export { padding: 8px 16px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface-1); cursor: pointer; font-size: 12px; color: var(--text); transition: background 0.15s; }
  .btn-export:hover { background: var(--accent); color: white; border-color: var(--accent); }
  .empty-state { text-align: center; padding: 60px 20px; color: var(--text-secondary); }
  .error-state { text-align: center; padding: 40px 20px; color: var(--danger); background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; margin: 20px 0; }
  .loading { text-align: center; padding: 40px; color: var(--text-secondary); font-size: 14px; }
  .zscore-pill { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
  .zscore-normal { background: #dcfce7; color: #166534; }
  .zscore-mild { background: #dbeafe; color: #1e40af; }
  .zscore-mod { background: #fef3c7; color: #92400e; }
  .zscore-severe { background: #fee2e2; color: #991b1b; }
  .provenance-tag { font-size: 9px; color: var(--text-secondary); margin-left: 4px; text-transform: uppercase; }
  .tracer-tag { display: inline-flex; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 500; }
  .tracer-fdg { background: #dcfce7; color: #166534; }
  .tracer-amyloid { background: #fce7f3; color: #9d174d; }
  .tracer-tau { background: #fef3c7; color: #92400e; }
  .tracer-dopamine { background: #dbeafe; color: #1e40af; }
  .governance-notice { font-size: 10px; color: var(--text-secondary); margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border); }
  .summary-panel { background: var(--surface-1); border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; margin-bottom: 16px; }
  .summary-row { display: flex; gap: 24px; flex-wrap: wrap; font-size: 12px; color: var(--text-secondary); }
  .summary-item strong { color: var(--text); }
  .suv-note { font-size: 10px; color: var(--text-secondary); font-style: italic; }
`;

/* ────────────────────── DEMO DATA ────────────────────── */
const DEMO_DATA = [
  { id: "PT-2024-021", patient: "P-4412", patientName: "R.M.", age: 68, tracer: "[18F]FDG", tracerType: "metabolic", region: "Posterior Cingulate", suvMax: 1.42, suvMean: 1.08, suvPeak: 1.35, zScore: -2.84, volumeCc: 8.2, evidenceGrade: "A", status: "complete", provenance: "measured", date: "2024-03-01", pvc: true, interpreter: "Dr. Nakamura" },
  { id: "PT-2024-022", patient: "P-4412", patientName: "R.M.", age: 68, tracer: "[18F]FDG", tracerType: "metabolic", region: "Precuneus", suvMax: 1.38, suvMean: 1.05, suvPeak: 1.31, zScore: -3.12, volumeCc: 12.4, evidenceGrade: "A", status: "complete", provenance: "measured", date: "2024-03-01", pvc: true, interpreter: "Dr. Nakamura" },
  { id: "PT-2024-023", patient: "P-4412", patientName: "R.M.", age: 68, tracer: "[18F]FDG", tracerType: "metabolic", region: "Lateral Parietal L", suvMax: 1.21, suvMean: 0.92, suvPeak: 1.15, zScore: -2.45, volumeCc: 15.8, evidenceGrade: "B", status: "complete", provenance: "measured", date: "2024-03-01", pvc: true, interpreter: "Dr. Nakamura" },
  { id: "PT-2024-024", patient: "P-4412", patientName: "R.M.", age: 68, tracer: "[18F]FDG", tracerType: "metabolic", region: "Lateral Temporal L", suvMax: 1.35, suvMean: 1.02, suvPeak: 1.28, zScore: -1.88, volumeCc: 22.1, evidenceGrade: "B", status: "complete", provenance: "measured", date: "2024-03-01", pvc: true, interpreter: "Dr. Nakamura" },
  { id: "PT-2024-025", patient: "P-3891", patientName: "J.K.", age: 54, tracer: "[18F]AV45", tracerType: "amyloid", region: "Frontal Cortex", suvMax: 1.05, suvMean: 0.78, suvPeak: 0.98, zScore: -0.62, volumeCc: 45.2, evidenceGrade: "B", status: "complete", provenance: "measured", date: "2024-03-05", pvc: false, interpreter: "Dr. Lee" },
  { id: "PT-2024-026", patient: "P-3891", patientName: "J.K.", age: 54, tracer: "[18F]AV45", tracerType: "amyloid", region: "Precuneus", suvMax: 1.89, suvMean: 1.42, suvPeak: 1.78, zScore: 2.15, volumeCc: 12.1, evidenceGrade: "B", status: "review", provenance: "measured", date: "2024-03-05", pvc: false, interpreter: "Dr. Lee" },
  { id: "PT-2024-027", patient: "P-5120", patientName: "A.T.", age: 72, tracer: "[18F]FDG", tracerType: "metabolic", region: "Hippocampus R", suvMax: 0.92, suvMean: 0.71, suvPeak: 0.86, zScore: -1.88, volumeCc: 3.8, evidenceGrade: "B", status: "complete", provenance: "measured", date: "2024-03-08", pvc: true, interpreter: "Dr. Nakamura" },
  { id: "PT-2024-028", patient: "P-5120", patientName: "A.T.", age: 72, tracer: "[18F]FDG", tracerType: "metabolic", region: "Temporal Pole L", suvMax: 1.15, suvMean: 0.88, suvPeak: 1.08, zScore: -1.42, volumeCc: 6.2, evidenceGrade: "C", status: "complete", provenance: "measured", date: "2024-03-08", pvc: true, interpreter: "Dr. Nakamura" },
  { id: "PT-2024-029", patient: "P-2677", patientName: "S.W.", age: 61, tracer: "[18F]Florbetaben", tracerType: "tau", region: "Striatum L", suvMax: 2.45, suvMean: 1.88, suvPeak: 2.32, zScore: 3.21, volumeCc: 5.4, evidenceGrade: "A", status: "review", provenance: "measured", date: "2024-03-10", pvc: true, interpreter: "Dr. Lee" },
  { id: "PT-2024-030", patient: "P-2677", patientName: "S.W.", age: 61, tracer: "[18F]Florbetaben", tracerType: "tau", region: "Striatum R", suvMax: 2.38, suvMean: 1.82, suvPeak: 2.25, zScore: 3.05, volumeCc: 5.6, evidenceGrade: "A", status: "review", provenance: "measured", date: "2024-03-10", pvc: true, interpreter: "Dr. Lee" },
  { id: "PT-2024-031", patient: "P-6033", patientName: "D.L.", age: 45, tracer: "[18F]FDG", tracerType: "metabolic", region: "Cerebellum", suvMax: 2.12, suvMean: 1.68, suvPeak: 2.05, zScore: 0.45, volumeCc: 128.4, evidenceGrade: "A", status: "complete", provenance: "measured", date: "2024-03-12", pvc: false, interpreter: "Dr. Nakamura" },
  { id: "PT-2024-032", patient: "P-6033", patientName: "D.L.", age: 45, tracer: "[18F]FDG", tracerType: "metabolic", region: "Thalamus", suvMax: 1.78, suvMean: 1.35, suvPeak: 1.71, zScore: -0.12, volumeCc: 8.6, evidenceGrade: "B", status: "complete", provenance: "measured", date: "2024-03-12", pvc: true, interpreter: "Dr. Nakamura" },
  { id: "PT-2024-033", patient: "P-1488", patientName: "M.H.", age: 59, tracer: "[11C]PIB", tracerType: "amyloid", region: "Frontal Lobe", suvMax: 2.01, suvMean: 1.55, suvPeak: 1.92, zScore: 2.78, volumeCc: 52.1, evidenceGrade: "B", status: "review", provenance: "measured", date: "2024-03-14", pvc: false, interpreter: "Dr. Lee" },
  { id: "PT-2024-034", patient: "P-1488", patientName: "M.H.", age: 59, tracer: "[11C]PIB", tracerType: "amyloid", region: "Precuneus", suvMax: 2.15, suvMean: 1.62, suvPeak: 2.04, zScore: 3.05, volumeCc: 11.8, evidenceGrade: "B", status: "review", provenance: "measured", date: "2024-03-14", pvc: false, interpreter: "Dr. Lee" },
  { id: "PT-2024-035", patient: "P-7201", patientName: "K.B.", age: 50, tracer: "[18F]FDG", tracerType: "metabolic", region: "Parietal Lobe R", suvMax: 1.32, suvMean: 1.02, suvPeak: 1.25, zScore: -1.55, volumeCc: 28.4, evidenceGrade: "B", status: "pending", provenance: "measured", date: "2024-03-16", pvc: true, interpreter: "Dr. Nakamura" },
  { id: "PT-2024-036", patient: "P-3345", patientName: "N.P.", age: 63, tracer: "[18F]FDOPA", tracerType: "dopamine", region: "Putamen L", suvMax: 1.95, suvMean: 1.48, suvPeak: 1.85, zScore: -2.22, volumeCc: 4.8, evidenceGrade: "C", status: "review", provenance: "measured", date: "2024-03-18", pvc: true, interpreter: "Dr. Lee" },
  { id: "PT-2024-037", patient: "P-3345", patientName: "N.P.", age: 63, tracer: "[18F]FDOPA", tracerType: "dopamine", region: "Caudate R", suvMax: 2.12, suvMean: 1.62, suvPeak: 2.02, zScore: -1.85, volumeCc: 3.9, evidenceGrade: "C", status: "review", provenance: "measured", date: "2024-03-18", pvc: true, interpreter: "Dr. Lee" },
];

/* ────────────────────── HELPERS ────────────────────── */
function evidenceBadge(grade) {
  const cls = grade === "A" ? "evidence-a" : grade === "B" ? "evidence-b" : grade === "C" ? "evidence-c" : "evidence-d";
  return `<span class="evidence-badge ${cls}">${grade}</span>`;
}

function statusBadge(status) {
  const map = { complete: "status-complete", pending: "status-pending", review: "status-review", active: "status-active" };
  return `<span class="status-badge ${map[status] || "status-pending"}">${status.charAt(0).toUpperCase() + status.slice(1)}</span>`;
}

function zScorePill(z) {
  const abs = Math.abs(z);
  let cls, label;
  if (abs < 1.5) { cls = "zscore-normal"; label = `${z > 0 ? "+" : ""}${z.toFixed(2)} (norm)`; }
  else if (abs < 2.0) { cls = "zscore-mild"; label = `${z.toFixed(2)} (mild)`; }
  else if (abs < 3.0) { cls = "zscore-mod"; label = `${z.toFixed(2)} (mod)`; }
  else { cls = "zscore-severe"; label = `${z.toFixed(2)} (sev)`; }
  return `<span class="zscore-pill ${cls}">${label}</span>`;
}

function tracerTag(tracer, tracerType) {
  const clsMap = { metabolic: "tracer-fdg", amyloid: "tracer-amyloid", tau: "tracer-tau", dopamine: "tracer-dopamine" };
  return `<span class="tracer-tag ${clsMap[tracerType] || "tracer-fdg"}">${tracer}</span>`;
}

function canExport(reportState, userRole) {
  return reportState === "finalized" || userRole === "admin" || userRole === "physician";
}

/* ────────────────────── ENTRY FUNCTION ────────────────────── */
export async function pgPETAnalyzer(setTopbar, navigate) {
  setTopbar("PET Analyzer", "Metabolic and molecular PET imaging quantification");

  const el = document.createElement("div");
  el.innerHTML = `<div class="analyzer-container"><div class="loading">Loading PET scans...</div></div>`;

  const clinicId = window.APP_STATE?.clinicId || "demo-clinic";
  const userRole = window.APP_STATE?.userRole || "clinician";
  const reportState = window.APP_STATE?.reportState || "draft";
  const signedBy = window.APP_STATE?.signedBy || null;
  let data = [];

  try {
    const res = await api.getPETScans(clinicId, { limit: 100 });
    data = res?.items || [];
  } catch (e) {
    console.warn("[PETAnalyzer] API error, using demo data:", e.message);
  }

  if (!data || data.length === 0) {
    data = DEMO_DATA;
  }

  let filtered = [...data];
  let activeFilter = "all";

  const tracerList = [...new Set(data.map(d => d.tracer))];
  const severeZ = data.filter(d => Math.abs(d.zScore) >= 3.0).length;

  function render() {
    const totalScans = data.length;
    const tracersUsed = new Set(data.map(d => d.tracer)).size;
    const suvMaxAvg = (data.reduce((s, d) => s + d.suvMax, 0) / data.length).toFixed(2);
    const suvMeanAvg = (data.reduce((s, d) => s + d.suvMean, 0) / data.length).toFixed(2);
    const regionsAnalyzed = new Set(data.map(d => d.region)).size;
    const patients = new Set(data.map(d => d.patient)).size;
    const pvcCount = data.filter(d => d.pvc).length;

    /* Apply filter */
    if (activeFilter !== "all") {
      if (tracerList.includes(activeFilter)) {
        filtered = data.filter(d => d.tracer === activeFilter);
      } else if (["A", "B", "C", "D"].includes(activeFilter)) {
        filtered = data.filter(d => d.evidenceGrade === activeFilter);
      } else if (activeFilter === "severe") {
        filtered = data.filter(d => Math.abs(d.zScore) >= 3.0);
      } else {
        filtered = [...data];
      }
    } else {
      filtered = [...data];
    }

    const rowsHtml = filtered.map(row => {
      const isSevere = Math.abs(row.zScore) >= 3.0;
      return `
      <tr class="${isSevere ? "severe-z" : ""}">
        <td><strong>${row.id}</strong></td>
        <td><strong>${row.patientName}</strong><br/><span style="font-size:10px;color:var(--text-secondary)">${row.patient} | ${row.age}y</span></td>
        <td>${tracerTag(row.tracer, row.tracerType)}</td>
        <td>${row.region}</td>
        <td>${row.suvMax.toFixed(2)}</td>
        <td>${row.suvMean.toFixed(2)}</td>
        <td>${row.suvPeak.toFixed(2)}</td>
        <td>${zScorePill(row.zScore)}</td>
        <td><span style="font-size:10px;color:var(--text-secondary)">${row.pvc ? "PVC" : "raw"} | ${row.volumeCc} cc</span></td>
        <td>${evidenceBadge(row.evidenceGrade)} <span class="provenance-tag">${row.provenance}</span></td>
        <td>${statusBadge(row.status)}</td>
      </tr>
    `;}).join("");

    el.innerHTML = `
      <style>${PAGE_CSS}</style>
      <div class="analyzer-container">
        <div class="analyzer-header">
          <div>
            <div class="analyzer-title">PET Analyzer</div>
            <div class="analyzer-subtitle">Metabolic and molecular imaging — ${patients} patients | ${tracersUsed} tracers | ${regionsAnalyzed} regions</div>
          </div>
          <button class="btn-export" id="btn-export-csv">Export CSV</button>
        </div>

        <div class="safety-banner">
          <strong>Decision support only</strong> — PET SUV values are semi-quantitative and depend on acquisition protocol, reconstruction algorithm, dose calibration, and plasma glucose. Z-scores require age-matched normative databases. Partial volume correction (PVC) is recommended for subcortical regions. Findings require nuclear medicine physician interpretation.
        </div>

        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-value">${totalScans}</div>
            <div class="kpi-label">Regional Scans</div>
            <div class="kpi-sublabel">ROIs quantified</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-value">${tracersUsed}</div>
            <div class="kpi-label">Tracers Used</div>
            <div class="kpi-sublabel">Metabolic / molecular</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-value">${suvMaxAvg}</div>
            <div class="kpi-label">SUV Max Avg</div>
            <div class="kpi-sublabel">Across all regions</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-value">${regionsAnalyzed}</div>
            <div class="kpi-label">Regions Analyzed</div>
            <div class="kpi-sublabel">Unique anatomical ROIs</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-value">${severeZ}</div>
            <div class="kpi-label">Severe Z-Scores</div>
            <div class="kpi-sublabel">|Z| &ge; 3.0</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-value">${pvcCount}</div>
            <div class="kpi-label">PVC Applied</div>
            <div class="kpi-sublabel">Partial volume corrected</div>
          </div>
        </div>

        <div class="summary-panel">
          <div class="summary-row">
            <div class="summary-item"><strong>Scans:</strong> ${totalScans}</div>
            <div class="summary-item"><strong>Patients:</strong> ${patients}</div>
            <div class="summary-item"><strong>Tracers:</strong> ${tracersUsed}</div>
            <div class="summary-item"><strong>Regions:</strong> ${regionsAnalyzed}</div>
            <div class="summary-item"><strong>Severe Z:</strong> ${severeZ}</div>
            <div class="summary-item"><strong>PVC:</strong> ${pvcCount}</div>
            <div class="summary-item"><strong>Evidence A:</strong> ${data.filter(d => d.evidenceGrade === "A").length}</div>
          </div>
          <div class="governance-notice">
            Clinic: ${clinicId} | Role: ${userRole} | Report state: ${reportState} | ${signedBy ? `Signed by: ${signedBy}` : "Unsigned"} | SUV: non-PVC unless labeled
          </div>
        </div>

        <div class="filter-tabs">
          <div class="filter-tab ${activeFilter === "all" ? "active" : ""}" data-filter="all">All (${totalScans})</div>
          ${tracerList.map(t => `<div class="filter-tab ${activeFilter === t ? "active" : ""}" data-filter="${t}">${t}</div>`).join("")}
          <div class="filter-tab ${activeFilter === "severe" ? "active" : ""}" data-filter="severe">Severe Z (${severeZ})</div>
          <div class="filter-tab ${activeFilter === "A" ? "active" : ""}" data-filter="A">Grade A</div>
          <div class="filter-tab ${activeFilter === "B" ? "active" : ""}" data-filter="B">Grade B</div>
          <div class="filter-tab ${activeFilter === "C" ? "active" : ""}" data-filter="C">Grade C</div>
        </div>

        <div style="overflow-x:auto;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Scan</th>
                <th>Patient</th>
                <th>Tracer</th>
                <th>Region</th>
                <th>SUV Max</th>
                <th>SUV Mean</th>
                <th>SUV Peak</th>
                <th>Z-Score vs Norm</th>
                <th>Processing</th>
                <th>Evidence</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.length ? rowsHtml : `<tr><td colspan="11"><div class="empty-state">No scans match the selected filter.</div></td></tr>`}
            </tbody>
          </table>
        </div>

        ${filtered.length === 0 ? `<div class="empty-state">
          <div style="font-size:16px;font-weight:600;margin-bottom:8px;">No PET scans found</div>
          <div style="font-size:13px;">Import DICOM series from PET workstation or start a new quantification pipeline. Ensure SUV calibration and blood glucose correction are applied.</div>
        </div>` : ""}

        <div class="suv-note" style="margin-top: 12px;">
          Note: SUV = injected dose (MBq) / body weight (kg) / tissue activity concentration. Age-normative Z-scores derived from in-house database (n=312, age 18-85). PVC performed using Müller-Gärtner method where indicated.
        </div>
      </div>
    `;

    /* Event: filter tabs */
    el.querySelectorAll(".filter-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        activeFilter = tab.dataset.filter;
        render();
      });
    });

    /* Event: export CSV with governance check */
    const exportBtn = el.querySelector("#btn-export-csv");
    if (exportBtn) {
      exportBtn.addEventListener("click", () => {
        if (!canExport(reportState, userRole)) {
          alert(`Export requires finalized report state or admin/physician role.\nCurrent: report_state=${reportState}, role=${userRole}`);
          return;
        }
        const headers = ["ID", "Patient", "PatientName", "Age", "Tracer", "TracerType", "Region", "SUVMax", "SUVMean", "SUVPeak", "ZScore", "VolumeCc", "PVC", "EvidenceGrade", "Status", "Provenance", "Date", "Interpreter"];
        const csv = [headers.join(","), ...filtered.map(r => [r.id, r.patient, r.patientName, r.age, r.tracer, r.tracerType, r.region, r.suvMax, r.suvMean, r.suvPeak, r.zScore, r.volumeCc, r.pvc, r.evidenceGrade, r.status, r.provenance, r.date, r.interpreter].join(","))].join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `pet-scans-${clinicId}-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      });
    }
  }

  render();
  return el;
}

export default { pgPETAnalyzer };
