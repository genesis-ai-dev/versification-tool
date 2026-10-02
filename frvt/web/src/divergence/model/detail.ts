import { scaleLinear } from "d3-scale";
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
  runs: readonly ScopedRun[],
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
 * ``origin`` is the first verse to show. The window is clamped inside the axis.
 */
export function ladderWindow(length: number, zoom: number, origin = 0): [number, number] {
  const scale = Math.min(400, Math.max(1, zoom));
  const span = length / scale;
  if (scale === 1) {
    return [0, length];
  }
  const start = Math.min(Math.max(0, origin), Math.max(0, length - span));
  return [start, start + span];
}

/** Chapters that contain a strip window. ``book`` and ``endBook`` are book codes. */
export interface VisibleChapters {
  /** Book that contains the first verse of the window. */
  book: string;
  /** Chapter that contains the first verse of the window. */
  first: number;
  /** Chapter that contains the last verse of the window. */
  last: number;
  /** Book that contains the last verse. Same as ``book`` when the window stays in one book. */
  endBook: string;
}

/**
 * Chapters covered by a verse window on one ladder axis.
 * A chapter owns the verses from its tick up to the next tick, so a window that
 * starts after a tick still names that chapter. Returns null when the axis has
 * no ticks or the window starts before the first one.
 */
export function visibleChapters(
  axis: LadderAxis,
  start: number,
  end: number,
): VisibleChapters | null {
  const ticks = chapterTicks(axis);
  const first = latestTickAtOrBefore(ticks, start);
  if (first === undefined) {
    return null;
  }
  const last = latestTickAtOrBefore(ticks, end) ?? first;
  return { book: first.book, first: first.chapter, last: last.chapter, endBook: last.book };
}

/**
 * Origin for one axis so it shows the same fraction of its length as the source axis.
 * The strip stores the source origin. Equal lengths keep that origin, so a drag
 * moves every axis by the same distance on screen.
 */
export function alignedOrigin(
  length: number,
  sourceLength: number,
  sourceOrigin: number,
): number {
  if (sourceLength <= 0) {
    return 0;
  }
  return (sourceOrigin * length) / sourceLength;
}

/**
 * Next strip origin after a pointer drag.
 * ``deltaPx`` is movement to the right. The verses follow the pointer, so that drag moves the origin earlier.
 * ``pxPerVerse`` is the ribbon scale. A non-positive scale leaves the clamped origin unchanged.
 */
export function panOrigin(
  length: number,
  zoom: number,
  origin: number,
  deltaPx: number,
  pxPerVerse: number,
): number {
  const deltaVerses = pxPerVerse > 0 ? -deltaPx / pxPerVerse : 0;
  return ladderWindow(length, zoom, origin + deltaVerses)[0];
}

/** Chapter pin and heading for one selected run. */
export interface RunPlace {
  /** Book the pin and the detail menu use. */
  bookCode: string;
  /** Start chapter of the chosen side. The donut and the event list follow this chapter. */
  chapter: number;
  /** Verse heading, such as ``Exodus 21:1–21:4``. */
  title: string;
}

/**
 * Whether the detail view may select this run.
 * Pass a scoped run, or a dot stroke that carries the same type string.
 * Unchanged numbering is ``SAME``, and a hidden layer is rewritten to that type.
 * The mark stays visible. A click on it must not highlight the run or pin its chapter.
 */
export function runSelectable(run: { type: string }): boolean {
  return run.type !== "SAME";
}

/**
 * Where a selected run sits, for the column heading and the chapter pin.
 * Side A is preferred. A run with neither side returns null, including a ``SAME`` run that has no spans.
 */
