/** Wire types for a stored divergence report. Field names match the engine payload. */

export interface DivergenceStatus {
  /** Report row id. */
  id: string;
  /** pending, running, ready, or failed. */
  status: string;
  /** True when a running job has not updated its heartbeat in time. */
  stalled: boolean;
  /** Name of the stage last reported. */
  stage: string | null;
  /** One-based index of that stage. */
  stage_index: number;
  /** How many stages the job walks. */
  stage_count: number;
  /** Verses finished in the current stage, when the stage reports them. */
  completed: number;
  /** Verses in the current stage, when the stage reports them. */
  total: number;
  /** Failure text when status is failed. */
  error: string | null;
}

/** ``[book, chapterStart, verseStart, chapterEnd, verseEnd]``. */
export type Span = [string, number, number, number, number];

/**
 * One encoded event.
 * Optional segment endpoints are present only for segment events.
 */
export type EventRow = [
  number,
  Span | null,
  Span | null,
  Span | null,
  number,
  string,
  string[],
  string[]?,
  string[]?,
];

/** ``[a, org, b, typeIndex or -1, flagLetters, excludedA, excludedB]``. */
export type RunRow = [
  Span | null,
  Span | null,
  Span | null,
  number,
  string,
  string,
  string,
];

/** One book row inside a comparison. */
export interface ComparisonBook {
  code: string;
  name: string;
  section: string;
  a: number[] | null;
  b: number[] | null;
}

/** The single comparison object inside a payload. */
export interface Comparison {
  id: string;
  a: string;
  b: string;
  mode: string;
  note: string;
  books: ComparisonBook[];
  events: EventRow[];
  runs: RunRow[];
  warnings: { a: string[]; b: string[]; aCount: number; bCount: number };
}

/** Type row. ``layer`` is scheme, segment, text, or canon. */
export interface TypeRow {
  id: string;
  severity: number;
  layer: string;
}

/** ``[side, schemeName, fidelity, multiTarget, textFacts]``. */
export type SideRow = [string, string, string, boolean, boolean];

/** ``[eventIndex, side, code, detail]``. */
export type EventNote = [number, string, string, string];

/** Decoded comparison returned by the data route. */
export interface DivergenceReport {
  types: TypeRow[];
  comparisons: Comparison[];
  eventNotes: EventNote[];
  sides: SideRow[];
  /** Org maxima by book, used as the middle ladder axis. */
  org: Record<string, number[]>;
  /** USFM catalog rows ``[code, name, section]`` in book order. */
  catalog: [string, string, string][];
  engineVersion: string;
  computedAt: string;
}
