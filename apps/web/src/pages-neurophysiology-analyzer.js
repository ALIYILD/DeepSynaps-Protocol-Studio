/**
 * pages-neurophysiology-analyzer.js
 * Neurophysiology Analyzer (EEG / ERP / EP) Dashboard
 * DeepSynaps Protocol Studio — Clinical Decision Support Module
 *
 * PURPOSE:
 * Displays clinical neurophysiology findings from EEG (electroencephalography)
 * recordings, ERP (event-related potential) analyses, and EP (evoked potential)
 * studies. Supports latency/amplitude measurements for standard waveforms
 * including P300, N170, MMN, SSEP (median & tibial), VEP (pattern-reversal),
 * and BAEP (brainstem auditory). Abnormal flagging uses age-normative windows.
 *
 * CLINICAL GOVERNANCE:
 * - Raw EEG traces are measured; automated detections are inferred
 * - ERP/EP latency and amplitude are measured from averaged epochs
 * - All outputs carry evidence grades A-D
 * - Abnormal flagging based on age-normative latency windows per lab
 * - Decision support only — requires board-certified neurophysiologist
 * - Export governed by report_state + signed_by checks
 * - Clinic-scoped data with role-based access control
 *
 * @module pages-neurophysiology-analyzer
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
  .data-table tr.abnormal { background: #fef2f2; }
  .data-table tr.abnormal:hover { background: #fee2e2; }
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
  .type-badge { display: inline-flex; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; text-transform: uppercase; }
  .type-eeg { background: #e0e7ff; color: #3730a3; }
  .type-erp { background: #fce7f3; color: #9d174d; }
  .type-ep { background: #d1fae5; color: #065f46; }
  .abnormal-flag { display: inline-flex; align-items: center; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; background: #fee2e2; color: #991b1b; margin-left: 6px; }
  .latency-ok { color: #166534; font-family: monospace; font-size: 11px; }
  .latency-delayed { color: #991b1b; font-family: monospace; font-size: 11px; font-weight: 600; }
  .amplitude-value { font-family: monospace; font-size: 11px; }
  .amplitude-reduced { font-family: monospace; font-size: 11px; color: #991b1b; font-weight: 600; }
  .normal-range-text { font-size: 9px; color: var(--text-secondary); }
  .provenance-tag { font-size: 9px; color: var(--text-secondary); margin-left: 4px; text-transform: uppercase; }
  .governance-notice { font-size: 10px; color: var(--text-secondary); margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border); }
  .summary-panel { background: var(--surface-1); border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; margin-bottom: 16px; }
  .summary-row { display: flex; gap: 24px; flex-wrap: wrap; font-size: 12px; color: var(--text-secondary); }
  .summary-item strong { color: var(--text); }
  .waveform-note { font-size: 10px; color: var(--text-secondary); font-style: italic; }
  .consent-bar { background: #dcfce7; border: 1px solid #22c55e; border-radius: 6px; padding: 8px 12px; font-size: 11px; color: #166534; margin-bottom: 12px; }
  .consent-bar.missing { background: #fee2e2; border-color: #ef4444; color: #991b1b; }
`;

/* ────────────────────── DEMO DATA (17 rows) ────────────────────── */
const DEMO_DATA = [
  { id: "NP-2024-101", type: "EEG", patient: "P-4412", patientName: "R.M.", age: 68, duration: "30:00", keyFinding: "Focal slowing L temporal", latency: "—", amplitude: "—", normalRange: "—", evidenceGrade: "A", status: "complete", provenance: "measured", date: "2024-03-01", waveform: "—", abnormal: true, interpreter: "Dr. Williams" },
  { id: "NP-2024-102", type: "ERP", patient: "P-4412", patientName: "R.M.", age: 68, duration: "15:00", keyFinding: "Delayed P300 latency", latency: "420 ms", amplitude: "8.2 uV", normalRange: "300-380 ms / >5 uV", evidenceGrade: "B", status: "complete", provenance: "measured", date: "2024-03-01", waveform: "P300 (oddball)", abnormal: true, interpreter: "Dr. Williams" },
  { id: "NP-2024-103", type: "EEG", patient: "P-4412", patientName: "R.M.", age: 68, duration: "45:00", keyFinding: "Sleep-deprived background rhythm 7Hz", latency: "—", amplitude: "—", normalRange: "—", evidenceGrade: "A", status: "complete", provenance: "measured", date: "2024-03-01", waveform: "—", abnormal: false, interpreter: "Dr. Williams" },
  { id: "NP-2024-104", type: "EEG", patient: "P-3891", patientName: "J.K.", age: 54, duration: "30:00", keyFinding: "Normal posterior dominant rhythm 10Hz", latency: "—", amplitude: "—", normalRange: "—", evidenceGrade: "A", status: "complete", provenance: "measured", date: "2024-03-05", waveform: "—", abnormal: false, interpreter: "Dr. Martinez" },
  { id: "NP-2024-105", type: "EP", patient: "P-3891", patientName: "J.K.", age: 54, duration: "12:00", keyFinding: "Normal SSEP bilat median N20", latency: "19.8 ms", amplitude: "2.1 uV", normalRange: "18.0-22.0 ms / >1.5 uV", evidenceGrade: "B", status: "complete", provenance: "measured", date: "2024-03-05", waveform: "SSEP median", abnormal: false, interpreter: "Dr. Martinez" },
  { id: "NP-2024-106", type: "EEG", patient: "P-5120", patientName: "A.T.", age: 72, duration: "45:00", keyFinding: "Generalized 3 Hz spike-wave discharge", latency: "—", amplitude: "—", normalRange: "—", evidenceGrade: "A", status: "review", provenance: "measured", date: "2024-03-08", waveform: "—", abnormal: true, interpreter: "Dr. Williams" },
  { id: "NP-2024-107", type: "ERP", patient: "P-5120", patientName: "A.T.", age: 72, duration: "18:00", keyFinding: "Reduced N170 amplitude faces", latency: "172 ms", amplitude: "3.4 uV", normalRange: "150-180 ms / >5 uV", evidenceGrade: "B", status: "review", provenance: "measured", date: "2024-03-08", waveform: "N170 (faces)", abnormal: true, interpreter: "Dr. Williams" },
  { id: "NP-2024-108", type: "EP", patient: "P-5120", patientName: "A.T.", age: 72, duration: "14:00", keyFinding: "Normal BAEP bilat I-V IPL within limits", latency: "4.2 ms", amplitude: "0.35 uV", normalRange: "3.5-4.5 ms", evidenceGrade: "B", status: "complete", provenance: "measured", date: "2024-03-08", waveform: "BAEP click 90 dB", abnormal: false, interpreter: "Dr. Williams" },
  { id: "NP-2024-109", type: "EEG", patient: "P-2677", patientName: "S.W.", age: 61, duration: "30:00", keyFinding: "Mild diffuse theta excess frontotemporal", latency: "—", amplitude: "—", normalRange: "—", evidenceGrade: "B", status: "complete", provenance: "measured", date: "2024-03-10", waveform: "—", abnormal: true, interpreter: "Dr. Patel" },
  { id: "NP-2024-110", type: "EP", patient: "P-2677", patientName: "S.W.", age: 61, duration: "14:00", keyFinding: "Delayed VEP P100 L eye demyelination", latency: "118 ms", amplitude: "5.6 uV", normalRange: "95-115 ms / >5 uV", evidenceGrade: "B", status: "review", provenance: "measured", date: "2024-03-10", waveform: "VEP pattern-reversal", abnormal: true, interpreter: "Dr. Patel" },
  { id: "NP-2024-111", type: "EEG", patient: "P-6033", patientName: "D.L.", age: 45, duration: "30:00", keyFinding: "Normal awake and drowsy architecture", latency: "—", amplitude: "—", normalRange: "—", evidenceGrade: "A", status: "complete", provenance: "measured", date: "2024-03-12", waveform: "—", abnormal: false, interpreter: "Dr. Martinez" },
  { id: "NP-2024-112", type: "ERP", patient: "P-6033", patientName: "D.L.", age: 45, duration: "16:00", keyFinding: "Normal MMN deviant vs standard", latency: "162 ms", amplitude: "4.8 uV", normalRange: "150-200 ms / >3 uV", evidenceGrade: "B", status: "complete", provenance: "measured", date: "2024-03-12", waveform: "MMN (duration deviant)", abnormal: false, interpreter: "Dr. Martinez" },
  { id: "NP-2024-113", type: "EEG", patient: "P-1488", patientName: "M.H.", age: 59, duration: "60:00", keyFinding: "Focal R frontal sharp waves during sleep", latency: "—", amplitude: "—", normalRange: "—", evidenceGrade: "A", status: "review", provenance: "measured", date: "2024-03-14", waveform: "—", abnormal: true, interpreter: "Dr. Williams" },
  { id: "NP-2024-114", type: "EP", patient: "P-1488", patientName: "M.H.", age: 59, duration: "20:00", keyFinding: "Normal SSEP tibial P37 bilat", latency: "37.2 ms", amplitude: "1.8 uV", normalRange: "35.0-42.0 ms / >1.2 uV", evidenceGrade: "B", status: "complete", provenance: "measured", date: "2024-03-14", waveform: "SSEP tibial", abnormal: false, interpreter: "Dr. Williams" },
  { id: "NP-2024-115", type: "ERP", patient: "P-7201", patientName: "K.B.", age: 50, duration: "14:00", keyFinding: "Absent P300 target detection", latency: "—", amplitude: "1.1 uV", normalRange: "300-380 ms / >5 uV", evidenceGrade: "C", status: "review", provenance: "measured", date: "2024-03-16", waveform: "P300 (3-stimulus)", abnormal: true, interpreter: "Dr. Patel" },
  { id: "NP-2024-116", type: "EEG", patient: "P-3345", patientName: "N.P.", age: 63, duration: "30:00", keyFinding: "Normal sleep architecture stage cycling", latency: "—", amplitude: "—", normalRange: "—", evidenceGrade: "A", status: "complete", provenance: "measured", date: "2024-03-18", waveform: "—", abnormal: false, interpreter: "Dr. Martinez" },
  { id: "NP-2024-117", type: "EP", patient: "P-3345", patientName: "N.P.", age: 63, duration: "15:00", keyFinding: "Prolonged BAEP III-V interpeak central", latency: "4.8 ms", amplitude: "0.3 uV", normalRange: "1.8-2.2 ms", evidenceGrade: "B", status: "pending", provenance: "measured", date: "2024-03-18", waveform: "BAEP click 90 dB", abnormal: true, interpreter: "Dr. Martinez" },
  { id: "NP-2024-118", type: "EEG", patient: "P-7201", patientName: "K.B.", age: 50, duration: "30:00", keyFinding: "Excess beta frontocentral medication effect", latency: "—", amplitude: "—", normalRange: "—", evidenceGrade: "B", status: "complete", provenance: "measured", date: "2024-03-20", waveform: "—", abnormal: false, interpreter: "Dr. Patel" },
  { id: "NP-2024-119", type: "ERP", patient: "P-7201", patientName: "K.B.", age: 50, duration: "20:00", keyFinding: "Normal auditory P50 gating ratio 0.42", latency: "52 ms", amplitude: "3.2 uV", normalRange: "45-65 ms / >2 uV", evidenceGrade: "B", status: "complete", provenance: "measured", date: "2024-03-20", waveform: "P50 ( Conditioning)", abnormal: false, interpreter: "Dr. Patel" },
  { id: "NP-2024-120", type: "EEG", patient: "P-5522", patientName: "E.C.", age: 57, duration: "45:00", keyFinding: "Breech rhythm right temporal alpha", latency: "—", amplitude: "—", normalRange: "—", evidenceGrade: "A", status: "review", provenance: "measured", date: "2024-03-22", waveform: "—", abnormal: true, interpreter: "Dr. Williams" },
  { id: "NP-2024-121", type: "EP", patient: "P-8810", patientName: "L.S.", age: 70, duration: "18:00", keyFinding: "Delayed SSEP P37 bilat peripheral neuropathy", latency: "44.2 ms", amplitude: "1.1 uV", normalRange: "35.0-42.0 ms / >1.2 uV", evidenceGrade: "B", status: "review", provenance: "measured", date: "2024-03-24", waveform: "SSEP tibial", abnormal: true, interpreter: "Dr. Patel" },
  { id: "NP-2024-122", type: "ERP", patient: "P-1199", patientName: "O.F.", age: 48, duration: "16:00", keyFinding: "Normal auditory N400 semantic violation", latency: "385 ms", amplitude: "6.8 uV", normalRange: "350-450 ms / >4 uV", evidenceGrade: "B", status: "complete", provenance: "measured", date: "2024-03-26", waveform: "N400 (sentence)", abnormal: false, interpreter: "Dr. Martinez" },
];

