import { describe, expect, it } from "vitest";
import type { DivergenceReport, Span } from "../types";
import {
  dotMagnification,
  dotPlotLayout,
  nearestSegment,
  selectedDotKey,
  type DotPlotLayout,
  type DotSegment,
} from "./dotPlot";
import { runKey, type ScopedRun } from "./detail";
import { buildIndex, type ComparisonIndex, type IndexedEvent } from "./index";

/** A renumbered run on Genesis. ``chapter`` selects the verse range. */
function run(type: string, chapter = 1): ScopedRun {
  const span: Span = ["GEN", chapter, 1, chapter, 2];
  return { a: span, o: span, b: span, type, flags: "", excludedA: "", excludedB: "" };
}

/** Index whose events are the only data the run lookup reads. */
function indexWith(events: IndexedEvent[]): ComparisonIndex {
  const report: DivergenceReport = {
    types: [{ id: "RENUMBER", severity: 2, layer: "scheme" }],
    comparisons: [
      {
        id: "a-b",
        a: "A",
        b: "B",
        mode: "schemes",
        note: "",
        books: [{ code: "GEN", name: "Genesis", section: "OT", a: [31], b: [31] }],
        events: [],
        runs: [],
        warnings: { a: [], b: [], aCount: 0, bCount: 0 },
      },
    ],
    eventNotes: [],
    org: { GEN: [31] },
    catalog: [["GEN", "Genesis", "OT"]],
    sides: [],
    engineVersion: "1",
    computedAt: "",
  };
  return { ...buildIndex(report), events };
}

describe("nearestSegment", () => {
  const alongX: DotSegment = {
    key: "along",
    type: "RENUMBER",
    x0: 0,
    y0: 0,
    x1: 10,
    y1: 0,
  };
  const below: DotSegment = {
    key: "below",
    type: "RENUMBER",
    x0: 0,
    y0: 10,
    x1: 10,
    y1: 10,
  };

  it("hits a point on the segment and a point at the slop boundary", () => {
    expect(nearestSegment([alongX], 5, 0, 8)).toBe("along");
    expect(nearestSegment([alongX], 5, 8, 8)).toBe("along");
  });

  it("misses a point outside the slop and prefers the nearer segment", () => {
    expect(nearestSegment([alongX], 5, 8.1, 8)).toBeNull();
    expect(nearestSegment([alongX, below], 5, 7, 8)).toBe("below");
  });
});

describe("selectedDotKey", () => {
  const deviance: DotSegment = {
    key: "dev",
    type: "RENUMBER",
    x0: 0,
    y0: 6,
    x1: 10,
    y1: 6,
  };
  const unchanged: DotSegment = {
    key: "same",
    type: "SAME",
    x0: 0,
    y0: 0,
    x1: 10,
    y1: 0,
  };

  it("returns the nearest deviance", () => {
    expect(selectedDotKey(strokes([unchanged, deviance]), 5, 6, 8)).toBe("dev");
  });

  it("returns null when the nearer stroke is unchanged, even if a deviance is inside the slop", () => {
    expect(selectedDotKey(strokes([unchanged, deviance]), 5, 0, 8)).toBeNull();
    expect(nearestSegment([unchanged, deviance], 5, 0, 8)).toBe("same");
  });
});

/**
 * Assert a drawn tick lies fully inside a square canvas of ``size``.
 * A failure names the edge that left the canvas.
 */
function expectInsideCanvas(
  rect: readonly [number, number, number, number],
  size: number,
): void {
  const [x, y, width, height] = rect;
  expect(x).toBeGreaterThanOrEqual(0);
  expect(y).toBeGreaterThanOrEqual(0);
  expect(x + width).toBeLessThanOrEqual(size);
  expect(y + height).toBeLessThanOrEqual(size);
}

/**
 * Assert the center of the drawn tick lies inside its click rectangle.
 * A click on the visible bar then selects that run.
 */
