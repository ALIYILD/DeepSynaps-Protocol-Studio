/** FFT-adjacent estimate of photic stimulation frequency from trigger channel (best-effort). */
export function estimatePhoticHz(
  photic: number[] | undefined,
  sampleRate: number,
): number | null {
  if (!photic?.length) return null;
  const idx: number[] = [];
  for (let i = 0; i < photic.length; i++) {
    if (photic[i]) idx.push(i);
  }
  if (idx.length < 2) return null;
  const gaps: number[] = [];
  for (let i = 1; i < idx.length; i++) {
    gaps.push((idx[i]! - idx[i - 1]!) / sampleRate);
  }
  gaps.sort((a, b) => a - b);
  const med = gaps[Math.floor(gaps.length / 2)]!;
  return med > 1e-6 ? 1 / med : null;
}
