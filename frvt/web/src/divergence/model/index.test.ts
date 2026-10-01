import { describe, expect, it } from "vitest";
import type { DivergenceReport, EventRow } from "../types";
import { drawDotPlot, ladderWindow } from "./detail";
import { buildIndex, cellState, matrixTargets, moveFocus, visibleRows } from "./index";

const event = (type: number, book: string): EventRow => [
  type,
  [book, 1, 1, 1, 2],
  [book, 1, 1, 1, 2],
  [book, 1, 1, 1, 2],
  2,
  "renumber",
  ["dataWarning"],
];

const report: DivergenceReport = {
  types: [
    { id: "VERSE0_TITLE", severity: 1, layer: "scheme" },
    { id: "BRIDGE", severity: 1, layer: "text" },
    { id: "RENUMBER", severity: 2, layer: "scheme" },
  ],
  comparisons: [
    {
      id: "a-b",
      a: "A",
      b: "B",
      mode: "schemes",
      note: "",
      books: [{ code: "GEN", name: "Genesis", section: "OT", a: [31, 25], b: [31, 25] }],
      events: [event(2, "GEN")],
      runs: [],
      warnings: { a: [], b: [], aCount: 0, bCount: 0 },
    },
  ],
  eventNotes: [[0, "a", "unequal_ranges", "ranges differ"]],
  org: { GEN: [31, 25] },
  catalog: [["GEN", "Genesis", "OT"]],
  sides: [],
  engineVersion: "1",
  computedAt: "",
};

describe("comparison index", () => {
  it("places a chapter event on that book's cell", () => {
    const index = buildIndex(report);
    const book = index.byCode.get("GEN");
    expect(book).toBeDefined();
    const state = cellState(
      index,
      book!,
      1,
      new Set(["scheme", "segment", "text", "canon"]),
    );
    expect(state.count).toBe(1);
    expect(state.severity).toBe(2);
    expect(state.warning).toBe(true);
    expect(cellState(index, book!, 2, new Set(["scheme"])).count).toBe(0);
  });

  it("moves the matrix focus to the next chapter", () => {
    const index = buildIndex(report);
    const targets = matrixTargets(visibleRows(index, new Set(["scheme"])));
    expect(moveFocus(targets, null, 0, 0)).toBe(0);
    expect(targets[moveFocus(targets, 0, 0, 1) ?? 0]?.chapter).toBe(2);
  });
});

describe("ladderWindow", () => {
  it("shows the whole axis at zoom 1 and a 400th of it at zoom 400", () => {
    expect(ladderWindow(800, 1)).toEqual([0, 800]);
    expect(ladderWindow(800, 400)).toEqual([0, 2]);
  });
});

describe("drawDotPlot", () => {
  it("returns without drawing when the canvas has no context", () => {
    const canvas = { getContext: () => null } as unknown as HTMLCanvasElement;
    expect(() =>
      drawDotPlot(canvas, () => {
        throw new Error("should not paint");
      }),
    ).not.toThrow();
  });
});
