import { describe, expect, it } from "vitest";
import type { DivergenceReport, Span } from "../types";
import { buildIndex, type ComparisonIndex, type IndexedEvent } from "./index";
import {
  alignedOrigin,
  axisFor,
  initialLadderView,
  ladderWindow,
  panOrigin,
  runForEvent,
  runKey,
  runPlace,
  runSelectable,
  visibleChapters,
  wheelZoomFactor,
  zoomAround,
  type LadderAxis,
  type ScopedRun,
} from "./detail";

const layers = new Set(["scheme"]);

/** A renumbered run on Genesis. ``chapter`` selects the verse range. */
function run(type: string, chapter = 1): ScopedRun {
  const span: Span = ["GEN", chapter, 1, chapter, 2];
  return { a: span, o: span, b: span, type, flags: "", excludedA: "", excludedB: "" };
}

/** One indexed event with the same shape as ``run``. */
function event(index: number, chapter: number): IndexedEvent {
  const span: Span = ["GEN", chapter, 1, chapter, 2];
  return {
    index,
    type: "RENUMBER",
    severity: 2,
    layer: "scheme",
    a: span,
    o: span,
    b: span,
    n: 2,
    rel: "renumber",
    flags: [],
  };
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

describe("runKey", () => {
  it("encodes the type and spans, with a dash for a missing span", () => {
    const sample = run("RENUMBER");
    expect(runKey(sample)).toBe("RENUMBER|GEN:1:1:1:2|GEN:1:1:1:2|GEN:1:1:1:2");
    expect(runKey({ ...sample, a: ["GEN", 1, 3, 1, 4] })).not.toBe(runKey(sample));
    expect(runKey({ ...sample, o: null })).toBe("RENUMBER|GEN:1:1:1:2|-|GEN:1:1:1:2");
  });
});

describe("runForEvent", () => {
  it("returns the earliest overlapping run and skips a SAME run ahead of it", () => {
    const chapter = event(0, 1);
    const first = run("RENUMBER");
    const second = run("RENUMBER");
    const index = indexWith([chapter]);
    expect(runForEvent(index, [run("SAME"), first], chapter, layers)).toBe(first);
    expect(runForEvent(index, [first, second], chapter, layers)).toBe(first);
  });

  it("returns null when the only overlap is a SAME run or the spans miss", () => {
    const chapter = event(0, 1);
    const index = indexWith([chapter, event(1, 2)]);
    const missed = index.events[1];
    expect(missed).toBeDefined();
    expect(runForEvent(index, [run("SAME")], chapter, layers)).toBeNull();
    expect(runForEvent(index, [run("RENUMBER")], missed!, layers)).toBeNull();
  });
});

describe("ladderWindow", () => {
  it("clamps a zoomed window inside the axis and shows the whole axis at zoom 1", () => {
    expect(ladderWindow(800, 4, 100)).toEqual([100, 300]);
    expect(ladderWindow(800, 4, 700)).toEqual([600, 800]);
    expect(ladderWindow(800, 1, 50)).toEqual([0, 800]);
  });
});

describe("initialLadderView", () => {
  const axis = (length: number): LadderAxis => ({
    books: ["PSA"],
    length,
    ticks: [],
    position: (span) => span[2],
  });
  const placed = (type: string, verse: number): ScopedRun => ({
    a: ["PSA", 1, verse, 1, verse],
    o: null,
    b: null,
    type,
    flags: "",
    excludedA: "",
    excludedB: "",
  });

  it("opens a short book on the whole axis", () => {
    expect(initialLadderView(axis(500), [placed("RENUMBER", 40)])).toEqual({
      zoom: 1,
      origin: 0,
    });
  });

  it("opens a long book on a window before the first divergence", () => {
    expect(
      initialLadderView(axis(3000), [placed("RENUMBER", 600), placed("SAME", 100)]),
    ).toEqual({ zoom: 10, origin: 580 });
  });

  it("opens a long book with no divergence at the start of the axis", () => {
    expect(initialLadderView(axis(3000), [placed("SAME", 100)])).toEqual({
      zoom: 10,
      origin: 0,
    });
  });
});

describe("alignedOrigin", () => {
  it("keeps another axis on the same fraction of its length", () => {
    expect(alignedOrigin(400, 800, 100)).toBe(50);
    expect(alignedOrigin(800, 800, 100)).toBe(100);
    expect(alignedOrigin(400, 0, 10)).toBe(0);
  });
});

describe("panOrigin", () => {
  it("follows the pointer and stays inside the axis", () => {
    expect(panOrigin(800, 4, 100, 50, 2)).toBe(75);
    expect(panOrigin(800, 4, 100, -50, 2)).toBe(125);
    expect(panOrigin(800, 4, 0, 100, 2)).toBe(0);
    expect(panOrigin(800, 4, 700, -100, 2)).toBe(600);
  });
});

describe("zoomAround", () => {
  it("keeps the anchored verse in place and clamps the zoom", () => {
    expect(zoomAround(1000, { zoom: 1, origin: 0 }, 10, 0.5)).toEqual({
      zoom: 10,
      origin: 450,
    });
    expect(zoomAround(1000, { zoom: 10, origin: 450 }, 20, 0)).toEqual({
      zoom: 20,
      origin: 450,
    });
    expect(zoomAround(1000, { zoom: 10, origin: 450 }, 1000, 0.5).zoom).toBe(100);
  });
});

describe("wheelZoomFactor", () => {
  it("zooms in for a wheel away from the user and out for a wheel toward them", () => {
    expect(wheelZoomFactor(-100, 0, false)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100, 0, false)).toBeLessThan(1);
  });
});

