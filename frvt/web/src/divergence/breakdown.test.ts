import { describe, expect, it } from "vitest";
import { breakdown, type BreakdownScope } from "./breakdown";
import { LAYER_SHORT } from "./taxonomy";
import { dataWarningTip } from "./help";
import { divergenceLauncherEnabled } from "./launcher";
import type { DivergenceReport, EventRow } from "./types";

/** One event on both sides, from ``chapter`` through ``endChapter``. */
const event = (
  type: number,
  book: string,
  verses: number,
  chapter = 1,
  endChapter = chapter,
): EventRow => [
  type,
  [book, chapter, 1, endChapter, 1],
  null,
  [book, chapter, 1, endChapter, 1],
  verses,
  "renumber",
  [],
];

/** A pin that covers every chapter of one book. */
const bookPin = (book: string): BreakdownScope => ({ book, chapter: null });

const report: DivergenceReport = {
  types: [
    { id: "VERSE0_TITLE", severity: 1, layer: "scheme" },
    { id: "BRIDGE", severity: 1, layer: "text" },
    { id: "RENUMBER", severity: 2, layer: "scheme" },
    { id: "MERGE", severity: 3, layer: "scheme" },
    { id: "SPLIT", severity: 3, layer: "scheme" },
    { id: "SEGMENT", severity: 3, layer: "segment" },
    { id: "CHAPTER_MOVE", severity: 4, layer: "scheme" },
    { id: "ORDER_INVERSION", severity: 4, layer: "scheme" },
    { id: "CROSS_BOOK", severity: 4, layer: "scheme" },
    { id: "EXCLUDED", severity: 4, layer: "text" },
    { id: "ONE_SIDED", severity: 4, layer: "scheme" },
    { id: "BOOK_ONE_SIDED", severity: 5, layer: "canon" },
  ],
  comparisons: [
    {
      id: "a-b",
      a: "A",
      b: "B",
      mode: "schemes",
      note: "",
      books: [
        { code: "GEN", name: "Genesis", section: "OT", a: [31], b: [31] },
        { code: "PSA", name: "Psalms", section: "OT", a: [6], b: [6] },
      ],
      events: [event(2, "PSA", 2), event(9, "GEN", 4)],
      runs: [],
      warnings: { a: [], b: [], aCount: 0, bCount: 0 },
    },
  ],
  eventNotes: [],
  org: {},
  catalog: [
    ["GEN", "Genesis", "OT"],
    ["PSA", "Psalms", "OT"],
  ],
  sides: [
    ["a", "A", "legacy", false, false],
    ["b", "B", "source", false, false],
  ],
  engineVersion: "1",
  computedAt: "",
};

const allOn = { scheme: true, segment: true, text: true, canon: true };

/** Copy the fixture with a different event list. */
function withEvents(events: EventRow[]): DivergenceReport {
  const comparison = report.comparisons[0];
  if (comparison === undefined) {
    throw new Error("Fixture is missing its comparison.");
  }
  return { ...report, comparisons: [{ ...comparison, events }] };
}

