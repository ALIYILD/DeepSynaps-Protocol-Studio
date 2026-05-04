/** Rising edges of photic stim channel → viewer markers (read-only, M5). */

export function photicEdgeMarkers(
  photic: number[] | undefined,
  sampleRate: number,
  windowFromSec: number,
): { timeSec: number }[] {
  if (!photic?.length || sampleRate <= 0) return [];
  const out: { timeSec: number }[] = [];
  for (let i = 1; i < photic.length; i++) {
    const prev = photic[i - 1] ?? 0;
    const cur = photic[i] ?? 0;
    if (cur && !prev) {
      out.push({ timeSec: windowFromSec + i / sampleRate });
    }
  }
  return out;
}
