import { scaleLinear } from "d3-scale";
import type { ComparisonIndex } from "./index";
import { axisFor, ladderWindow, runKey, runSelectable, type ScopedRun } from "./detail";

/** One dot-plot stroke in canvas pixels. ``key`` matches ``runKey`` for that run. */
export interface DotSegment {
  /** Identity shared with the ladder ribbon and the table row. */
  key: string;
  /** Run type, ``SAME`` when the layer is hidden. The plot uses it for the stroke color. */
  type: string;
  /** Canvas x of the side A start. */
  x0: number;
  /** Canvas y of the side B start. */
  y0: number;
  /** Canvas x of the side A end. */
  x1: number;
  /** Canvas y of the side B end. */
  y1: number;
}

/**
 * Segment under a dot-plot click, or null when none is within ``slop`` pixels.
 * Distance is measured to the finite segment. The nearer segment wins.
 */
export function nearestSegment(
  segments: readonly DotSegment[],
  x: number,
  y: number,
  slop: number,
): string | null {
  let bestKey: string | null = null;
  let bestDistance = slop;
  for (const segment of segments) {
    const distance = segmentDistance(segment, x, y);
    if (distance > slop || (bestKey !== null && distance >= bestDistance)) {
      continue;
    }
    bestKey = segment.key;
    bestDistance = distance;
  }
  return bestKey;
}

/** One margin tick for verses that exist on one side only. */
export interface DotTick {
  /** Identity shared with the ladder ribbon. */
  key: string;
  /** Run type, ``SAME`` when the layer is hidden. */
  type: string;
  /** Drawn rectangle: x, y, width, height. */
  rect: readonly [number, number, number, number];
  /** Click rectangle, a little larger than the drawn one. */
  hit: readonly [number, number, number, number];
}

/** Strokes, margin ticks, and the reference diagonal for one book. */
export interface DotPlotLayout {
  /** Strokes for runs that exist on both sides. */
  segments: DotSegment[];
  /** Ticks for runs that exist on one side only. */
  ticks: DotTick[];
  /** Dashed reference line: x0, y0, x1, y1. */
  diagonal: readonly [number, number, number, number];
  /** Factor applied when offsets are magnified. 1 when the book has no offset. */
  magnification: number;
}

/**
 * Factor that magnifies offsets for one book.
 * It is ``0.3`` times the side B length divided by the largest verse offset, and never above 400.
 * A book with no offset returns 1. The plot and its explanation share this value.
 */
export function dotMagnification(
  runs: readonly ScopedRun[],
  index: ComparisonIndex,
): number {
  const sideB = axisFor(index, runs, "b", (code) => index.byCode.get(code)?.b);
  const offset = maxOffset(runs, index);
  return offset > 0 ? Math.min(400, (0.3 * Math.max(1, sideB.length)) / offset) : 1;
}

/**
 * Strokes, ticks, and the diagonal for one book.
 * A run missing either side becomes a margin tick. ``magnify`` applies the offset scale.
 */
