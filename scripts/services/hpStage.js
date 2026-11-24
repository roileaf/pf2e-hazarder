const ORDER = { ok: 0, broken: 1, destroyed: 2 };

/**
 * Where a hazard's hit points put it: 'destroyed' at 0, 'broken' at or below its Broken Threshold
 * (half its maximum unless stated), else 'ok'. Hazards without hit points are always 'ok'.
 */
export function hpStage(hp) {
  const max = hp?.max ?? 0;
  if (!(max > 0)) return 'ok';
  const value = hp.value ?? max;
  if (value <= 0) return 'destroyed';
  const threshold = hp.brokenThreshold ?? Math.floor(max / 2);
  return value <= threshold ? 'broken' : 'ok';
}

/** Whether going from `prev` to `next` is damage crossing a line (not healing or no change). */
export const stageWorsened = (prev, next) => (ORDER[next] ?? 0) > (ORDER[prev] ?? 0);