export function runPlace(index: ComparisonIndex, run: ScopedRun): RunPlace | null {
  const span = run.a ?? run.b;
  if (span === null) {
    return null;
  }
  const bookCode = span[0];
  return {
    bookCode,
    chapter: span[1],
    title: verseTitle(index.byCode.get(bookCode)?.name ?? bookCode, span),
  };
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
 * Stable identity for one ladder run.
 * The same type and spans return the same key. A null span is ``-``.
 */
export function runKey(run: ScopedRun): string {
  return `${run.type}|${spanKey(run.a)}|${spanKey(run.o)}|${spanKey(run.b)}`;
}

/**
 * Run to highlight when a table row is chosen.
 * Returns the earliest run whose best-matching event is ``event``, or null when none overlap.
 * A ``SAME`` run is never returned.
 */
export function runForEvent(
  index: ComparisonIndex,
  runs: readonly ScopedRun[],
  event: IndexedEvent,
  layersOn: ReadonlySet<string>,
): ScopedRun | null {
  for (const run of runs) {
    if (eventForRun(index, run, layersOn)?.index === event.index) {
      return run;
    }
  }
  return null;
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

/**
 * Deviance under a dot-plot click.
 * The nearest stroke within ``slop`` wins, the same measurement as ``nearestSegment``.
 * An unchanged stroke returns null, including when a deviance is farther away but still inside the slop.
 */
export function selectedDotKey(
  segments: readonly DotSegment[],
  x: number,
  y: number,
  slop: number,
): string | null {
  const key = nearestSegment(segments, x, y, slop);
  if (key === null) {
    return null;
  }
  const segment = segments.find((item) => item.key === key);
  if (segment === undefined || !runSelectable(segment)) {
    return null;
  }
  return key;
}

/**
 * Strokes for the dot plot, in run order.
 * A run with either side missing is omitted. ``magnify`` applies the offset scale the plot draws.
 */
export function dotSegments(
  runs: readonly ScopedRun[],
  index: ComparisonIndex,
  magnify: boolean,
  size: number,
): DotSegment[] {
  const sideA = axisFor(index, runs, "a", (code) => index.byCode.get(code)?.a);
  const sideB = axisFor(index, runs, "b", (code) => index.byCode.get(code)?.b);
  const x = scaleLinear().domain(ladderWindow(sideA.length, 1)).range([14, size - 4]);
  const y = scaleLinear().domain(ladderWindow(sideB.length, 1)).range([size - 14, 4]);
  const perVerse = (size - 18) / Math.max(1, sideB.length);
  let maxOffset = 0;
  for (const run of runs) {
    if (run.a !== null && run.b !== null && run.a[0] === run.b[0]) {
      maxOffset = Math.max(
        maxOffset,
        Math.abs(sideB.position(run.b, false) - sideA.position(run.a, false)),
        Math.abs(sideB.position(run.b, true) - sideA.position(run.a, true)),
      );
    }
  }
  const head = 0.3 * (size - 18);
  const magnification = maxOffset > 0 ? Math.min(400, head / (maxOffset * perVerse)) : 1;
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
  for (const run of runs) {
    if (run.a === null || run.b === null) {
      continue;
    }
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
  }
  return segments;
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

/** Chapter ticks in axis order, carrying the book that each tick belongs to. */
function chapterTicks(axis: LadderAxis): { x: number; book: string; chapter: number }[] {
  let book = "";
  const ticks: { x: number; book: string; chapter: number }[] = [];
  for (const tick of axis.ticks) {
    if (tick.major) {
      const split = tick.label.lastIndexOf(" ");
      book = split < 0 ? tick.label : tick.label.slice(0, split);
      const chapter = Number(split < 0 ? tick.label : tick.label.slice(split + 1));
      ticks.push({ x: tick.x, book, chapter });
      continue;
    }
    ticks.push({ x: tick.x, book, chapter: Number(tick.label) });
  }
  return ticks;
}

/** Latest tick at or before ``verse``, if the window has reached the first tick. */
function latestTickAtOrBefore(
  ticks: readonly { x: number; book: string; chapter: number }[],
  verse: number,
): { x: number; book: string; chapter: number } | undefined {
  let found: { x: number; book: string; chapter: number } | undefined;
  for (const tick of ticks) {
    if (tick.x > verse) {
      break;
    }
    found = tick;
  }
  return found;
}

/** ``Book chapter:verse`` or ``Book chapter:verse–chapter:verse``. */
function verseTitle(name: string, span: Span): string {
  const start = `${span[1]}:${span[2]}`;
  const end = `${span[3]}:${span[4]}`;
  if (start === end) {
    return `${name} ${start}`;
  }
  return `${name} ${start}–${end}`;
}

/** ``book:chapter:verse:endChapter:endVerse``, or ``-`` when the side has no span. */
function spanKey(span: Span | null): string {
  if (span === null) {
    return "-";
  }
  return `${span[0]}:${span[1]}:${span[2]}:${span[3]}:${span[4]}`;
}

/** Distance from a point to a finite segment. A zero-length segment is a point. */
function segmentDistance(segment: DotSegment, x: number, y: number): number {
  const dx = segment.x1 - segment.x0;
  const dy = segment.y1 - segment.y0;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) {
    return Math.hypot(x - segment.x0, y - segment.y0);
  }
  const t = Math.max(0, Math.min(1, ((x - segment.x0) * dx + (y - segment.y0) * dy) / lengthSq));
  return Math.hypot(segment.x0 + t * dx - x, segment.y0 + t * dy - y);
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
