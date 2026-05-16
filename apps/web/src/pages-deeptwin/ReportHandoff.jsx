/**
 * ReportHandoff.jsx — DeepTwin export and handoff panel
 */

import React, { useState } from "react";

export default function ReportHandoff({ snapshot, patientId, clinicianId }) {
  const [exportType, setExportType] = useState("json");
  const [logs, setLogs] = useState([]);
  const [busy, setBusy] = useState(false);

  if (!snapshot) return null;

  const addLog = (action, detail) => {
    setLogs((prev) => [
      { action, detail, time: new Date().toLocaleString() },
      ...prev,
    ]);
  };

  const handleExport = async () => {
    setBusy(true);
    await new Promise((r) => setTimeout(r, 500));
    const exportId = `exp_${Date.now()}`;
    addLog("export", `Exported as ${exportType.toUpperCase()} (${exportId})`);
    setBusy(false);
    // Trigger download
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `deeptwin-${patientId}-${exportType}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleReportHandoff = async () => {
    setBusy(true);
    await new Promise((r) => setTimeout(r, 500));
    const handoffId = `rpt_${Date.now()}`;
    addLog("report_handoff", `Sent to Report module (${handoffId})`);
    setBusy(false);
  };

  const handleProtocolHandoff = async () => {
    setBusy(true);
    await new Promise((r) => setTimeout(r, 500));
    const handoffId = `proto_${Date.now()}`;
    addLog("protocol_handoff", `Sent to Protocol Studio (${handoffId})`);
    setBusy(false);
  };

  return (
    <div className="space-y-6">
      {/* Export */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Export Snapshot</h3>
        <div className="flex items-center gap-3 mb-4">
          <select
            value={exportType}
            onChange={(e) => setExportType(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="json">JSON</option>
            <option value="pdf">PDF</option>
          </select>
          <button
            onClick={handleExport}
            disabled={busy}
            className="px-4 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {busy ? "Exporting..." : "Export"}
          </button>
        </div>
      </div>

      {/* Handoffs */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Send To</h3>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleReportHandoff}
            disabled={busy}
            className="px-4 py-2 text-sm font-medium rounded-md bg-indigo-100 text-indigo-700 hover:bg-indigo-200 disabled:opacity-50 transition-colors"
          >
            &#9993; Report Module
          </button>
          <button
            onClick={handleProtocolHandoff}
            disabled={busy}
            className="px-4 py-2 text-sm font-medium rounded-md bg-teal-100 text-teal-700 hover:bg-teal-200 disabled:opacity-50 transition-colors"
          >
            &#9851; Protocol Studio
          </button>
        </div>
      </div>

      {/* Audit Log */}
      {logs.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Activity Log</h3>
          <ul className="space-y-2">
            {logs.map((log, i) => (
              <li key={i} className="text-xs text-gray-600 border-l-2 border-blue-300 pl-3 py-1">
                <span className="font-medium capitalize">{log.action.replace(/_/g, " ")}</span>
                <span className="text-gray-400"> — {log.detail} — {log.time}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