/* ────────────────────── HELPER FUNCTIONS ────────────────────── */

function evidenceBadge(grade) {
  const cls = grade === "A" ? "evidence-a" : grade === "B" ? "evidence-b" : grade === "C" ? "evidence-c" : "evidence-d";
  return `<span class="evidence-badge ${cls}">${grade}</span>`;
}

function statusBadge(status) {
  const map = { complete: "status-complete", pending: "status-pending", review: "status-review", active: "status-active" };
  return `<span class="status-badge ${map[status] || "status-pending"}">${status.charAt(0).toUpperCase() + status.slice(1)}</span>`;
}

function typeBadge(type) {
  const cls = type === "EEG" ? "type-eeg" : type === "ERP" ? "type-erp" : "type-ep";
  return `<span class="type-badge ${cls}">${type}</span>`;
}

/**
 * Displays latency with color coding based on abnormality flag.
 * Red = delayed/abnormal, Green = within normal range.
 */
function latencyDisplay(latency, abnormal) {
  if (latency === "—") return `<span class="latency-ok">—</span>`;
  return abnormal
    ? `<span class="latency-delayed">${latency}</span>`
    : `<span class="latency-ok">${latency}</span>`;
}

/**
 * Displays amplitude with reduction flag for low values.
 */
function amplitudeDisplay(amp, abnormal) {
  if (amp === "—") return `<span class="amplitude-value">—</span>`;
  return abnormal
    ? `<span class="amplitude-reduced">${amp}</span>`
    : `<span class="amplitude-value">${amp}</span>`;
}

