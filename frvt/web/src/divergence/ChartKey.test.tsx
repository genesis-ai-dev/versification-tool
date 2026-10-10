import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChartKey, SeverityKey } from "./ChartKey";
import { COUNT_DOT, MUTED } from "./model/colors";
import {
  COUNT_DOT_LARGE_FROM,
  COUNT_DOT_SMALL_FROM,
  MATRIX,
  buildIndex,
  countDotRadius,
} from "./model/index";
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
  "Single-sided chapters",
  "Approximate",
  "Data warning",
];

describe("ChartKey", () => {
  it("names the chart marks and leaves the move items off", () => {
    render(<ChartKey index={index} showRibbons={false} />);
    for (const item of ITEMS) {
      expect(screen.getByText(item)).toBeInTheDocument();
    }
    expect(screen.queryByText("Cross-book move")).not.toBeInTheDocument();
    expect(screen.queryByText("Deviance severity (1-4)")).not.toBeInTheDocument();
  });

  it("explains the two count dots between the deviance scale and single-sided chapters", () => {
    render(<ChartKey index={index} showRibbons={false} />);
    const labels = screen.getAllByRole("listitem").map((item) => item.textContent ?? "");
    const deviance = labels.findIndex((label) =>
      label.includes("Less → more chapter deviance"),
    );
    const deviances = labels.findIndex((label) => label.includes("Deviances:"));
    const single = labels.findIndex((label) => label.includes("Single-sided chapters"));
    expect(deviances).toBe(deviance + 1);
    expect(single).toBe(deviances + 1);
    expect(labels[deviances]).toContain("small dot");
    expect(labels[deviances]).toContain("large dot");
    expect(screen.getByText("Deviances:")).toBeInTheDocument();
    expect(
      screen.getByText(`= ${COUNT_DOT_SMALL_FROM}–${COUNT_DOT_LARGE_FROM - 1},`),
    ).toBeInTheDocument();
    expect(screen.getByText(`= ${COUNT_DOT_LARGE_FROM}+`)).toBeInTheDocument();
    expect(screen.queryByText("Chapter on one side only")).not.toBeInTheDocument();

    const item = screen.getAllByRole("listitem")[deviances];
    const circles = [...item.querySelectorAll("circle")];
    expect(circles).toHaveLength(2);
    const scale = 14 / MATRIX.cell;
    expect(Number(circles[0].getAttribute("r"))).toBeCloseTo(
      (countDotRadius(COUNT_DOT_SMALL_FROM) ?? 0) * scale,
    );
    expect(Number(circles[1].getAttribute("r"))).toBeCloseTo(
      (countDotRadius(COUNT_DOT_LARGE_FROM) ?? 0) * scale,
    );
    expect(circles.every((circle) => circle.getAttribute("fill") === COUNT_DOT)).toBe(
      true,
    );
    const squares = [...item.querySelectorAll("rect")];
    expect(squares).toHaveLength(2);
    expect(squares.every((square) => square.getAttribute("fill") === MUTED)).toBe(true);
  });

  it("adds the move items when the radial chart is showing", () => {
    render(<ChartKey index={index} showRibbons />);
    const labels = screen.getAllByRole("listitem").map((item) => item.textContent ?? "");
    const warning = labels.findIndex((label) => label.includes("Data warning"));
    const chapterMove = labels.findIndex((label) => label.includes("Chapter move"));
    expect(screen.getByText("Chapter move")).toBeInTheDocument();
    expect(screen.getByText("Cross-book move")).toBeInTheDocument();
    expect(screen.getByText("Order inversion")).toBeInTheDocument();
    expect(screen.getByText("Deviances:")).toBeInTheDocument();
    expect(screen.getByText("Single-sided chapters")).toBeInTheDocument();
    expect(screen.queryByText("Deviance severity (1-4)")).not.toBeInTheDocument();
    expect(chapterMove).toBe(warning + 1);
  });
});

describe("SeverityKey", () => {
  it("names event severity and leaves the other marks off", () => {
    render(<SeverityKey />);
    expect(screen.getByText("Deviance severity (1-4)")).toBeInTheDocument();
    expect(screen.queryByText("Same")).not.toBeInTheDocument();
    expect(screen.queryByText("Deviances:")).not.toBeInTheDocument();
    expect(screen.queryByText("Single-sided chapters")).not.toBeInTheDocument();
    expect(screen.queryByText("Chapter move")).not.toBeInTheDocument();
  });
});
