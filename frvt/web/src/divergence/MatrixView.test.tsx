import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MatrixView } from "./MatrixView";
import { ACCENT, COUNT_DOT } from "./model/colors";
import { buildIndex } from "./model/index";
import type { DivergenceReport, EventRow } from "./types";

const approximate: EventRow = [
  0,
  ["GEN", 1, 1, 1, 2],
  ["GEN", 1, 1, 1, 2],
  ["GEN", 1, 1, 1, 2],
  2,
  "renumber",
  ["approximate"],
];

const report: DivergenceReport = {
  types: [{ id: "RENUMBER", severity: 2, layer: "scheme" }],
  comparisons: [
    {
      id: "a-b",
      a: "A",
      b: "B",
      mode: "schemes",
      note: "",
      books: [{ code: "GEN", name: "Genesis", section: "OT", a: [31, 25], b: [31, 25] }],
      events: [approximate],
      runs: [],
      warnings: { a: [], b: [], aCount: 0, bCount: 0 },
    },
  ],
  eventNotes: [],
  org: {},
  catalog: [["GEN", "Genesis", "OT"]],
  sides: [],
  engineVersion: "1",
  computedAt: "",
};

describe("MatrixView", () => {
  it("draws a dashed outline on an approximate chapter", () => {
    const { container } = render(
      <MatrixView
        index={buildIndex(report)}
        layersOn={new Set(["scheme"])}
        focus={null}
        onSelect={() => undefined}
      />,
    );
    expect(container.querySelector('rect[stroke-dasharray="2 1.6"]')).not.toBeNull();
  });

  it("draws a count dot on the chapter and the book when two events share a chapter", () => {
    const { container } = renderMatrix({
      ...report,
      comparisons: [{ ...comparison(), events: [approximate, approximate] }],
    });
    expect(container.querySelectorAll('circle[r="1.5"]')).toHaveLength(2);
  });

  it("draws the count dot in the dark color on a red cell", () => {
    const { container } = renderMatrix({
      ...report,
      comparisons: [
        {
          ...comparison(),
          books: [{ code: "GEN", name: "Genesis", section: "OT", a: [2], b: [2] }],
          events: [approximate, approximate],
        },
      ],
    });
    const dots = [...container.querySelectorAll("circle")];
    expect(dots).toHaveLength(2);
    expect(dots.every((dot) => dot.getAttribute("fill") === COUNT_DOT)).toBe(true);
  });

  it("draws the larger count dot when a chapter has five events", () => {
    const { container } = renderMatrix({
      ...report,
      comparisons: [
        { ...comparison(), events: Array.from({ length: 5 }, () => approximate) },
      ],
    });
    expect(container.querySelector('circle[r="2.3"]')).not.toBeNull();
  });

  it("labels a wrapped book row with its chapter range", () => {
    const chapters = Array.from({ length: 60 }, () => 1);
    const { container } = renderMatrix({
      ...report,
      comparisons: [
        {
          ...comparison(),
          books: [
            { code: "GEN", name: "Genesis", section: "OT", a: chapters, b: chapters },
          ],
        },
      ],
    });
    expect(container.textContent).toContain("51–60");
  });

  it("draws a warning corner on a chapter with a data warning", () => {
    const warning: EventRow = [
      approximate[0],
      approximate[1],
      approximate[2],
      approximate[3],
      approximate[4],
      approximate[5],
      ["dataWarning"],
    ];
    const { container } = renderMatrix({
      ...report,
      comparisons: [{ ...comparison(), events: [warning] }],
    });
    expect(container.querySelector("path")?.getAttribute("fill")).toBe(ACCENT);
  });
});

/** The first comparison of the fixture, which the extra cases vary. */
function comparison() {
  const found = report.comparisons[0];
  if (found === undefined) {
    throw new Error("comparison missing");
  }
  return found;
}

/** Render the matrix for one report. */
function renderMatrix(next: DivergenceReport) {
  return render(
    <MatrixView
      index={buildIndex(next)}
      layersOn={new Set(["scheme"])}
      focus={null}
      onSelect={() => undefined}
    />,
  );
}
