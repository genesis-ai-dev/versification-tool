import { describe, expect, it } from "vitest";
import { breakdown } from "./breakdown";
import { dataWarningTip, displayNote, legacyFidelitySentence } from "./help";
import { divergenceLauncherEnabled } from "./launcher";
import type { DivergenceReport, EventRow } from "./types";

const event = (type: number, book: string, verses: number): EventRow => [
  type,
  [book, 1, 1, 1, 1],
  null,
  [book, 1, 1, 1, 1],
  verses,
  "renumber",
  [],
];

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

describe("breakdown", () => {
  it("counts every layer when nothing is pinned", () => {
    const chart = breakdown(report, null, allOn, false);
    expect(chart.types.map((item) => item.value)).toEqual([1, 1]);
    expect(
      chart.layerStats.map((item) => item.percent).reduce((sum, value) => sum + value, 0),
    ).toBeCloseTo(100);
  });

  it("limits the rings to the pinned book", () => {
    const chart = breakdown(report, "PSA", allOn, true);
    expect(chart.types).toEqual([
      expect.objectContaining({ label: "Renumbered run", value: 2, percent: 100 }),
    ]);
  });

  it("returns the full totals after the selection is cleared", () => {
    const pinned = breakdown(report, "PSA", allOn, false);
    const cleared = breakdown(report, null, allOn, false);
    expect(pinned.types).toHaveLength(1);
    expect(cleared.types).toHaveLength(2);
  });

  it("excludes a hidden layer from the rings but keeps its toggle count", () => {
    const chart = breakdown(report, null, { ...allOn, text: false }, false);
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

describe("displayNote", () => {
  it("emits the legacy sentence when the engine note is empty", () => {
    expect(displayNote("", report.sides)).toBe(legacyFidelitySentence("A"));
  });
});