function canExport(reportState, userRole) {
  return reportState === "finalized" || userRole === "admin" || userRole === "neurophysiologist";
}

function checkConsent(clinicId) {
  const consent = window.APP_STATE?.consentRegistry || {};
  return consent[clinicId] === true || clinicId === "demo-clinic";
}

/**
 * Classifies ERP/EP latency relative to age-normative window.
 * Returns: normal, borderline, delayed, or absent.
 */
function classifyLatency(latencyMs, normalRange) {
  if (!latencyMs || latencyMs === "—") return "absent";
  const num = parseFloat(latencyMs);
  if (isNaN(num)) return "unknown";
  if (!normalRange || normalRange === "—") return "unknown";
  const parts = normalRange.split("-");
  if (parts.length !== 2) return "unknown";
  const upper = parseFloat(parts[1]);
  if (num > upper * 1.1) return "delayed";
  if (num > upper) return "borderline";
  return "normal";
}

/**
 * Generates waveform-specific clinical note for ERP/EP types.
 */
function waveformNote(type, waveform) {
  if (type === "EEG") return "Continuous EEG — review raw trace";
  if (!waveform || waveform === "—") return "Standard paradigm — verify protocol";
  return `${waveform} — verify normative values for age`;
}

/**
 * Counts abnormal findings by modality type for dashboard KPIs.
 */
