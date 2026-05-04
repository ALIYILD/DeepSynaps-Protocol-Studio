import { useViewStore } from "../stores/view";
import { useReportEditorStore } from "./reportEditorStore";

/**
 * Inserts a figure block describing the current EEG page viewport (caption only;
 * embed a data URL in the editor for printable images).
 */
export function useInsertFigureFromWindow() {
  const insertBlock = useReportEditorStore((s) => s.insertBlock);
  const pageStartSec = useViewStore((s) => s.pageStartSec);
  const secondsPerPage = useViewStore((s) => s.secondsPerPage);

  return function insertFigureFromWindow() {
    const a = pageStartSec;
    const b = pageStartSec + secondsPerPage;
    insertBlock({
      type: "figure",
      caption: `EEG window ${a.toFixed(2)}–${b.toFixed(2)} s`,
    });
  };
}
