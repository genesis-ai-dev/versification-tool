import type { DivergenceReport, EventRow, Span } from "../types";

/** Chart geometry copied from the prototype matrix. */
export const MATRIX = {
  cols: 50,
  cell: 12,
  gap: 2,
  left: 168,
  top: 30,
  secH: 30,
  sumGap: 10,
} as const;

/** One event after the type table has been applied. */
export interface IndexedEvent {
  index: number;
  type: string;
  severity: number;
  layer: string;
  a: Span | null;
  o: Span | null;
  b: Span | null;
  n: number;
  rel: string;
  flags: string[];
  segA?: string;
  segB?: string;
}

/** One book with chapter counts on each side. */
export interface IndexedBook {
  code: string;
  name: string;
  section: string;
  a: number[] | null;
  b: number[] | null;
  aCh: number;
  bCh: number;
  slots: number;
}

/** A matrix or radial row. Section rows have no book. */
export interface ViewRow {
  kind: "sec" | "book";
  section: string;
  book: IndexedBook | null;
  part: number;
  parts: number;
}

/** One keyboard target in the matrix. */
export interface MatrixTarget {
  bookCode: string;
  chapter: number;
  row: number;
  col: number;
  x: number;
  y: number;
}

/** What a chapter cell should draw. */
export interface CellState {
  events: IndexedEvent[];
  severity: number;
  deviance: number;
  count: number;
  oneSided: boolean;
  approximate: boolean;
  warning: boolean;
  inA: boolean;
  inB: boolean;
}

/** Lookup tables shared by the matrix, radial chart, and book detail. */
export interface ComparisonIndex {
  books: IndexedBook[];
  byCode: Map<string, IndexedBook>;
  events: IndexedEvent[];
  cells: Map<string, IndexedEvent[]>;
  oneSidedBooks: Set<string>;
  order: Map<string, number>;
  types: DivergenceReport["types"];
}

/**
 * Index one report for the charts.
 * Chapter cells list every event whose span covers that chapter.
 */
export function buildIndex(report: DivergenceReport): ComparisonIndex {
  const comparison = report.comparisons[0];
  const order = new Map(report.catalog?.map((row, index) => [row[0], index]) ?? []);
  const books: IndexedBook[] = (comparison?.books ?? []).map((book) => ({
    code: book.code,
    name: book.name,
    section: book.section,
    a: book.a,
    b: book.b,
    aCh: book.a?.length ?? 0,
    bCh: book.b?.length ?? 0,
    slots: Math.max(book.a?.length ?? 0, book.b?.length ?? 0),
  }));
  books.sort((left, right) => bookOrder(order, left.code) - bookOrder(order, right.code));
  const events = (comparison?.events ?? []).map((row, index) =>
    decodeEvent(report, row, index),
  );
  const cells = new Map<string, IndexedEvent[]>();
  for (const event of events) {
    for (const span of [event.a, event.b]) {
      if (span === null) {
        continue;
      }
      const [book, start, , end] = span;
      for (let chapter = start; chapter <= Math.max(start, end); chapter += 1) {
        const key = `${book}:${chapter}`;
        const list = cells.get(key) ?? [];
        if (!list.includes(event)) {
          list.push(event);
        }
        cells.set(key, list);
      }
    }
  }
  const oneSidedBooks = new Set(
    events
      .filter((event) => event.type === "BOOK_ONE_SIDED")
      .map((event) => (event.a ?? event.b)?.[0])
      .filter((code): code is string => code !== undefined),
  );
  return {
    books,
    byCode: new Map(books.map((book) => [book.code, book])),
    events,
    cells,
    oneSidedBooks,
    order,
    types: report.types,
  };
}

/** Catalog order, with unknown codes after the catalog. */
export function bookOrder(order: Map<string, number>, code: string): number {
  const known = order.get(code);
  if (known !== undefined) {
    return known;
  }
  return 1000 + [...code].reduce((sum, character) => sum + character.charCodeAt(0), 0);
}

/** Events in one chapter that belong to a switched-on layer. */
export function cellEvents(
  index: ComparisonIndex,
  book: string,
  chapter: number,
  layersOn: ReadonlySet<string>,
): IndexedEvent[] {
  return (index.cells.get(`${book}:${chapter}`) ?? []).filter((event) =>
    layersOn.has(event.layer),
  );
}

/** Events in a book, in payload order, limited to switched-on layers. */
export function bookEvents(
  index: ComparisonIndex,
  book: string,
  layersOn: ReadonlySet<string>,
): IndexedEvent[] {
  const found = index.byCode.get(book);
  if (found === undefined) {
    return [];
  }
  const seen = new Set<IndexedEvent>();
  for (let chapter = 1; chapter <= found.slots; chapter += 1) {
    for (const event of cellEvents(index, book, chapter, layersOn)) {
      seen.add(event);
    }
  }
  return [...seen].sort((left, right) => left.index - right.index);
}

/**
 * Severity and coverage for one chapter.
 * Deviance mixes severity with the share of the chapter the events cover.
 */
export function cellState(
  index: ComparisonIndex,
  book: IndexedBook,
  chapter: number,
  layersOn: ReadonlySet<string>,
): CellState {
  const events = cellEvents(index, book.code, chapter, layersOn);
  const bookOnly = events.filter((event) => event.type === "BOOK_ONE_SIDED");
  const rest = events.filter((event) => event.type !== "BOOK_ONE_SIDED");
  const severity = rest.reduce((max, event) => Math.max(max, event.severity), 0);
  const chapterVerses =
    Math.max(book.a?.[chapter - 1] ?? 0, book.b?.[chapter - 1] ?? 0) || 1;
  const affected = rest.reduce((sum, event) => sum + (event.n || 0), 0);
  const extent = Math.min(1, affected / chapterVerses);
  const deviance = severity ? Math.min(1, 0.3 * (severity / 4) + 0.7 * extent) : 0;
  const inA = chapter <= book.aCh;
  const inB = chapter <= book.bCh;
  return {
    events,
    severity,
    deviance,
    count: rest.length,
    oneSided: !(inA && inB) || bookOnly.length > 0,
    approximate: rest.some((event) => event.flags.includes("approximate")),
    warning: events.some((event) => event.flags.includes("dataWarning")),
    inA,
    inB,
  };
}

