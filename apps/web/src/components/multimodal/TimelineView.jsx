/**
 * TimelineView — Vertical timeline with modality color-coding,
 * expandable event cards, filter controls, and safety disclaimer.
 */
import React, { useState, useMemo } from "react";

const MODALITY_COLORS = {
  assessment: "bg-blue-500",
  qeeg: "bg-indigo-500",
  mri: "bg-purple-500",
  biomarker: "bg-pink-500",
  medication: "bg-orange-500",
  intervention: "bg-teal-500",
  voice: "bg-cyan-500",
  text: "bg-gray-500",
  video: "bg-red-500",
  wearable: "bg-green-500",
  digital_phenotyping: "bg-lime-500",
  risk_signal: "bg-amber-500",
  report: "bg-slate-500",
  patient_checkin: "bg-emerald-500",
};

const QUALITY_BADGES = {
  high: "bg-green-100 text-green-800 border-green-300",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-300",
  low: "bg-red-100 text-red-800 border-red-300",
  missing: "bg-gray-100 text-gray-800 border-gray-300",
  unknown: "bg-gray-50 text-gray-600 border-gray-200",
};

export default function TimelineView({
  patientId,
  events = [],
  availableModalities = [],
  onFilterChange,
}) {
  const [expandedEvents, setExpandedEvents] = useState(new Set());
  const [selectedModalities, setSelectedModalities] = useState([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const modalities = availableModalities?.length > 0
    ? availableModalities
    : [...new Set(events.map((e) => e.modality))].sort();

  const filteredEvents = useMemo(() => {
    let filtered = [...events];
    if (selectedModalities.length > 0) {
      filtered = filtered.filter((e) => selectedModalities.includes(e.modality));
    }
    if (dateFrom) {
      filtered = filtered.filter((e) => e.timestamp >= dateFrom);
    }
    if (dateTo) {
      filtered = filtered.filter((e) => e.timestamp <= dateTo);
    }
    return filtered;
  }, [events, selectedModalities, dateFrom, dateTo]);

  const toggleExpand = (eventId) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  };

  const toggleModality = (modality) => {
    setSelectedModalities((prev) => {
      const next = prev.includes(modality)
        ? prev.filter((m) => m !== modality)
        : [...prev, modality];
      onFilterChange?.({ modalities: next, dateFrom, dateTo });
      return next;
    });
  };

  const formatDate = (ts) => {
    if (!ts) return "";
    const d = new Date(ts);
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-4" data-testid="timeline-view">
      {/* Safety disclaimer */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-start gap-2" data-testid="safety-disclaimer">
        <svg className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
        <p className="text-sm text-yellow-800">
          This timeline is decision support only and requires clinician review.
          It does not constitute a diagnosis or treatment recommendation.
        </p>
      </div>

      {/* Filter controls */}
      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200" data-testid="filter-controls">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Filters</h3>
        <div className="flex flex-wrap gap-2 mb-3">
          {modalities.map((mod) => (
            <button
              key={mod}
              onClick={() => toggleModality(mod)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                selectedModalities.includes(mod)
                  ? "bg-blue-100 text-blue-800 border-blue-400"
                  : "bg-white text-gray-600 border-gray-300 hover:bg-gray-100"
              }`}
              data-testid={`modality-filter-${mod}`}
            >
              {mod}
            </button>
          ))}
        </div>
        <div className="flex gap-3 items-center flex-wrap">
          <div>
            <label className="text-xs text-gray-500 block mb-0.5">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); onFilterChange?.({ modalities: selectedModalities, dateFrom: e.target.value, dateTo }); }}
              className="text-sm border border-gray-300 rounded px-2 py-1"
              data-testid="date-from"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-0.5">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); onFilterChange?.({ modalities: selectedModalities, dateFrom, dateTo: e.target.value }); }}
              className="text-sm border border-gray-300 rounded px-2 py-1"
              data-testid="date-to"
            />
          </div>
          <div className="ml-auto text-xs text-gray-500 self-end">
            {filteredEvents.length} event{filteredEvents.length !== 1 ? "s" : ""}
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="relative pl-6" data-testid="timeline-list">
        {/* Vertical line */}
        <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-gray-300" />

        {filteredEvents.length === 0 && (
          <p className="text-sm text-gray-500 italic">No events match the selected filters.</p>
        )}

        {filteredEvents.map((event, idx) => {
          const isExpanded = expandedEvents.has(event.event_id);
          const dotColor = MODALITY_COLORS[event.modality] || "bg-gray-400";
          const qualityClass = QUALITY_BADGES[event.data_quality] || QUALITY_BADGES.unknown;

          return (
            <div key={event.event_id || idx} className="relative mb-4" data-testid={`timeline-event-${event.event_id}`}>
              {/* Dot */}
              <div className={`absolute -left-4 top-1.5 w-3 h-3 rounded-full ${dotColor} border-2 border-white shadow`} />

              <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                {/* Event header */}
                <button
                  onClick={() => toggleExpand(event.event_id)}
                  className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                  data-testid={`event-header-${event.event_id}`}
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
                    <span className="text-xs font-mono text-gray-500">{formatDate(event.timestamp)}</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-medium capitalize">
                      {event.modality}
                    </span>
                    <span className="text-sm text-gray-800 font-medium truncate max-w-md">
                      {event.value_summary}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded border ${qualityClass}`}>
                      {event.data_quality}
                    </span>
                  </div>
                  <svg
                    className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="px-4 pb-3 border-t border-gray-100 bg-gray-50" data-testid={`event-details-${event.event_id}`}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                      {event.event_type && (
                        <div>
                          <span className="text-xs text-gray-500 uppercase">Event Type</span>
                          <p className="text-sm text-gray-800">{event.event_type}</p>
                        </div>
                      )}
                      {event.source_system && (
                        <div>
                          <span className="text-xs text-gray-500 uppercase">Source</span>
                          <p className="text-sm text-gray-800">{event.source_system}</p>
                        </div>
                      )}
                      {event.confidence !== undefined && event.confidence !== null && (
                        <div>
                          <span className="text-xs text-gray-500 uppercase">Confidence</span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <div className="w-24 bg-gray-200 rounded-full h-1.5">
                              <div
                                className={`h-1.5 rounded-full ${
                                  event.confidence >= 0.7 ? "bg-green-500" : event.confidence >= 0.4 ? "bg-yellow-500" : "bg-red-500"
                                }`}
                                style={{ width: `${Math.round(event.confidence * 100)}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-600">{Math.round(event.confidence * 100)}%</span>
                          </div>
                        </div>
                      )}
                      {event.provenance && Object.keys(event.provenance).length > 0 && (
                        <div>
                          <span className="text-xs text-gray-500 uppercase">Provenance</span>
                          <pre className="text-xs text-gray-700 bg-white rounded p-1.5 border border-gray-200 mt-0.5 overflow-auto">
                            {JSON.stringify(event.provenance, null, 2)}
                          </pre>
                        </div>
                      )}
                      {event.textual_summary && (
                        <div className="md:col-span-2">
                          <span className="text-xs text-gray-500 uppercase">Summary</span>
                          <p className="text-sm text-gray-800 mt-0.5">{event.textual_summary}</p>
                        </div>
                      )}
                      {event.evidence_links?.length > 0 && (
                        <div className="md:col-span-2">
                          <span className="text-xs text-gray-500 uppercase">Evidence Links</span>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {event.evidence_links.map((link, i) => (
                              <span key={i} className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-200 font-mono">
                                {typeof link === "string" ? link : link.evidence_id || JSON.stringify(link)}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {event.audit_reference && (
                        <div>
                          <span className="text-xs text-gray-500 uppercase">Audit Ref</span>
                          <p className="text-xs font-mono text-gray-600">{event.audit_reference}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