function expectCenterInHit(
  rect: readonly [number, number, number, number],
  hit: readonly [number, number, number, number],
): void {
  const [x, y, width, height] = rect;
  const [left, top, hitWidth, hitHeight] = hit;
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  expect(centerX).toBeGreaterThanOrEqual(left);
  expect(centerX).toBeLessThanOrEqual(left + hitWidth);
  expect(centerY).toBeGreaterThanOrEqual(top);
  expect(centerY).toBeLessThanOrEqual(top + hitHeight);
}

/** Layout whose only content is the given strokes. */
function strokes(segments: DotSegment[]): DotPlotLayout {
  return { segments, ticks: [], diagonal: [0, 0, 0, 0], magnification: 1 };
}

describe("dotPlotLayout", () => {
  it("returns one stroke for a run with both sides", () => {
    const sample = run("RENUMBER");
    const segments = dotPlotLayout([sample], indexWith([]), false, 120).segments;
    expect(segments).toHaveLength(1);
    expect(segments[0]?.key).toBe(runKey(sample));
  });

  it("draws a margin tick for a run that is missing side B", () => {
    const size = 120;
    const sample = { ...run("RENUMBER"), b: null };
    const layout = dotPlotLayout([sample], indexWith([]), false, size);
    expect(layout.segments).toEqual([]);
    expect(layout.ticks).toHaveLength(1);
    const tick = layout.ticks[0];
    expect(tick).toBeDefined();
    const [x, y, width, height] = tick!.rect;
    expect(y).toBe(size - 11);
    expect(height).toBe(6);
    expectInsideCanvas(tick!.rect, size);
    expectCenterInHit(tick!.rect, tick!.hit);
    expect(selectedDotKey(layout, x + width / 2, y + height / 2, 8)).toBe(tick!.key);
  });

  it("draws a left margin tick for a run that is missing side A", () => {
    const size = 120;
    const sample = { ...run("RENUMBER"), a: null };
    const layout = dotPlotLayout([sample], indexWith([]), false, size);
    const tick = layout.ticks[0];
    expect(tick).toBeDefined();
    const [x, , width] = tick!.rect;
    expect(x).toBe(2);
    expect(width).toBe(6);
    expectInsideCanvas(tick!.rect, size);
    expectCenterInHit(tick!.rect, tick!.hit);
  });

  it("ignores a margin tick whose run is unchanged", () => {
    const sample = { ...run("SAME"), b: null };
    const layout = dotPlotLayout([sample], indexWith([]), false, 120);
    const tick = layout.ticks[0];
    expect(tick).toBeDefined();
    const [x, y, width, height] = tick!.rect;
    expect(selectedDotKey(layout, x + width / 2, y + height / 2, 8)).toBeNull();
  });
});

describe("dotMagnification", () => {
  const psalm: DivergenceReport = {
    types: [{ id: "RENUMBER", severity: 2, layer: "scheme" }],
    comparisons: [
      {
        id: "a-b",
        a: "A",
        b: "B",
        mode: "schemes",
        note: "",
        books: [{ code: "PSA", name: "Psalms", section: "OT", a: [99], b: [99] }],
        events: [],
        runs: [],
        warnings: { a: [], b: [], aCount: 0, bCount: 0 },
      },
    ],
    eventNotes: [],
    org: { PSA: [99] },
    catalog: [["PSA", "Psalms", "OT"]],
    sides: [],
    engineVersion: "1",
    computedAt: "",
  };

  it("magnifies a two-verse offset in a 99-verse chapter by 15", () => {
    const offset = run("RENUMBER");
    offset.a = ["PSA", 1, 1, 1, 1];
    offset.b = ["PSA", 1, 3, 1, 3];
    expect(dotMagnification([offset], buildIndex(psalm))).toBe(15);
  });

  it("stays at 1 when the sides have no offset", () => {
    const aligned = run("RENUMBER");
    aligned.a = ["PSA", 1, 1, 1, 1];
    aligned.b = ["PSA", 1, 1, 1, 1];
    expect(dotMagnification([aligned], buildIndex(psalm))).toBe(1);
  });
});