/** Whole-book summary used by the book cell and the inner radial ring. */
export function bookState(
  index: ComparisonIndex,
  book: IndexedBook,
  layersOn: ReadonlySet<string>,
): CellState {
  const events = bookEvents(index, book.code, layersOn);
  const rest = events.filter((event) => event.type !== "BOOK_ONE_SIDED");
  const severity = rest.reduce((max, event) => Math.max(max, event.severity), 0);
  const sideA = book.a ?? [];
  const sideB = book.b ?? [];
  const chapters = Math.max(sideA.length, sideB.length);
  let verses = 0;
  for (let indexChapter = 0; indexChapter < chapters; indexChapter += 1) {
    verses += Math.max(sideA[indexChapter] ?? 0, sideB[indexChapter] ?? 0);
  }
  const affected = rest.reduce((sum, event) => sum + (event.n || 0), 0);
  const deviance = severity
    ? Math.min(1, 0.3 * (severity / 4) + 0.7 * Math.min(1, affected / (verses || 1)))
    : 0;
  return {
    events,
    severity,
    deviance,
    count: rest.length,
    oneSided: !(book.aCh && book.bCh),
    approximate: rest.some((event) => event.flags.includes("approximate")),
    warning: events.some((event) => event.flags.includes("dataWarning")),
    inA: book.aCh > 0,
    inB: book.bCh > 0,
  };
}

/** True when a chapter should merge into the unchanged bar. */
export function isNeutral(state: CellState): boolean {
  return (
    !state.severity &&
    !state.oneSided &&
    !state.warning &&
    !state.approximate &&
    state.inA &&
    state.inB
  );
}

/** Matrix rows, omitting empty books and one-sided books when that layer is off. */
export function visibleRows(
  index: ComparisonIndex,
  layersOn: ReadonlySet<string>,
): ViewRow[] {
  const rows: ViewRow[] = [];
  let lastSection: string | null = null;
  for (const book of index.books) {
    if (!book.slots || bookHidden(index, book, layersOn)) {
      continue;
    }
    if (book.section !== lastSection) {
      rows.push({ kind: "sec", section: book.section, book: null, part: 0, parts: 0 });
      lastSection = book.section;
    }
    const parts = Math.ceil(book.slots / MATRIX.cols);
    for (let part = 0; part < parts; part += 1) {
      rows.push({ kind: "book", section: book.section, book, part, parts });
    }
  }
  return rows;
}

/** Keyboard targets in reading order, with the coordinates the focus ring uses. */
export function matrixTargets(rows: ViewRow[]): MatrixTarget[] {
  const pitch = MATRIX.cell + MATRIX.gap;
  const x0 = MATRIX.left + MATRIX.cell + MATRIX.sumGap;
  let y = MATRIX.top;
  let rowIndex = -1;
  const targets: MatrixTarget[] = [];
  for (const row of rows) {
    if (row.kind === "sec" || row.book === null) {
      y += MATRIX.secH;
      continue;
    }
    rowIndex += 1;
    const start = row.part * MATRIX.cols + 1;
    const end = Math.min(row.book.slots, (row.part + 1) * MATRIX.cols);
    for (let chapter = start; chapter <= end; chapter += 1) {
      targets.push({
        bookCode: row.book.code,
        chapter,
        row: rowIndex,
        col: chapter - start,
        x: x0 + (chapter - start) * pitch,
        y,
      });
    }
    y += pitch;
  }
  return targets;
}

/**
 * Move the matrix focus by one row or column.
 * A vertical move lands on the closest chapter in the destination row.
 */
export function moveFocus(
  targets: MatrixTarget[],
  focus: number | null,
  rowDelta: number,
  colDelta: number,
): number | null {
  if (targets.length === 0) {
    return null;
  }
  if (focus === null) {
    return 0;
  }
  const current = targets[focus];
  if (current === undefined) {
    return 0;
  }
  if (colDelta !== 0) {
    const next = targets.findIndex(
      (target) => target.row === current.row && target.col === current.col + colDelta,
    );
    return next >= 0 ? next : focus;
  }
  const destination = targets
    .map((target, index) => ({ target, index }))
    .filter((item) => item.target.row === current.row + rowDelta);
  if (destination.length === 0) {
    return focus;
  }
  return destination.reduce((best, item) =>
    Math.abs(item.target.col - current.col) < Math.abs(best.target.col - current.col)
      ? item
      : best,
  ).index;
}

/** Whether a one-sided book is hidden because the canon layer is off. */
function bookHidden(
  index: ComparisonIndex,
  book: IndexedBook,
  layersOn: ReadonlySet<string>,
): boolean {
  return !layersOn.has("canon") && index.oneSidedBooks.has(book.code);
}

/** Attach type, layer, and flags to one encoded event. */
function decodeEvent(
  report: DivergenceReport,
  row: EventRow,
  index: number,
): IndexedEvent {
  const type = report.types[row[0]];
  return {
    index,
    type: type?.id ?? "RENUMBER",
    severity: type?.severity ?? 1,
    layer: type?.layer ?? "scheme",
    a: row[1],
    o: row[2],
    b: row[3],
    n: row[4],
    rel: row[5],
    flags: row[6] ?? [],
    segA: row[7],
    segB: row[8],
  };
}
