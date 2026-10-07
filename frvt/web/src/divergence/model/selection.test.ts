import { describe, expect, it } from "vitest";
import type { DivergenceReport, RunRow, Span } from "../types";
import { buildIndex, type ComparisonIndex, type IndexedEvent } from "./index";
import { runKey, type ScopedRun } from "./detail";
import {
  eventSelection,
  hoverSelection,
  pickEvent,
  pickRun,
  pinnedEvent,
  type DetailPick,
  type PickContext,
} from "./selection";

const gen: Span = ["GEN", 1, 1, 1, 2];
const exo: Span = ["EXO", 2, 3, 2, 4];

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
        books: [
          { code: "GEN", name: "Genesis", section: "OT", a: [31], b: [31] },
          { code: "EXO", name: "Exodus", section: "OT", a: [22], b: [22] },
        ],
        events: [],
        runs: [],
        warnings: { a: [], b: [], aCount: 0, bCount: 0 },
      },
    ],
    eventNotes: [],
    org: { GEN: [31], EXO: [22] },
    catalog: [
      ["GEN", "Genesis", "OT"],
      ["EXO", "Exodus", "OT"],
    ],
    sides: [],
    engineVersion: "1",
    computedAt: "",
  };
  return { ...buildIndex(report), events };
}

function event(index: number, a: Span | null, b: Span | null): IndexedEvent {
  return {
    index,
    type: "RENUMBER",
    severity: 2,
    layer: "scheme",
    a,
    o: a,
    b,
    n: 2,
    rel: "renumber",
    flags: [],
  };
}

function run(type: string, span: Span = gen): ScopedRun {
  return { a: span, o: span, b: span, type, flags: "", excludedA: "", excludedB: "" };
}

function context(index: ComparisonIndex, runs: RunRow[] = []): PickContext {
  return { index, runs, layersOn: new Set(["scheme"]), book: "GEN" };
}

const cleared: DetailPick = { runKey: null, pin: null };

describe("eventSelection", () => {
  it("prefers the span in the given book and records the event", () => {
    const index = indexWith([event(0, gen, exo)]);
    const chosen = index.events[0];
    expect(chosen).toBeDefined();
    expect(eventSelection(index, chosen!, "EXO")).toEqual({
      bookCode: "EXO",
      chapter: 2,
      summary: false,
      verseLabel: "Exodus 2:3–2:4",
      eventIndex: 0,
    });
  });
});

describe("pickRun", () => {
  it("pins a new run and clears it on the next click of the same key", () => {
    const sample = run("RENUMBER");
    const index = indexWith([event(0, gen, gen)]);
    const row: RunRow = [gen, gen, gen, 0, "", "", ""];
    const first = pickRun(context(index, [row]), cleared, runKey(sample));
    expect(first?.runKey).toBe(runKey(sample));
    expect(first?.pin?.eventIndex).toBe(0);
    expect(pickRun(context(index, [row]), first!, runKey(sample))).toEqual(cleared);
  });

  it("leaves the highlight unchanged for an unchanged run", () => {
    const index = indexWith([]);
    const row: RunRow = [gen, gen, gen, -1, "", "", ""];
    expect(pickRun(context(index, [row]), cleared, runKey(run("SAME")))).toBeNull();
  });
});

describe("pickEvent", () => {
  it("pins an event that has no run, and clears it on the next click", () => {
    const index = indexWith([event(0, gen, gen)]);
    const chosen = index.events[0];
    expect(chosen).toBeDefined();
    const first = pickEvent(context(index), cleared, chosen!);
    expect(first.runKey).toBeNull();
    expect(first.pin?.eventIndex).toBe(0);
    expect(pickEvent(context(index), first, chosen!)).toEqual(cleared);
  });
});

describe("hoverSelection", () => {
  it("returns null for an unchanged run and the event for a deviance", () => {
    const index = indexWith([event(0, gen, gen)]);
    const same: RunRow = [gen, gen, gen, -1, "", "", ""];
    const moved: RunRow = [gen, gen, gen, 0, "", "", ""];
    expect(hoverSelection(context(index, [same]), runKey(run("SAME")))).toBeNull();
    expect(
      hoverSelection(context(index, [moved]), runKey(run("RENUMBER")))?.eventIndex,
    ).toBe(0);
  });
});

describe("pinnedEvent", () => {
  it("returns null when the event's layer is switched off", () => {
    const index = indexWith([event(0, gen, gen)]);
    expect(
      pinnedEvent(
        index,
        { bookCode: "GEN", chapter: 1, summary: false, eventIndex: 0 },
        new Set(),
      ),
    ).toBeNull();
  });
});
