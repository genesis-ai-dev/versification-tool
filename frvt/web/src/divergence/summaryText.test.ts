import { describe, expect, it } from "vitest";
import { buildIndex } from "./model/index";
import { summaryCounts, summarySentence } from "./summaryText";
import type { DivergenceReport, EventRow } from "./types";

/** One event in ``book``. Type 0 is RENUMBER and type 1 is BOOK_ONE_SIDED in this fixture. */
function event(type: number, book: string): EventRow {
  const span = [book, 1, 1, 1, 1] as EventRow[1];
  return [type, span, null, span, 1, "1:1", []];
}

const report: DivergenceReport = {
  types: [
    { id: "RENUMBER", severity: 2, layer: "scheme" },
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
        { code: "GEN", name: "Genesis", section: "OT", a: [1], b: [1] },
        { code: "TOB", name: "Tobit", section: "DC", a: [1], b: null },
      ],
      events: [event(0, "GEN"), event(0, "GEN"), event(1, "TOB")],
      runs: [],
      warnings: { a: ["one", "two", "three"], b: ["one", "two"], aCount: 3, bCount: 2 },
    },
  ],
  eventNotes: [],
  org: {},
  catalog: [],
  sides: [],
  engineVersion: "1",
  computedAt: "",
};

describe("summaryCounts", () => {
  const index = buildIndex(report);

  it("counts events and books in the switched-on layers", () => {
    expect(summaryCounts(index, new Set(["scheme", "canon"]))).toEqual({
      events: 3,
      books: 2,
      layers: [
        { id: "scheme", count: 2 },
        { id: "canon", count: 1 },
      ],
    });
  });

  it("lists every switched-on layer that has events", () => {
    expect(
      summarySentence(index, new Set(["scheme", "canon"]), { a: "A", b: "B" }, "en-US"),
    ).toBe(
      "B differs from A in 3 events across 2 books (2 numbering, 1 one-sided book).",
    );
  });

  it("names both sides and uses the singular for one event", () => {
    expect(summarySentence(index, new Set(["canon"]), { a: "A", b: "B" }, "en-US")).toBe(
      "B differs from A in 1 event across 1 book (1 one-sided book).",
    );
  });

  it("drops a layer that is switched off", () => {
    expect(summaryCounts(index, new Set(["canon"]))).toEqual({
      events: 1,
      books: 1,
      layers: [{ id: "canon", count: 1 }],
    });
  });
});
