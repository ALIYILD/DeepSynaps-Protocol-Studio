/** WinEEG-style page duration choices (seconds). */
export const SPEED_STEPS_SEC = [5, 10, 15, 20, 30, 60] as const;

function nearestSpeedIndex(secondsPerPage: number): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < SPEED_STEPS_SEC.length; i++) {
    const d = Math.abs(SPEED_STEPS_SEC[i]! - secondsPerPage);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

export class PagingController {
  static clampStart(
    pageStartSec: number,
    secondsPerPage: number,
    durationSec: number,
  ): number {
    const maxStart = Math.max(0, durationSec - secondsPerPage);
    return Math.min(Math.max(0, pageStartSec), maxStart);
  }

  static nextSpeed(secondsPerPage: number, dir: 1 | -1): number {
    const i = nearestSpeedIndex(secondsPerPage);
    const ni = Math.min(
      SPEED_STEPS_SEC.length - 1,
      Math.max(0, i + dir),
    );
    return SPEED_STEPS_SEC[ni]!;
  }

  static nextPage(
    pageStartSec: number,
    secondsPerPage: number,
    durationSec: number,
    pages: number,
  ): number {
    return PagingController.clampStart(
      pageStartSec + pages * secondsPerPage,
      secondsPerPage,
      durationSec,
    );
  }

  static halfPage(
    pageStartSec: number,
    secondsPerPage: number,
    durationSec: number,
    sign: 1 | -1,
  ): number {
    return PagingController.clampStart(
      pageStartSec + sign * (secondsPerPage / 2),
      secondsPerPage,
      durationSec,
    );
  }
}
