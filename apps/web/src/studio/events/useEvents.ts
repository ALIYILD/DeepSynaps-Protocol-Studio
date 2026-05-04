import { useCallback, useEffect } from "react";

import { useAiStore } from "../stores/ai";
import { useEegViewerStore } from "../stores/eegViewer";
import {
  getRecordingEvents,
  getRecordingTrials,
  mapEventsToMarkers,
  mapTrialsToSlices,
} from "./eventApi";

/** Load persisted labels / fragments / trials; returns manual ``reload`` after edits. */
export function useRecordingTimeline(analysisId: string) {
  const setMarkers = useEegViewerStore((s) => s.setMarkers);
  const setFragments = useEegViewerStore((s) => s.setFragments);
  const setTrials = useEegViewerStore((s) => s.setTrials);
  const eventsChanged = useAiStore((s) => s.eventsChanged);

  const reload = useCallback(async () => {
    if (!analysisId || analysisId === "demo") return;
    try {
      const [ev, trialRows] = await Promise.all([
        getRecordingEvents(analysisId),
        getRecordingTrials(analysisId),
      ]);
      setMarkers(mapEventsToMarkers(ev.events));
      setFragments(ev.fragments);
      setTrials(mapTrialsToSlices(trialRows));
      const labs = ev.events.filter((e) => e.type === "label").length;
      eventsChanged({
        analysisId,
        labelCount: labs,
        fragmentCount: ev.fragments.length,
        trialCount: trialRows.length,
        fragmentLabels: ev.fragments.map((x) => x.label),
      });
    } catch {
      setMarkers([]);
      setFragments([]);
      setTrials([]);
    }
  }, [analysisId, setMarkers, setFragments, setTrials, eventsChanged]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { reload };
}
