import { bookOrder, type ComparisonIndex, type IndexedEvent } from "./index";
import type { RunRow, Span } from "../types";

/** One ladder run after the type index is resolved. */
export interface ScopedRun {
  a: Span | null;
  o: Span | null;
  b: Span | null;
  type: string;
  flags: string;
  excludedA: string;
  excludedB: string;
}

/** A tick on one ladder axis. */
export interface AxisTick {
  x: number;
  label: string;
  major: boolean;
}

/** Verse positions along one side of the ladder. */
export interface LadderAxis {
  books: string[];
  length: number;
  ticks: AxisTick[];
  position: (span: Span, end: boolean) => number;
}

/**
 * Runs that belong to one book, plus one-sided runs on the books they touch.
 * A hidden layer is drawn as SAME so the band stays but loses its type color.
 */
export function scopeRuns(
  index: ComparisonIndex,
  runs: RunRow[],
  book: string,
  layersOn: ReadonlySet<string>,
): ScopedRun[] {
  const decoded = runs.map((row) => decodeRun(index, row));
  let scoped = decoded.filter((run) => run.a?.[0] === book);
  if (scoped.length === 0) {
    scoped = decoded.filter((run) => run.b?.[0] === book);
  }
  const booksB = new Set(
    scoped.map((run) => run.b?.[0]).filter((code): code is string => !!code),
  );
  const booksA = new Set(
    scoped.map((run) => run.a?.[0]).filter((code): code is string => !!code),
  );
  for (const run of decoded) {
    if (
      run.a === null &&
      run.b !== null &&
      booksB.has(run.b[0]) &&
      !scoped.includes(run)
    ) {
      scoped.push(run);
    }
    if (
      run.b === null &&
      run.a !== null &&
      booksA.has(run.a[0]) &&
      !scoped.includes(run)
    ) {
      scoped.push(run);
    }
  }
  return scoped.map((run) => {
    const layer = index.types.find((type) => type.id === run.type)?.layer;
    if (layer !== undefined && !layersOn.has(layer)) {
      return { ...run, type: "SAME" };
    }
    return run;
  });
}

/**
 * Verse coordinates for one ladder axis.
 * ``maxima`` supplies chapter lengths. Missing books take their extent from the runs.
 */
export function axisFor(
  index: ComparisonIndex,
  runs: ScopedRun[],
  key: "a" | "o" | "b",
  maxima: (book: string) => number[] | null | undefined,
): LadderAxis {
  const books = [
    ...new Set(runs.map((run) => run[key]?.[0]).filter((code): code is string => !!code)),
  ].sort((left, right) => bookOrder(index.order, left) - bookOrder(index.order, right));
  const start = new Map<string, number[]>();
  const ticks: AxisTick[] = [];
  let offset = 0;
  for (const book of books) {
    let lengths = maxima(book) ?? null;
    if (lengths === null || lengths.length === 0) {
      const chapters = new Map<number, number>();
      for (const run of runs) {
        const span = run[key];
        if (span === null || span[0] !== book) {
          continue;
        }
        chapters.set(span[1], Math.max(chapters.get(span[1]) ?? 0, span[2]));
        chapters.set(span[3], Math.max(chapters.get(span[3]) ?? 0, span[4]));
      }
      const count = Math.max(0, ...chapters.keys());
      lengths = Array.from({ length: count }, (_, item) => chapters.get(item + 1) ?? 0);
    }
    const chapterStart: number[] = [];
    for (let chapter = 1; chapter <= lengths.length; chapter += 1) {
      chapterStart[chapter] = offset;
      ticks.push({
        x: offset,
        label: chapter === 1 ? `${book} 1` : String(chapter),
        major: chapter === 1,
      });
      offset += Number(lengths[chapter - 1]) + 1;
    }
    start.set(book, chapterStart);
  }
  return {
    books,
    length: Math.max(1, offset),
    ticks,
    position: (span, end) => {
      const chapters = start.get(span[0]);
      if (chapters === undefined) {
        return 0;
      }
      const chapter = end ? span[3] : span[1];
      const verse = end ? span[4] : span[2];
      return (chapters[chapter] ?? 0) + verse + (end ? 1 : 0);
    },
  };
}

/**
 * Visible verse window at a zoom factor.
 * Zoom 1 shows the whole axis. Zoom 400 shows one four-hundredth of it.
 */
export function ladderWindow(length: number, zoom: number): [number, number] {
  const scale = Math.min(400, Math.max(1, zoom));
  return [0, length / scale];
}

/**
 * Event a run most overlaps, or null for a SAME run.
 * Overlap is measured in verse units on each side.
 */
export function eventForRun(
  index: ComparisonIndex,
  run: ScopedRun,
  layersOn: ReadonlySet<string>,
): IndexedEvent | null {
  if (run.type === "SAME") {
    return null;
  }
  let best: IndexedEvent | null = null;
  let bestOverlap = 0;
  for (const event of index.events) {
    if (event.type !== run.type || !layersOn.has(event.layer)) {
      continue;
    }
    const overlap = spanOverlap(event.a, run.a) + spanOverlap(event.b, run.b);
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      best = event;
    }
  }
  return bestOverlap > 0 ? best : null;
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

/** Shared verse overlap of two spans in the same book. */
function spanOverlap(left: Span | null, right: Span | null): number {
  if (left === null || right === null || left[0] !== right[0]) {
    return 0;
  }
  const start = Math.max(left[1] * 1000 + left[2], right[1] * 1000 + right[2]);
  const end = Math.min(left[3] * 1000 + left[4], right[3] * 1000 + right[4]);
  return Math.max(0, end - start + 1);
}

/** Resolve a run row's type index. ``-1`` is an unchanged run. */
function decodeRun(index: ComparisonIndex, row: RunRow): ScopedRun {
  return {
    a: row[0],
    o: row[1],
    b: row[2],
    type: row[3] < 0 ? "SAME" : (index.types[row[3]]?.id ?? "SAME"),
    flags: row[4],
    excludedA: row[5],
    excludedB: row[6],
  };
}
