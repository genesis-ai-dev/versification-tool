import { describe, expect, it, vi } from "vitest";
import type { ResolveResult } from "../api/types";
import { ensureFollowerChapter } from "./followerChapter";

describe("cross-chapter follower loading", () => {
  it("loads the follower chapter before returning scroll target coords", async () => {
    const loadChapter = vi.fn(async () => undefined);
    const result: ResolveResult = {
      relation: "one_to_one",
      source_spans: [
        { ref: "GEN 1:1", book: "GEN", chapter: 1, verse: 1, seq: 1, part: null },
      ],
      target_spans: [
        { ref: "GEN 2:5", book: "GEN", chapter: 2, verse: 5, seq: 40, part: null },
      ],
      edges: [],
    };

    const next = await ensureFollowerChapter({
      result,
      followerBook: "GEN",
      followerChapter: 1,
      loadChapter,
    });

    expect(loadChapter).toHaveBeenCalledWith("GEN", 2);
    expect(next).toEqual({
      book: "GEN",
      chapter: 2,
      verse: 5,
      part: null,
      seq: 40,
    });
  });

  it("prefers a stored target when an earlier split target has no sequence", async () => {
    const loadChapter = vi.fn(async () => undefined);
    const next = await ensureFollowerChapter({
      result: {
        relation: "split",
        source_spans: [
          { ref: "GEN 1:1", book: "GEN", chapter: 1, verse: 1, seq: 1, part: null },
        ],
        target_spans: [
          { ref: "GEN 2:4", book: "GEN", chapter: 2, verse: 4, seq: null, part: null },
          { ref: "GEN 2:5", book: "GEN", chapter: 2, verse: 5, seq: 40, part: null },
        ],
        edges: [],
      },
      followerBook: "GEN",
      followerChapter: 1,
      loadChapter,
    });

    expect(next?.verse).toBe(5);
    expect(next?.seq).toBe(40);
  });

  it("does not invent a scroll target for exclude", async () => {
    const loadChapter = vi.fn(async () => undefined);
    const next = await ensureFollowerChapter({
      result: {
        relation: "exclude",
        source_spans: [
          { ref: "GEN 1:1", book: "GEN", chapter: 1, verse: 1, seq: 1, part: null },
        ],
        target_spans: [],
        edges: [],
      },
      followerBook: "GEN",
      followerChapter: 1,
      loadChapter,
    });
    expect(loadChapter).not.toHaveBeenCalled();
    expect(next).toBeNull();
  });
});
