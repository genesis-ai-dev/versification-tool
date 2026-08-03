import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api/spans", () => ({
  listSpans: vi.fn(),
}));

import { listSpans } from "../api/spans";
import {
  buildSelectionUrlPatch,
  canonicalColumnBcv,
  columnBcvEqual,
  loadCanonicalColumnBcv,
  selectionUrlPatchDiffers,
} from "./selectionCommit";
import { spanCacheKey, type SpanCache } from "./viewerCache";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildSelectionUrlPatch", () => {
  it("commits drive and follower BCV in one patch when drive is left", () => {
    expect(
      buildSelectionUrlPatch(
        "left",
        { book: "GEN", chapter: 1, verse: 5, part: null },
        { book: "GEN", chapter: 1, verse: 5, part: null },
      ),
    ).toEqual({
      drive: "left",
      leftBcv: { book: "GEN", chapter: 1, verse: 5, part: null },
      rightBcv: { book: "GEN", chapter: 1, verse: 5, part: null },
    });
  });

  it("commits only drive BCV when follower target is absent", () => {
    expect(
      buildSelectionUrlPatch(
        "right",
        { book: "GEN", chapter: 1, verse: 5, part: null },
        null,
      ),
    ).toEqual({
      drive: "right",
      rightBcv: { book: "GEN", chapter: 1, verse: 5, part: null },
    });
  });
});

describe("selectionUrlPatchDiffers", () => {
  const baseUrl = {
    left: "l",
    right: "r",
    leftBcv: { book: "GEN", chapter: 1, verse: 7, part: null },
    rightBcv: { book: "GEN", chapter: 1, verse: 7, part: null },
    leftVers: null,
    rightVers: null,
    drive: "left" as const,
    mapMode: "current" as const,
  };

  it("returns false when the patch matches the current URL", () => {
    expect(
      selectionUrlPatchDiffers(
        baseUrl,
        buildSelectionUrlPatch(
          "left",
          { book: "GEN", chapter: 1, verse: 7, part: null },
          { book: "GEN", chapter: 1, verse: 7, part: null },
        ),
      ),
    ).toBe(false);
  });

  it("returns true when follower BCV would change", () => {
    expect(
      selectionUrlPatchDiffers(
        baseUrl,
        buildSelectionUrlPatch(
          "right",
          { book: "GEN", chapter: 1, verse: 5, part: null },
          { book: "GEN", chapter: 1, verse: 5, part: null },
        ),
      ),
    ).toBe(true);
  });
});

describe("columnBcvEqual", () => {
  it("treats null parts as equivalent", () => {
    expect(
      columnBcvEqual(
        { book: "GEN", chapter: 1, verse: 1, part: null },
        { book: "GEN", chapter: 1, verse: 1, part: null },
      ),
    ).toBe(true);
  });
});

describe("canonicalColumnBcv", () => {
  const combined = {
    book: "JHN",
    chapter: 4,
    verse: 1,
    part: null,
    seq: 5,
    verse_label: "1,2",
    verse_range: "JHN 4:1-2",
  };

  it("snaps a covered verse to the milestone anchor when spans are cached", () => {
    const cache: SpanCache = new Map();
    cache.set(spanCacheKey("t1", "JHN", 4), [combined]);
    expect(
      canonicalColumnBcv(cache, "t1", { book: "JHN", chapter: 4, verse: 2, part: null }),
    ).toEqual({ book: "JHN", chapter: 4, verse: 1, part: null });
  });

  it("returns the input BCV when an exact span exists", () => {
    const cache: SpanCache = new Map();
    cache.set(spanCacheKey("t1", "GEN", 1), [
      { book: "GEN", chapter: 1, verse: 5, part: null, seq: 7 },
    ]);
    const bcv = { book: "GEN", chapter: 1, verse: 5, part: null };
    expect(canonicalColumnBcv(cache, "t1", bcv)).toEqual(bcv);
  });
});

describe("loadCanonicalColumnBcv", () => {
  const combined = {
    book: "JHN",
    chapter: 4,
    verse: 1,
    part: null,
    seq: 5,
    verse_label: "1,2",
    verse_range: "JHN 4:1-2",
  };

  it("loads spans then snaps when the chapter is not cached", async () => {
    vi.mocked(listSpans).mockResolvedValueOnce({ items: [combined] });
    const cache: SpanCache = new Map();
    const snapped = await loadCanonicalColumnBcv(cache, "t1", {
      book: "JHN",
      chapter: 4,
      verse: 2,
      part: null,
    });
    expect(snapped).toEqual({ book: "JHN", chapter: 4, verse: 1, part: null });
    expect(cache.get(spanCacheKey("t1", "JHN", 4))).toEqual([combined]);
  });

  it("uses cached spans without refetching when the chapter is already loaded", async () => {
    const cache: SpanCache = new Map();
    cache.set(spanCacheKey("t1", "JHN", 4), [combined]);
    const snapped = await loadCanonicalColumnBcv(cache, "t1", {
      book: "JHN",
      chapter: 4,
      verse: 2,
      part: null,
    });
    expect(snapped).toEqual({ book: "JHN", chapter: 4, verse: 1, part: null });
    expect(listSpans).not.toHaveBeenCalled();
  });
});
