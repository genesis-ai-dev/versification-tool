import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChartKey } from "./ChartKey";
import { buildIndex } from "./model/index";
import type { DivergenceReport } from "./types";

const report: DivergenceReport = {
  types: [
    { id: "CHAPTER_MOVE", severity: 4, layer: "scheme" },
    { id: "CROSS_BOOK", severity: 4, layer: "scheme" },
    { id: "ORDER_INVERSION", severity: 4, layer: "scheme" },
  ],
  comparisons: [
    {
      id: "a-b",
      a: "A",
      b: "B",
      mode: "schemes",
      note: "",
      books: [],
      events: [],
      runs: [],
      warnings: { a: [], b: [], aCount: 0, bCount: 0 },
    },
  ],
  eventNotes: [],
  org: {},
  catalog: [],
  sides: [],
  engineVersion: "1",
  computedAt: "",
};

const index = buildIndex(report);

const ITEMS = [
  "Same",
  "Less → more chapter deviance",
  "Event severity 1 to 4",
  "Chapter on one side only",
  "Approximate",
  "Data warning",
];

describe("ChartKey", () => {
  it("names the six chart marks and leaves the move items off", () => {
    render(<ChartKey index={index} showRibbons={false} />);
    for (const item of ITEMS) {
      expect(screen.getByText(item)).toBeInTheDocument();
    }
    expect(screen.queryByText("Cross-book move")).not.toBeInTheDocument();
  });

  it("adds the move items when the radial chart is showing", () => {
    render(<ChartKey index={index} showRibbons />);
    expect(screen.getByText("Chapter move")).toBeInTheDocument();
    expect(screen.getByText("Cross-book move")).toBeInTheDocument();
    expect(screen.getByText("Order inversion")).toBeInTheDocument();
  });
});