describe("breakdown", () => {
  it("counts every layer when nothing is pinned", () => {
    const chart = breakdown(report, null, allOn);
    expect(chart.selectionStats).toBeNull();
    expect(chart.types.map((item) => item.value)).toEqual([1, 1]);
    expect(
      chart.layerStats.map((item) => item.percent).reduce((sum, value) => sum + value, 0),
    ).toBeCloseTo(100);
    expect(chart.layerStats.map((item) => item.label)).toEqual([
      "Numbering",
      "Verse segments",
      "Bridges & omissions",
      "Single-sided books",
    ]);
    expect(LAYER_SHORT.text).toBe("bridge or omission");
    expect(LAYER_SHORT.canon).toBe("one-sided book");
  });

  it("names a one-sided verse on the donut and keeps the book type's catalog name", () => {
    const oneSided = report.types.findIndex((type) => type.id === "ONE_SIDED");
    const bookOneSided = report.types.findIndex((type) => type.id === "BOOK_ONE_SIDED");
    const chart = breakdown(
      withEvents([event(oneSided, "GEN", 1), event(bookOneSided, "GEN", 1)]),
      bookPin("GEN"),
      allOn,
    );
    expect(chart.types.map((item) => item.label)).toEqual([
      "Single-sided verse",
      "Book on one side only",
    ]);
  });

  it("limits the rings to the pinned book", () => {
    const chart = breakdown(report, bookPin("PSA"), allOn);
    expect(chart.types).toEqual([
      expect.objectContaining({ label: "Renumbered run", value: 1, percent: 100 }),
    ]);
  });

  it("keeps layer toggles on the whole comparison when a book is pinned", () => {
    const chart = breakdown(report, bookPin("GEN"), { ...allOn, text: false });
    expect(chart.layers).toEqual([]);
    expect(chart.types).toEqual([]);
    expect(chart.layerStats.find((item) => item.id === "scheme")?.count).toBe(1);
    expect(chart.layerStats.find((item) => item.id === "text")?.count).toBe(1);
    expect(chart.selectionStats?.find((item) => item.id === "text")?.count).toBe(1);
    expect(chart.selectionStats?.find((item) => item.id === "text")?.percent).toBe(100);
    expect(
      chart.layerStats.map((item) => item.percent).reduce((sum, value) => sum + value, 0),
    ).toBeCloseTo(100);
  });

  it("limits a chapter pin to that chapter and a book pin to every chapter", () => {
    const scoped = withEvents([event(2, "PSA", 1, 1), event(9, "PSA", 1, 2)]);
    const chapter = breakdown(scoped, { book: "PSA", chapter: 1 }, allOn);
    const book = breakdown(scoped, bookPin("PSA"), allOn);
    expect(chapter.types.map((item) => item.label)).toEqual(["Renumbered run"]);
    expect(chapter.selectionStats?.find((item) => item.id === "text")?.count).toBe(0);
    expect(book.selectionStats?.find((item) => item.id === "scheme")?.count).toBe(1);
    expect(book.selectionStats?.find((item) => item.id === "text")?.count).toBe(1);
    expect(
      book.selectionStats
        ?.map((item) => item.percent)
        .reduce((sum, value) => sum + value, 0),
    ).toBeCloseTo(100);
  });

  it("counts a multi-chapter span once for each chapter and once for the book", () => {
    const scoped = withEvents([event(2, "PSA", 3, 1, 2)]);
    const first = breakdown(scoped, { book: "PSA", chapter: 1 }, allOn);
    const second = breakdown(scoped, { book: "PSA", chapter: 2 }, allOn);
    const book = breakdown(scoped, bookPin("PSA"), allOn);
    expect(first.selectionStats?.find((item) => item.id === "scheme")?.count).toBe(1);
    expect(second.selectionStats?.find((item) => item.id === "scheme")?.count).toBe(1);
    expect(book.selectionStats?.find((item) => item.id === "scheme")?.count).toBe(1);
  });

  it("matches a chapter from the side that has a span", () => {
    const oneSide: EventRow = [2, null, null, ["GEN", 4, 1, 4, 1], 1, "renumber", []];
    const chart = breakdown(withEvents([oneSide]), { book: "GEN", chapter: 4 }, allOn);
    expect(chart.selectionStats?.find((item) => item.id === "scheme")?.count).toBe(1);
  });

  it("ignores a span that exists only on the org side", () => {
    const orgOnly: EventRow = [2, null, ["PSA", 1, 1, 1, 1], null, 1, "renumber", []];
    const chart = breakdown(withEvents([orgOnly]), bookPin("PSA"), allOn);
    expect(chart.types).toEqual([]);
    expect(chart.selectionStats?.find((item) => item.id === "scheme")?.count).toBe(0);
  });

  it("returns the full totals after the selection is cleared", () => {
    const pinned = breakdown(report, bookPin("PSA"), allOn);
    const cleared = breakdown(report, null, allOn);
    expect(pinned.types).toHaveLength(1);
    expect(pinned.selectionStats).not.toBeNull();
    expect(cleared.types).toHaveLength(2);
    expect(cleared.selectionStats).toBeNull();
  });

  it("excludes a hidden layer from the rings but keeps its toggle count", () => {
    const chart = breakdown(report, null, { ...allOn, text: false });
    expect(chart.types.map((item) => item.label)).toEqual(["Renumbered run"]);
    expect(chart.layerStats.find((item) => item.id === "text")?.count).toBe(1);
  });
});

describe("divergenceLauncherEnabled", () => {
  it("requires two resolvable sides and ignores a stale scheme id", () => {
    expect(divergenceLauncherEnabled(true, null, null, [], [])).toBe(true);
    expect(
      divergenceLauncherEnabled(true, "missing", null, [{ scheme_id: "known" }], []),
    ).toBe(false);
    expect(divergenceLauncherEnabled(false, null, null, [], [])).toBe(false);
  });
});

describe("dataWarningTip", () => {
  it("includes the unequal-ranges detail when that note is present", () => {
    const detail =
      "The two ranges have different lengths and were aligned verse by verse. Treat the pairing as approximate.";
    expect(dataWarningTip([detail])).toContain(detail);
  });
});
