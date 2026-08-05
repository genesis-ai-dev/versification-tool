import { describe, expect, it } from "vitest";
import {
  canonicalBcvFromSpans,
  spanCoversBcv,
  seqForBcvWithCoverage,
} from "../lib/spanCoverage";

describe("spanCoverage", () => {
  const combined = {
    book: "JHN",
    chapter: 4,
    verse: 1,
    part: null,
    seq: 5,
    verse_label: "1,2",
    verse_range: "JHN 4:1-2",
  };

  it("covers verses inside verse_range", () => {
    expect(spanCoversBcv(combined, { book: "JHN", chapter: 4, verse: 2 })).toBe(true);
    expect(spanCoversBcv(combined, { book: "JHN", chapter: 4, verse: 3 })).toBe(false);
  });

  it("finds seq via coverage", () => {
    expect(
      seqForBcvWithCoverage([combined], { book: "JHN", chapter: 4, verse: 2, part: null }),
    ).toBe(5);
  });

  it("canonicalizes to anchor BCV", () => {
    expect(
      canonicalBcvFromSpans([combined], { book: "JHN", chapter: 4, verse: 2, part: null }),
    ).toEqual({ book: "JHN", chapter: 4, verse: 1, part: null });
  });
});
