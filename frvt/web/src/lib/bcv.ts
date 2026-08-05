/**
 * Build the single-verse ``ref`` and separate ``part`` for resolve requests.
 * Never embed the part in the ref string; never parse ranges.
 */
export function toResolveArgs(
  book: string,
  chapter: number,
  verse: number,
  part: string | null,
): { ref: string; part: string | null } {
  return { ref: `${book} ${chapter}:${verse}`, part };
}

/** Structured BCV fields owned by one viewer column. */
export interface ColumnBcv {
  book: string;
  chapter: number;
  verse: number;
  part: string | null;
}

/**
 * Build resolve ``ref`` + ``part`` from a column's structured BCV fields.
 * Prefer this helper when reading URL-synced column state.
 */
export function columnToResolveArgs(bcv: ColumnBcv): {
  ref: string;
  part: string | null;
} {
  return toResolveArgs(bcv.book, bcv.chapter, bcv.verse, bcv.part);
}