export function dotPlotLayout(
  runs: readonly ScopedRun[],
  index: ComparisonIndex,
  magnify: boolean,
  size: number,
): DotPlotLayout {
  const sideA = axisFor(index, runs, "a", (code) => index.byCode.get(code)?.a);
  const sideB = axisFor(index, runs, "b", (code) => index.byCode.get(code)?.b);
  const x = scaleLinear()
    .domain(ladderWindow(sideA.length, 1))
    .range([14, size - 4]);
  const y = scaleLinear()
    .domain(ladderWindow(sideB.length, 1))
    .range([size - 14, 4]);
  const perVerse = (size - 18) / Math.max(1, sideB.length);
  const magnification = dotMagnification(runs, index);
  const head = 0.3 * (size - 18);
  const top = 4 + head;
  const bottom = size - 14 - head;
  const baseline = (position: number) =>
    bottom + (position / Math.max(1, sideA.length)) * (top - bottom);
  const magnifiedY = (aPos: number, bPos: number) =>
    Math.max(
      4,
      Math.min(size - 14, baseline(aPos) - (bPos - aPos) * perVerse * magnification),
    );
  const segments: DotSegment[] = [];
  const ticks: DotTick[] = [];
  for (const run of runs) {
    if (run.a !== null && run.b !== null) {
      const a0 = sideA.position(run.a, false);
      const a1 = sideA.position(run.a, true);
      const b0 = sideB.position(run.b, false);
      const b1 = sideB.position(run.b, true);
      segments.push({
        key: runKey(run),
        type: run.type,
        x0: x(a0),
        y0: magnify ? magnifiedY(a0, b0) : y(b0),
        x1: x(a1),
        y1: magnify ? magnifiedY(a1, b1) : y(b1),
      });
      continue;
    }
    if (run.a !== null && run.b === null) {
      const start = x(sideA.position(run.a, false));
      const width = Math.max(1.5, x(sideA.position(run.a, true)) - start);
      ticks.push({
        key: runKey(run),
        type: run.type,
        rect: [start, size - 11, width, 6],
        hit: [start - 2, size - 13, Math.max(width, 5), 10],
      });
    }
    if (run.b !== null && run.a === null) {
      const start = y(sideB.position(run.b, true));
      const height = Math.max(1.5, y(sideB.position(run.b, false)) - start);
      ticks.push({
        key: runKey(run),
        type: run.type,
        rect: [2, start, 6, height],
        hit: [0, start - 2, 10, Math.max(height, 5)],
      });
    }
  }
  const diagonal = magnify
    ? ([x(0), bottom, x(sideA.length), top] as const)
    : ([x(0), y(0), x(sideA.length), y(sideB.length)] as const);
  return { segments, ticks, diagonal, magnification };
}

/**
 * Deviance under a dot-plot click.
 * A selectable margin tick whose hit contains the point wins. Otherwise the nearest stroke
 * within ``slop`` wins, the same measurement as ``nearestSegment``.
 * An unchanged stroke or tick returns null, including when a deviance is farther away but still inside the slop.
 */
export function selectedDotKey(
  layout: DotPlotLayout,
  x: number,
  y: number,
  slop: number,
): string | null {
  const tick = layout.ticks.find(
    (item) => runSelectable(item) && hitContains(item.hit, x, y),
  );
  if (tick !== undefined) {
    return tick.key;
  }
  const key = nearestSegment(layout.segments, x, y, slop);
  if (key === null) {
    return null;
  }
  const segment = layout.segments.find((item) => item.key === key);
  if (segment === undefined || !runSelectable(segment)) {
    return null;
  }
  return key;
}

/** Draw nothing when the canvas cannot supply a 2D context. */
export function drawDotPlot(
  canvas: HTMLCanvasElement,
  paint: (context: CanvasRenderingContext2D) => void,
): void {
  const context = canvas.getContext("2d");
  if (context === null) {
    return;
  }
  paint(context);
}

/** Largest verse offset between the two sides of the same book, or 0 when none exist. */
function maxOffset(runs: readonly ScopedRun[], index: ComparisonIndex): number {
  const sideA = axisFor(index, runs, "a", (code) => index.byCode.get(code)?.a);
  const sideB = axisFor(index, runs, "b", (code) => index.byCode.get(code)?.b);
  let offset = 0;
  for (const run of runs) {
    if (run.a === null || run.b === null || run.a[0] !== run.b[0]) {
      continue;
    }
    offset = Math.max(
      offset,
      Math.abs(sideB.position(run.b, false) - sideA.position(run.a, false)),
      Math.abs(sideB.position(run.b, true) - sideA.position(run.a, true)),
    );
  }
  return offset;
}

/** Whether a point lies inside a tick's click rectangle. */
function hitContains(
  hit: readonly [number, number, number, number],
  x: number,
  y: number,
): boolean {
  const [left, top, width, height] = hit;
  return x >= left && x <= left + width && y >= top && y <= top + height;
}

/** Distance from a point to a finite segment. A zero-length segment is a point. */
function segmentDistance(segment: DotSegment, x: number, y: number): number {
  const dx = segment.x1 - segment.x0;
  const dy = segment.y1 - segment.y0;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) {
    return Math.hypot(x - segment.x0, y - segment.y0);
  }
  const t = Math.max(
    0,
    Math.min(1, ((x - segment.x0) * dx + (y - segment.y0) * dy) / lengthSq),
  );
  return Math.hypot(segment.x0 + t * dx - x, segment.y0 + t * dy - y);
}
