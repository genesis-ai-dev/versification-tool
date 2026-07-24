import type { ResolveResult } from "../api/types";

/** Structured follower BCV derived from a resolve primary target. */
export interface FollowerTarget {
  book: string;
  chapter: number;
  verse: number;
  part: string | null;
  /** Stored sequence used for scrolling when the target exists in the translation. */
  seq: number | null;
}

/**
 * Ensure the follower chapter is loaded before scrolling after resolve.
 * Returns null for exclude (no invented scroll target).
 */
export async function ensureFollowerChapter(args: {
  result: ResolveResult;
  followerBook: string | null;
  followerChapter: number | null;
  loadChapter: (book: string, chapter: number) => Promise<void>;
}): Promise<FollowerTarget | null> {
  if (args.result.relation === "exclude" || args.result.target_spans.length === 0) {
    return null;
  }
  const primary =
    args.result.target_spans.find((span) => span.seq !== null) ??
    args.result.target_spans[0];
  if (args.followerBook !== primary.book || args.followerChapter !== primary.chapter) {
    await args.loadChapter(primary.book, primary.chapter);
  }
  return {
    book: primary.book,
    chapter: primary.chapter,
    verse: primary.verse,
    part: primary.part,
    seq: primary.seq,
  };
}
