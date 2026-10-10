import type { LadderAxis } from "./detail";

/** Least horizontal distance between two drawn tick labels, in pixels. Fits a three-digit chapter label. */
export const MIN_TICK_LABEL_GAP_PX = 34;

/** One chapter tick to draw on a strip axis, in screen pixels. */
export interface TickMark {
  /** Screen x of the tick line. */
  x: number;
  /** Text to draw beside the tick, or null for an unlabeled tick. */
  label: string | null;
  /** First chapter of a book. Drawn longer and always labeled. */
  major: boolean;
}

/**
 * Ticks inside the visible verse range, with labels thinned so they stay readable.
 * Every visible tick is returned so the axis keeps its chapter marks; only labels are dropped.
 * The stride is computed from the whole axis and the zoom, not the visible slice, so the
 * same ticks keep their labels while the strip pans.
 * A minor label closer than ``MIN_TICK_LABEL_GAP_PX`` to the previous label is dropped,
 * which covers runs of short chapters the stride alone would crowd.
 * A major label always draws and removes a crowded minor label before it.
 * Two crowded major labels are both kept.
 */
export function tickMarks(
  axis: LadderAxis,
  visible: readonly [number, number],
  toPx: (verse: number) => number,
  plotWidthPx: number,
): TickMark[] {
  const [start, end] = visible;
  const zoomFactor = axis.length / Math.max(end - start, Number.MIN_VALUE);
  const slots = Math.max(1, plotWidthPx / MIN_TICK_LABEL_GAP_PX);
  const stride = Math.max(1, Math.ceil(axis.ticks.length / slots / zoomFactor));
  const marks: TickMark[] = [];
  let lastLabeled: TickMark | null = null;
  for (const [position, tick] of axis.ticks.entries()) {
    if (tick.x < start || tick.x > end) {
      continue;
    }
    const mark: TickMark = { x: toPx(tick.x), label: null, major: tick.major };
    const crowded =
      lastLabeled !== null && mark.x - lastLabeled.x < MIN_TICK_LABEL_GAP_PX;
    if (tick.major) {
      if (crowded && lastLabeled !== null && !lastLabeled.major) {
        lastLabeled.label = null;
      }
      mark.label = tick.label;
    } else if (position % stride === 0 && !crowded) {
      mark.label = tick.label;
    }
    if (mark.label !== null) {
      lastLabeled = mark;
    }
    marks.push(mark);
  }
  return marks;
}
