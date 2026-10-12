import { bookEvents, bookOrder, type ComparisonIndex, type IndexedEvent } from "./index";
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

/** Highest strip zoom. Zoom 1 shows the whole axis. */
export const MAX_LADDER_ZOOM = 100;

/**
 * Zoom factor and first visible verse of the strip.
 * Kept in one value so a zoom and its new origin always paint together.
 */
export interface LadderView {
  /** Zoom factor from 1 to ``MAX_LADDER_ZOOM``. Fractional after a wheel zoom. */
  zoom: number;
  /** First visible verse on axis A. Ignored at zoom 1. */
  origin: number;
}

/** Keep a zoom factor between 1 and ``MAX_LADDER_ZOOM``. */
export function clampZoom(zoom: number): number {
  return Math.min(MAX_LADDER_ZOOM, Math.max(1, zoom));
}

/**
 * Visible verse window at a zoom factor.
 * Zoom 1 shows the whole axis. The highest zoom, MAX_LADDER_ZOOM, shows one hundredth of it.
 * ``origin`` is the first verse to show. The window is clamped inside the axis.
 */
export function ladderWindow(length: number, zoom: number, origin = 0): [number, number] {
  const scale = clampZoom(zoom);
  const span = length / scale;
  if (scale === 1) {
    return [0, length];
  }
  const start = Math.min(Math.max(0, origin), Math.max(0, length - span));
  return [start, start + span];
}

/** Side A length above which a book opens on a window instead of the whole axis. */
export const LONG_BOOK_VERSES = 1200;

/** Width of the opening window for a long book, in verses. */
export const OPENING_WINDOW_VERSES = 300;

/** Verses shown before the first divergence in the opening window. */
export const OPENING_LEAD_VERSES = 20;

/**
 * Strip view a book opens on.
 * A book of at most 1200 verses opens on the whole axis. A longer book opens on a
 * 300-verse window that starts 20 verses before the first divergence on side A.
 * The window is wider when that zoom would pass the strip maximum.
 */
export function initialLadderView(
  axis: LadderAxis,
  runs: readonly ScopedRun[],
): LadderView {
  if (axis.length <= LONG_BOOK_VERSES) {
    return { zoom: 1, origin: 0 };
  }
  const first = runs.reduce(
    (min, run) =>
      run.type === "SAME" || run.a === null
        ? min
        : Math.min(min, axis.position(run.a, false)),
    Number.POSITIVE_INFINITY,
  );
  const zoom = clampZoom(axis.length / OPENING_WINDOW_VERSES);
  const start = Number.isFinite(first) ? first - OPENING_LEAD_VERSES : 0;
  return { zoom, origin: ladderWindow(axis.length, zoom, start)[0] };
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
  return {
    book: first.book,
    first: first.chapter,
    last: last.chapter,
    endBook: last.book,
  };
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

/**
 * Strip view after zooming to ``nextZoom`` around one point of the plot.
 * ``fraction`` is that point's share of the plot width, from 0 at the left to 1 at the right,
 * and is clamped to that range. The verse under it stays under it, unless the window
 * would leave the axis; the result is clamped inside the axis.
 * Use 0.5 to zoom around the center, as the slider does.
 */
export function zoomAround(
  length: number,
  view: LadderView,
  nextZoom: number,
  fraction: number,
): LadderView {
  const zoom = clampZoom(nextZoom);
  const [start, end] = ladderWindow(length, view.zoom, view.origin);
  const share = Math.min(1, Math.max(0, fraction));
  const anchor = start + share * (end - start);
  return {
    zoom,
    origin: ladderWindow(length, zoom, anchor - share * (length / zoom))[0],
  };
}

/**
 * Zoom multiplier for one wheel event, on d3-zoom's default curve so the wheel feels like other d3 charts.
 * A negative ``deltaY`` (wheel away from the user) zooms in. ``deltaMode`` 0 is pixels,
 * 1 is lines, and 2 is pages. ``ctrlKey`` marks a trackpad pinch, which zooms 10 times faster.
 * A zero ``deltaY`` returns 1.
 */
export function wheelZoomFactor(
  deltaY: number,
  deltaMode: number,
  ctrlKey: boolean,
): number {
  const perUnit = deltaMode === 1 ? 0.05 : deltaMode === 0 ? 0.002 : 1;
  return 2 ** (-deltaY * perUnit * (ctrlKey ? 10 : 1));
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

/**
 * Book to open when the dialog has not chosen one: the first book with a visible
 * divergence, else the first book with chapters, else an empty string.
 */
export function defaultBook(
  index: ComparisonIndex,
  layersOn: ReadonlySet<string>,
): string {
  const choices = index.books.filter((item) => item.slots > 0);
  return (
    choices.find((item) => bookEvents(index, item.code, layersOn).length > 0)?.code ??
    choices[0]?.code ??
    ""
  );
}

/** Severity for a run type, or 0 when the type is unchanged or unknown. */
export function severityOf(index: ComparisonIndex, type: string): number {
  return index.types.find((item) => item.id === type)?.severity ?? 0;
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

/**
 * ``Book chapter:verse`` or ``Book chapter:verse–chapter:verse``.
 * Used by a run's heading and by an event selected from a ribbon or a row.
 */
export function verseTitle(name: string, span: Span): string {
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
