import {
  eventForRun,
  runForEvent,
  runKey,
  runPlace,
  runSelectable,
  scopeRuns,
  verseTitle,
  type ScopedRun,
} from "./detail";
import type { ComparisonIndex, IndexedEvent } from "./index";
import type { RunRow } from "../types";

/** What a matrix click or key hands back to the dialog. */
export interface MatrixSelection {
  /** Book code of the cell. */
  bookCode: string;
  /** Chapter of the cell, or null when the cell covers the whole book. */
  chapter: number | null;
  /** True for the book summary cell, which covers every chapter. */
  summary: boolean;
  /**
   * Verse heading for a strip or dot selection, such as ``Exodus 21:1–21:4``.
   * Absent for a matrix or radial cell. The donut and the event list ignore it.
   */
  verseLabel?: string;
  /**
   * One event chosen from a ribbon, a run, or a table row.
   * The column lists only that event.
   */
  eventIndex?: number;
}

/**
 * Whether the cell covers every chapter of its book.
 * A book summary does, and so does a cell that has no chapter number.
 * The donut scope, the heading, and the event list share this rule.
 */
export function coversWholeBook(selection: MatrixSelection): boolean {
  return selection.summary || selection.chapter === null;
}

/** The highlighted run, shared by the ladder, the dot plot, and the table. */
export interface RunHighlight {
  /** Key of the visible run to emphasize, or null when nothing is highlighted. */
  activeKey: string | null;
  /**
   * Select this run, or clear it when the key is already highlighted.
   * A null key is a miss and does nothing.
   */
  onPick: (key: string | null) => void;
  /** Event the column shows. Table rows compare against it. Null when the pin names a chapter. */
  activeEvent: number | null;
  /** Select this event from the table, or clear it when it is already selected. */
  onPickEvent: (event: IndexedEvent) => void;
  /** Report a ribbon or a dot mark while nothing is pinned. */
  onHover: (key: string) => void;
  /** Report a table row while nothing is pinned. */
  onHoverEvent: (event: IndexedEvent) => void;
}

/** Highlighted run and the column pin a detail click produces. */
export interface DetailPick {
  /** Highlighted run, or null. */
  runKey: string | null;
  /** Column pin, or null to clear it. */
  pin: MatrixSelection | null;
}

/** The book, runs, and layers a detail click is resolved against. */
export interface PickContext {
  /** Comparison the runs and events belong to. */
  index: ComparisonIndex;
  /** Every run in the comparison. */
  runs: RunRow[];
  /** Layers currently shown. A hidden layer cannot be selected. */
  layersOn: ReadonlySet<string>;
  /** Book shown in the Details tab. */
  book: string;
}

/**
 * Column pin for one event.
 * The span in ``book`` wins, then side A, then side B. Returns null when the event has no span.
 */
export function eventSelection(
  index: ComparisonIndex,
  event: IndexedEvent,
  book: string | null,
): MatrixSelection | null {
  const span =
    [event.a, event.b].find((side) => side !== null && side[0] === book) ??
    event.a ??
    event.b;
  if (span === null) {
    return null;
  }
  const name = index.byCode.get(span[0])?.name ?? span[0];
  return {
    bookCode: span[0],
    chapter: span[1],
    summary: false,
    verseLabel: verseTitle(name, span),
    eventIndex: event.index,
  };
}

/**
 * Column pin for one run.
 * The run's best-matching event is attached when one overlaps. A run with no place returns null.
 */
export function runSelection(
  index: ComparisonIndex,
  run: ScopedRun,
  layersOn: ReadonlySet<string>,
): MatrixSelection | null {
  const place = runPlace(index, run);
  if (place === null) {
    return null;
  }
  const event = eventForRun(index, run, layersOn);
  return {
    bookCode: place.bookCode,
    chapter: place.chapter,
    summary: false,
    verseLabel: place.title,
    ...(event === null ? {} : { eventIndex: event.index }),
  };
}

/**
 * Run with this key inside the book's scoped runs.
 * Returns undefined when the book does not show that run.
 */
export function findRun(context: PickContext, key: string): ScopedRun | undefined {
  return scopeRuns(context.index, context.runs, context.book, context.layersOn).find(
    (run) => runKey(run) === key,
  );
}

/**
 * Next highlight after a ribbon or dot click.
 * Clicking the highlighted run again clears it. A miss, an unknown key, or an unchanged run
 * returns null so the caller leaves the highlight as it is.
 */
export function pickRun(
  context: PickContext,
  current: DetailPick,
  key: string | null,
): DetailPick | null {
  if (key === null) {
    return null;
  }
  const run = findRun(context, key);
  if (run === undefined || !runSelectable(run)) {
    return null;
  }
  if (key === current.runKey) {
    return {
      runKey: null,
      pin: runPlace(context.index, run) === null ? current.pin : null,
    };
  }
  return {
    runKey: key,
    pin: runSelection(context.index, run, context.layersOn) ?? current.pin,
  };
}

/**
 * Next highlight after a table-row click.
 * Clicking the selected event again clears the pin and the ribbon. A row with no run still pins the event.
 */
export function pickEvent(
  context: PickContext,
  current: DetailPick,
  event: IndexedEvent,
): DetailPick {
  if (current.pin?.eventIndex === event.index) {
    return { runKey: null, pin: null };
  }
  const scoped = scopeRuns(context.index, context.runs, context.book, context.layersOn);
  const run = runForEvent(context.index, scoped, event, context.layersOn);
  return {
    runKey: run === null ? null : runKey(run),
    pin: eventSelection(context.index, event, context.book),
  };
}

/**
 * Column contents for a ribbon or dot hover.
 * An unknown key, or an unchanged run, returns null so the column stays as it is.
 */
export function hoverSelection(
  context: PickContext,
  key: string,
): MatrixSelection | null {
  const run = findRun(context, key);
  if (run === undefined || !runSelectable(run)) {
    return null;
  }
  return runSelection(context.index, run, context.layersOn);
}

/**
 * Event named by a selection, when its layer is switched on.
 * A selection with no event, or an event whose layer is off, returns null so the column
 * falls back to the chapter.
 */
export function pinnedEvent(
  index: ComparisonIndex,
  selection: MatrixSelection | null,
  layersOn: ReadonlySet<string>,
): IndexedEvent | null {
  const event =
    selection?.eventIndex === undefined ? undefined : index.events[selection.eventIndex];
  return event !== undefined && layersOn.has(event.layer) ? event : null;
}