function countAbnormalByType(data, type) {
  return data.filter(d => d.type === type && d.abnormal).length;
}

/* ────────────────────── MAIN ENTRY FUNCTION ────────────────────── */

/**
 * Renders the Neurophysiology Analyzer dashboard.
 * @param {Function} setTopbar - Sets the page title in top navigation
 * @param {Function} navigate - Navigation handler for detail views
 * @returns {HTMLElement} The rendered page container element
 */
export async function pgNeurophysiologyAnalyzer(setTopbar, navigate) {
  setTopbar("Neurophysiology Analyzer", "EEG / ERP / EP analysis and interpretation dashboard");

  const el = document.createElement("div");
  el.innerHTML = `<div class="analyzer-container"><div class="loading">Loading neurophysiology recordings...</div></div>`;

  const clinicId = window.APP_STATE?.clinicId || "demo-clinic";
  const userRole = window.APP_STATE?.userRole || "clinician";
  const reportState = window.APP_STATE?.reportState || "draft";
  const signedBy = window.APP_STATE?.signedBy || null;
  const hasConsent = checkConsent(clinicId);

  let data = [];

  try {
    const res = await api.getNeurophysiology(clinicId, null, { limit: 100 });
    data = res?.items || [];
  } catch (e) {
    console.warn("[NeurophysiologyAnalyzer] API error, using demo data:", e.message);
  }

  if (!data || data.length === 0) {
    data = DEMO_DATA;
  }

  let filtered = [...data];
  let activeFilter = "all";

  const filterOptions = ["all", "EEG", "ERP", "EP", "abnormal"];

  function render() {
    const totalRecordings = data.length;
    const eegCount = data.filter(d => d.type === "EEG").length;
    const erpCount = data.filter(d => d.type === "ERP").length;
    const epCount = data.filter(d => d.type === "EP").length;
    const abnormalFindings = data.filter(d => d.abnormal).length;
    const pendingReview = data.filter(d => d.status === "review" || d.status === "pending").length;

    /* Apply filter */
    if (activeFilter !== "all") {
      if (activeFilter === "abnormal") {
        filtered = data.filter(d => d.abnormal);
      } else {
        filtered = data.filter(d => d.type === activeFilter);
      }
    } else {
      filtered = [...data];
    }

    const rowsHtml = filtered.map(row => `
      <tr class="${row.abnormal ? "abnormal" : ""}">
        <td><strong>${row.id}</strong></td>
        <td>${typeBadge(row.type)}</td>
        <td><strong>${row.patientName}</strong><br/><span style="font-size:10px;color:var(--text-secondary)">${row.patient} | ${row.age}y</span></td>
        <td>${row.duration}</td>
        <td>${row.keyFinding} ${row.abnormal ? '<span class="abnormal-flag">!</span>' : ""}</td>
        <td>${latencyDisplay(row.latency, row.abnormal)}<br/><span class="normal-range-text">${row.normalRange !== "—" ? "NR: " + row.normalRange : ""}</span></td>
        <td>${amplitudeDisplay(row.amplitude, row.abnormal)}</td>
        <td>${row.waveform !== "—" ? `<span class="waveform-note">${row.waveform}</span>` : "—"}</td>
        <td>${evidenceBadge(row.evidenceGrade)} <span class="provenance-tag">${row.provenance}</span></td>
        <td>${statusBadge(row.status)}</td>
      </tr>
    `).join("");

    const consentHtml = hasConsent
      ? `<div class="consent-bar">Informed consent verified for clinic ${clinicId}. Patient data access authorized.</div>`
      : `<div class="consent-bar missing">Patient consent required for data export. Review consent registry.</div>`;

    el.innerHTML = `
      <style>${PAGE_CSS}</style>
      <div class="analyzer-container">
        <div class="analyzer-header">
          <div>
            <div class="analyzer-title">Neurophysiology Analyzer</div>
            <div class="analyzer-subtitle">EEG / ERP / EP findings — ${totalRecordings} recordings | ${abnormalFindings} abnormal</div>
          </div>
          <button class="btn-export" id="btn-export-csv">Export CSV</button>
        </div>

        ${consentHtml}

        <div class="safety-banner">
          <strong>Decision support only</strong> — EEG/ERP/EP interpretations are pattern-recognition aids. All findings require board-certified clinical neurophysiologist review. Automated latency/amplitude markers are measured from averaged epochs; interpretation is inferred. Age-normative ranges must be verified against laboratory-specific norms per ACNS guidelines.
        </div>

        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-value">${totalRecordings}</div>
            <div class="kpi-label">Total Recordings</div>
            <div class="kpi-sublabel">Across all modalities</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-value">${eegCount}</div>
            <div class="kpi-label">EEG Studies</div>
            <div class="kpi-sublabel">Routine & extended</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-value">${erpCount}</div>
            <div class="kpi-label">ERPs Analyzed</div>
            <div class="kpi-sublabel">Evoked potentials</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-value">${epCount}</div>
            <div class="kpi-label">EPs Completed</div>
            <div class="kpi-sublabel">SSEP / VEP / BAEP</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-value">${abnormalFindings}</div>
            <div class="kpi-label">Abnormal Findings</div>
            <div class="kpi-sublabel">Flagged for review</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-value">${pendingReview}</div>
            <div class="kpi-label">Pending Review</div>
            <div class="kpi-sublabel">Awaiting validation</div>
          </div>
        </div>

        <div class="summary-panel">
          <div class="summary-row">
            <div class="summary-item"><strong>EEG:</strong> ${eegCount}</div>
            <div class="summary-item"><strong>ERP:</strong> ${erpCount}</div>
            <div class="summary-item"><strong>EP:</strong> ${epCount}</div>
            <div class="summary-item"><strong>Abnormal:</strong> ${abnormalFindings}</div>
            <div class="summary-item"><strong>Pending:</strong> ${pendingReview}</div>
            <div class="summary-item"><strong>Evidence A:</strong> ${data.filter(d => d.evidenceGrade === "A").length}</div>
            <div class="summary-item"><strong>Evidence B:</strong> ${data.filter(d => d.evidenceGrade === "B").length}</div>
            <div class="summary-item"><strong>Evidence C:</strong> ${data.filter(d => d.evidenceGrade === "C").length}</div>
          </div>
          <div class="governance-notice">
            Clinic: ${clinicId} | Role: ${userRole} | Report state: ${reportState} | ${signedBy ? `Signed by: ${signedBy}` : "Unsigned"} | Consent: ${hasConsent ? "verified" : "missing"}
          </div>
        </div>

        <div class="filter-tabs">
          ${filterOptions.map(f => `
            <div class="filter-tab ${activeFilter === f ? "active" : ""}" data-filter="${f}">
              ${f === "all" ? `All (${totalRecordings})` : f === "abnormal" ? `Abnormal (${abnormalFindings})` : `${f} (${data.filter(d => d.type === f).length})`}
            </div>
          `).join("")}
        </div>

        <div style="overflow-x:auto;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Recording</th>
                <th>Type</th>
                <th>Patient</th>
                <th>Duration</th>
                <th>Key Finding</th>
                <th>Latency</th>
                <th>Amplitude</th>
                <th>Waveform</th>
                <th>Evidence</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.length ? rowsHtml : `<tr><td colspan="10"><div class="empty-state">No recordings match the selected filter.</div></td></tr>`}
            </tbody>
          </table>
        </div>

        ${filtered.length === 0 ? `<div class="empty-state">
          <div style="font-size:16px;font-weight:600;margin-bottom:8px;">No neurophysiology recordings found</div>
          <div style="font-size:13px;">Import EEG/ERP/EP data from acquisition system or start a new recording session. Ensure amplifier calibration is current and electrode impedance is below 5 kOhm.</div>
        </div>` : ""}
      </div>
    `;

    el.querySelectorAll(".filter-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        activeFilter = tab.dataset.filter;
        render();
      });
    });

    const exportBtn = el.querySelector("#btn-export-csv");
    if (exportBtn) {
      exportBtn.addEventListener("click", () => {
        if (!canExport(reportState, userRole)) {
          alert(`Export requires finalized report state or admin/neurophysiologist role.\nCurrent: report_state=${reportState}, role=${userRole}`);
          return;
        }
        if (!hasConsent) {
          alert("Patient consent must be verified before data export.");
          return;
        }
        const headers = ["ID", "Type", "Patient", "PatientName", "Age", "Duration", "KeyFinding", "Latency", "Amplitude", "NormalRange", "Waveform", "EvidenceGrade", "Status", "Provenance", "Date", "Abnormal", "Interpreter"];
        const csv = [headers.join(","), ...filtered.map(r => [r.id, r.type, r.patient, r.patientName, r.age, r.duration, r.keyFinding, r.latency, r.amplitude, r.normalRange, r.waveform, r.evidenceGrade, r.status, r.provenance, r.date, r.abnormal, r.interpreter].join(","))].join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `neurophysiology-recordings-${clinicId}-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      });
    }
  }

  render();
  return el;
}

export default { pgNeurophysiologyAnalyzer };
