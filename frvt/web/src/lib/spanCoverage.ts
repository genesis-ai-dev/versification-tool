/** Span fields used for BCV coverage matching in column scroll. */
export interface CoverageSpan {
  book: string;
  chapter: number;
  verse: number;
  part: string | null;
  seq: number;
  verse_label?: string | null;
  verse_range?: string | null;
}

/** Parsed same-chapter verse range from normalized ``verse_range`` strings. */
interface SimpleVerseRange {
  book: string;
  chapter: number;
  start: number;
  end: number;
}

const SIMPLE_VERSE_RANGE = /^([A-Z0-9]{3}) (\d+):(\d+)-(\d+)$/;

/**
 * Parse a normalized ``BOOK C:start-end`` range emitted by ingest.
 * Returns null when the string is not a simple chapter-local range.
 */
function parseSimpleVerseRange(range: string): SimpleVerseRange | null {
  const match = SIMPLE_VERSE_RANGE.exec(range);
  if (!match) {
    return null;
  }
  return {
    book: match[1],
    chapter: Number(match[2]),
    start: Number(match[3]),
    end: Number(match[4]),
  };
}

/**
 * Return whether ``span`` covers ``bcv`` by exact coordinates or ``verse_range``.
 */
export function spanCoversBcv(
  span: CoverageSpan,
  bcv: { book: string; chapter: number; verse: number; part?: string | null },
): boolean {
  if (span.book !== bcv.book || span.chapter !== bcv.chapter) {
    return false;
  }
  const bcvPart = bcv.part ?? "";
  const spanPart = span.part ?? "";
  if (span.verse === bcv.verse && spanPart === bcvPart) {
    return true;
  }
  if (!span.verse_range || bcvPart !== "") {
    return false;
  }
  const parsed = parseSimpleVerseRange(span.verse_range);
  if (!parsed) {
    return false;
  }
  return (
    parsed.book === bcv.book &&
    parsed.chapter === bcv.chapter &&
    bcv.verse >= parsed.start &&
    bcv.verse <= parsed.end
  );
}

/**
 * Find the scroll ``seq`` for ``bcv``, matching exact spans first then coverage.
 */
export function seqForBcvWithCoverage(
  spans: readonly CoverageSpan[],
  bcv: { book: string; chapter: number; verse: number; part?: string | null } | null | undefined,
): number | null {
  if (!bcv) {
    return null;
  }
  const exact = spans.find(
    (span) =>
      span.book === bcv.book &&
      span.chapter === bcv.chapter &&
      span.verse === bcv.verse &&
      (span.part ?? "") === (bcv.part ?? ""),
  );
  if (exact) {
    return exact.seq;
  }
  const covering = spans.find((span) => spanCoversBcv(span, bcv));
  return covering?.seq ?? null;
}

/**
 * Return the stored anchor BCV when ``bcv`` is covered by a combined milestone span.
 */
export function canonicalBcvFromSpans(
  spans: readonly CoverageSpan[],
  bcv: { book: string; chapter: number; verse: number; part?: string | null },
): { book: string; chapter: number; verse: number; part: string | null } | null {
  const exact = spans.find(
    (span) =>
      span.book === bcv.book &&
      span.chapter === bcv.chapter &&
      span.verse === bcv.verse &&
      (span.part ?? "") === (bcv.part ?? ""),
  );
  if (exact) {
    return null;
  }
  const covering = spans.find((span) => spanCoversBcv(span, bcv));
  if (!covering) {
    return null;
  }
  return {
    book: covering.book,
    chapter: covering.chapter,
    verse: covering.verse,
    part: covering.part,
  };
}