describe("visibleChapters", () => {
  it("names the chapter that contains a window starting after the chapter tick", () => {
    const index = indexWith([]);
    const genesis = index.byCode.get("GEN");
    expect(genesis).toBeDefined();
    genesis!.a = [10, 10];
    const axis = axisFor(
      index,
      [run("RENUMBER")],
      "a",
      (code) => index.byCode.get(code)?.a,
    );
    expect(visibleChapters(axis, 5, 8)).toEqual({
      book: "GEN",
      first: 1,
      last: 1,
      endBook: "GEN",
    });
    expect(visibleChapters(axis, 5, 15)?.last).toBe(2);
    expect(visibleChapters(axis, -1, 5)).toBeNull();
  });
});

describe("runSelectable", () => {
  it("keeps a deviance and rejects an unchanged run", () => {
    expect(runSelectable(run("RENUMBER"))).toBe(true);
    expect(runSelectable(run("SAME"))).toBe(false);
  });
});

describe("runPlace", () => {
  it("names side A with the book name and repeats the end chapter", () => {
    expect(runPlace(indexWith([]), run("RENUMBER"))).toEqual({
      bookCode: "GEN",
      chapter: 1,
      title: "Genesis 1:1–1:2",
    });
    const single = run("RENUMBER");
    single.a = ["GEN", 21, 1, 21, 1];
    expect(runPlace(indexWith([]), single)?.title).toBe("Genesis 21:1");
  });

  it("uses side B when side A is missing and the book code when the book is unknown", () => {
    const sideB = run("RENUMBER");
    sideB.a = null;
    expect(runPlace(indexWith([]), sideB)?.bookCode).toBe("GEN");
    const unknown = run("RENUMBER");
    unknown.a = ["EXO", 21, 1, 21, 4];
    unknown.b = null;
    expect(runPlace(indexWith([]), unknown)).toEqual({
      bookCode: "EXO",
      chapter: 21,
      title: "EXO 21:1–21:4",
    });
    const empty = run("SAME");
    empty.a = null;
    empty.b = null;
    expect(runPlace(indexWith([]), empty)).toBeNull();
  });
});
