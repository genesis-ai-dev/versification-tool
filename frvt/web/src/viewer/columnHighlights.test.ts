import { describe, expect, it } from "vitest";
import type { ResolveResult } from "../api/types";
import {
  columnHighlightKeys,
  highlightKeysForBcv,
  highlightKeysForColumnSpans,
  resolveMatchesDriveSelection,
  resolveResultApplies,
} from "./columnHighlights";

const gen17Result: ResolveResult = {
  relation: "one_to_one",
  source_spans: [
    { ref: "GEN 1:7", book: "GEN", chapter: 1, verse: 7, seq: 7, part: null },
  ],
  target_spans: [
    { ref: "GEN 1:7", book: "GEN", chapter: 1, verse: 7, seq: 7, part: null },
  ],
  edges: [],
};

describe("resolveMatchesDriveSelection", () => {
  it("matches when a source ref equals the drive BCV", () => {
    expect(
      resolveMatchesDriveSelection(gen17Result, {
        book: "GEN",
        chapter: 1,
        verse: 7,
        part: null,
      }),
    ).toBe(true);
  });

  it("rejects a stale result after the drive BCV changes", () => {
    expect(
      resolveMatchesDriveSelection(gen17Result, {
        book: "GEN",
        chapter: 1,
        verse: 5,
        part: null,
      }),
    ).toBe(false);
  });
});

describe("resolveResultApplies", () => {
  it("rejects resolve produced under a different drive side", () => {
    expect(
      resolveResultApplies(gen17Result, "left", "right", {
        book: "GEN",
        chapter: 1,
        verse: 7,
        part: null,
      }),
    ).toBe(false);
  });

  it("accepts resolve when drive side and BCV still match", () => {
    expect(
      resolveResultApplies(gen17Result, "left", "left", {
        book: "GEN",
        chapter: 1,
        verse: 7,
        part: null,
      }),
    ).toBe(true);
  });
});

describe("highlightKeysForColumnSpans", () => {
  it("does not apply another column's seq to the wrong verse row", () => {
    const livreSpans = [
      {
        id: "1",
        seq: 7,
        book: "GEN",
        chapter: 1,
        verse: 3,
        part: null,
        content: "v3",
        verse_label: null,
        verse_range: null,
      },
      {
        id: "2",
        seq: 8,
        book: "GEN",
        chapter: 1,
        verse: 7,
        part: null,
        content: "v7",
        verse_label: null,
        verse_range: null,
      },
    ];
    const malayalamTarget = [
      { ref: "GEN 1:7", book: "GEN", chapter: 1, verse: 7, seq: 7, part: null },
    ];
    expect(highlightKeysForColumnSpans(livreSpans, malayalamTarget)).toEqual(
      new Set(["seq:8", "ref:GEN 1:7|"]),
    );
  });
});

describe("columnHighlightKeys", () => {
  const spans = [
    {
      id: "1",
      seq: 5,
      book: "GEN",
      chapter: 1,
      verse: 5,
      part: null,
      content: "v5",
      verse_label: null,
      verse_range: null,
    },
    {
      id: "2",
      seq: 7,
      book: "GEN",
      chapter: 1,
      verse: 7,
      part: null,
      content: "v7",
      verse_label: null,
      verse_range: null,
    },
  ];

  it("highlights the drive column from URL BCV before resolve returns", () => {
    const keys = columnHighlightKeys(
      "right",
      "right",
      { book: "GEN", chapter: 1, verse: 5, part: null },
      { book: "GEN", chapter: 1, verse: 5, part: null },
      spans,
      gen17Result,
      "left",
      true,
    );
    expect(keys).toEqual(new Set(["seq:5"]));
  });

  it("clears follower highlights when resolve drive side is stale", () => {
    const keys = columnHighlightKeys(
      "left",
      "right",
      { book: "GEN", chapter: 1, verse: 7, part: null },
      { book: "GEN", chapter: 1, verse: 5, part: null },
      spans,
      gen17Result,
      "left",
      true,
    );
    expect(keys).toEqual(new Set());
  });

  it("keeps committed highlights only while selection is unsettled", () => {
    const keys = columnHighlightKeys(
      "left",
      "left",
      { book: "GEN", chapter: 1, verse: 7, part: null },
      { book: "GEN", chapter: 1, verse: 7, part: null },
      spans,
      gen17Result,
      "left",
      false,
    );
    expect(keys).toEqual(new Set(["seq:7"]));
  });
});

describe("highlightKeysForBcv", () => {
  it("prefers seq keys from loaded spans", () => {
    const keys = highlightKeysForBcv(
      [
        {
          id: "1",
          seq: 3,
          book: "GEN",
          chapter: 1,
          verse: 3,
          part: null,
          content: "",
          verse_label: null,
          verse_range: null,
        },
      ],
      { book: "GEN", chapter: 1, verse: 3, part: null },
    );
    expect(keys).toEqual(new Set(["seq:3"]));
  });
});
